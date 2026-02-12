/**
 * SEOExperimentOrchestrator
 *
 * Orchestra il flusso completo di un esperimento SEO:
 * - Fetch dati da GSC tramite GSCDataFetcher
 * - Salvataggio dati tramite TimeSeriesService
 * - Analisi statistica tramite StatisticalEngine
 * - Aggiornamento stato test nel database
 * - Notifiche tramite NotificationService
 * - Audit logging per tracciabilità
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb, type DrizzleDB } from '../database/db.js';
import { tests, metrics, auditLogs, users } from '../database/schema.js';
import { GSCDataFetcher } from '../gsc/GSCDataFetcher.js';
import { StatisticalEngine } from '../stats/StatisticalEngine.js';
import { TimeSeriesService } from '../database/TimeSeriesService.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { TokenManager } from '../auth/TokenManager.js';

export interface ExperimentResult {
  testId: string;
  status: 'updated' | 'completed' | 'insufficient_data' | 'error';
  pValue: number | null;
  percentageChange: number | null;
  isSignificant: boolean;
  message: string;
  dataPointsBefore: number;
  dataPointsAfter: number;
  notificationSent: boolean;
}

export interface SyncResult {
  totalTests: number;
  successCount: number;
  errorCount: number;
  results: ExperimentResult[];
  errors: Array<{ testId: string; error: string }>;
}

export interface OrchestratorDeps {
  db?: DrizzleDB;
  gscFetcher?: GSCDataFetcher;
  statisticalEngine?: StatisticalEngine;
  timeSeriesService?: TimeSeriesService;
  notificationService?: NotificationService;
  tokenManager?: TokenManager;
}

export class SEOExperimentOrchestrator {
  private db: DrizzleDB;
  private gscFetcher: GSCDataFetcher;
  private statisticalEngine: StatisticalEngine;
  private timeSeriesService: TimeSeriesService;
  private notificationService: NotificationService;
  private tokenManager: TokenManager;

  constructor(deps?: OrchestratorDeps) {
    this.db = deps?.db ?? defaultDb;
    this.gscFetcher = deps?.gscFetcher ?? new GSCDataFetcher();
    this.statisticalEngine = deps?.statisticalEngine ?? new StatisticalEngine();
    this.timeSeriesService = deps?.timeSeriesService ?? new TimeSeriesService(deps?.db);
    this.notificationService = deps?.notificationService ?? new NotificationService();
    this.tokenManager = deps?.tokenManager ?? new TokenManager({ clientId: '', clientSecret: '' });
  }

  /**
   * Esegue il flusso completo per un singolo esperimento SEO.
   */
  async runExperiment(testId: string): Promise<ExperimentResult> {
    // 1. Carica test dal database
    const test = this.db
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();

    if (!test) {
      throw new Error(`Test ${testId} non trovato.`);
    }

    if (test.status !== 'running') {
      throw new Error(`Test ${testId} non è in esecuzione (stato: ${test.status}).`);
    }

    // Carica user per email notifica
    const user = this.db
      .select()
      .from(users)
      .where(eq(users.id, test.userId))
      .get();

    // 2. Ottieni access token
    const tokenResult = await this.tokenManager.getValidAccessToken(test.userId);
    if (!tokenResult.success || !tokenResult.token) {
      await this.updateTestStatus(testId, 'failed', test.userId);
      throw new Error(`Token non valido per utente ${test.userId}: ${tokenResult.error}`);
    }

    // 3. Fetch nuovi dati da GSC
    const today = new Date().toISOString().split('T')[0];
    const startDateStr = test.startDate.split('T')[0];

    const gscData = await this.gscFetcher.fetchSearchAnalytics(
      tokenResult.token,
      test.siteUrl,
      { startDate: startDateStr, endDate: today },
    );

    // 4. Salva nuovi dati nel database
    if (gscData.rows && gscData.rows.length > 0) {
      const timeSeriesData = gscData.rows.map((row: any) => ({
        date: row.date || row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
      }));
      await this.timeSeriesService.saveData(testId, timeSeriesData);
    }

    // 5. Ricarica tutte le metriche dal database (incluse le nuove)
    const allMetrics = this.db
      .select()
      .from(metrics)
      .where(eq(metrics.testId, testId))
      .orderBy(metrics.date)
      .all();

    // 6. Dividi metriche in before/after alla splitDate
    const splitDateStr = test.splitDate;
    const beforeMetrics = allMetrics.filter((m) => m.date < splitDateStr);
    const afterMetrics = allMetrics.filter((m) => m.date >= splitDateStr);

    const beforeClicks = beforeMetrics.map((m) => m.clicks);
    const afterClicks = afterMetrics.map((m) => m.clicks);

    // 7. Esegui analisi statistica
    const analysisResult = this.statisticalEngine.analyze({
      before: beforeClicks,
      after: afterClicks,
    });

    // 8. Determina nuovo stato
    const newStatus = analysisResult.isSignificant ? 'completed' : 'running';

    // 9. Aggiorna test nel database
    this.db
      .update(tests)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastPValue: analysisResult.pValue,
        lastImprovement: analysisResult.percentageChange,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tests.id, testId))
      .run();

    // 10. Registra nell'audit log
    this.db
      .insert(auditLogs)
      .values({
        testId,
        action: 'experiment_synced',
        userId: test.userId,
      })
      .run();

    // 11. Gestisci notifiche (solo se significativo)
    let notificationSent = false;
    if (analysisResult.isSignificant && user?.email) {
      const testResult = {
        testId,
        testName: test.name,
        pValue: analysisResult.pValue,
        improvement: analysisResult.percentageChange / 100,
        confidenceLevel: 1 - analysisResult.pValue,
        metricType: 'clicks',
        userId: test.userId,
        userEmail: user.email,
      };

      const sendResult = await this.notificationService.sendVictoryAlert(testResult);
      notificationSent = sendResult.sent;
    }

    // 12. Restituisci risultato
    return {
      testId,
      status: analysisResult.hasInsufficientData
        ? 'insufficient_data'
        : analysisResult.isSignificant
          ? 'completed'
          : 'updated',
      pValue: analysisResult.pValue,
      percentageChange: analysisResult.percentageChange,
      isSignificant: analysisResult.isSignificant,
      message: analysisResult.message,
      dataPointsBefore: beforeClicks.length,
      dataPointsAfter: afterClicks.length,
      notificationSent,
    };
  }

  /**
   * Sincronizza tutti i test con status 'running'.
   * Resiliente: se un test fallisce, logga l'errore e continua.
   */
  async syncAllActiveTests(): Promise<SyncResult> {
    const activeTests = this.db
      .select()
      .from(tests)
      .where(eq(tests.status, 'running'))
      .all();

    const results: ExperimentResult[] = [];
    const errors: Array<{ testId: string; error: string }> = [];

    for (const test of activeTests) {
      try {
        const result = await this.runExperiment(test.id);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        errors.push({ testId: test.id, error: errorMessage });
      }
    }

    return {
      totalTests: activeTests.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors,
    };
  }

  /**
   * Aggiorna lo stato di un test e registra nel log.
   */
  private async updateTestStatus(testId: string, status: string, userId: string): Promise<void> {
    this.db
      .update(tests)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(tests.id, testId))
      .run();

    this.db
      .insert(auditLogs)
      .values({
        testId,
        action: `status_changed_to_${status}`,
        userId,
      })
      .run();
  }
}
