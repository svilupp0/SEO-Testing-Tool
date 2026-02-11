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

import type { PrismaClient } from '../generated/prisma/client.js';
import { prisma as defaultPrisma } from '../database/prisma.js';
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
  prisma?: PrismaClient;
  gscFetcher?: GSCDataFetcher;
  statisticalEngine?: StatisticalEngine;
  timeSeriesService?: TimeSeriesService;
  notificationService?: NotificationService;
  tokenManager?: TokenManager;
}

export class SEOExperimentOrchestrator {
  private prisma: PrismaClient;
  private gscFetcher: GSCDataFetcher;
  private statisticalEngine: StatisticalEngine;
  private timeSeriesService: TimeSeriesService;
  private notificationService: NotificationService;
  private tokenManager: TokenManager;

  constructor(deps?: OrchestratorDeps) {
    this.prisma = (deps?.prisma ?? defaultPrisma) as PrismaClient;
    this.gscFetcher = deps?.gscFetcher ?? new GSCDataFetcher();
    this.statisticalEngine = deps?.statisticalEngine ?? new StatisticalEngine();
    this.timeSeriesService = deps?.timeSeriesService ?? new TimeSeriesService(deps?.prisma);
    this.notificationService = deps?.notificationService ?? new NotificationService();
    this.tokenManager = deps?.tokenManager ?? new TokenManager({ clientId: '', clientSecret: '' });
  }

  /**
   * Esegue il flusso completo per un singolo esperimento SEO.
   */
  async runExperiment(testId: string): Promise<ExperimentResult> {
    // 1. Carica test dal database
    const test = await (this.prisma as any).test.findUnique({
      where: { id: testId },
      include: { metrics: { orderBy: { date: 'asc' } }, user: true },
    });

    if (!test) {
      throw new Error(`Test ${testId} non trovato.`);
    }

    if (test.status !== 'running') {
      throw new Error(`Test ${testId} non è in esecuzione (stato: ${test.status}).`);
    }

    // 2. Ottieni access token
    const tokenResult = await this.tokenManager.getValidAccessToken(test.userId);
    if (!tokenResult.success || !tokenResult.token) {
      await this.updateTestStatus(testId, 'failed', test.userId);
      throw new Error(`Token non valido per utente ${test.userId}: ${tokenResult.error}`);
    }

    // 3. Fetch nuovi dati da GSC
    const today = new Date().toISOString().split('T')[0];
    const startDateStr = test.startDate.toISOString().split('T')[0];

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
    const allMetrics = await (this.prisma as any).metric.findMany({
      where: { testId },
      orderBy: { date: 'asc' },
    });

    // 6. Dividi metriche in before/after alla splitDate
    const splitTime = test.splitDate.getTime();
    const beforeMetrics = allMetrics.filter((m: any) => m.date.getTime() < splitTime);
    const afterMetrics = allMetrics.filter((m: any) => m.date.getTime() >= splitTime);

    const beforeClicks = beforeMetrics.map((m: any) => m.clicks);
    const afterClicks = afterMetrics.map((m: any) => m.clicks);

    // 7. Esegui analisi statistica
    const analysisResult = this.statisticalEngine.analyze({
      before: beforeClicks,
      after: afterClicks,
    });

    // 8. Determina nuovo stato
    const newStatus = analysisResult.isSignificant ? 'completed' : 'running';

    // 9. Aggiorna test nel database
    await (this.prisma as any).test.update({
      where: { id: testId },
      data: {
        lastSyncAt: new Date(),
        lastPValue: analysisResult.pValue,
        lastImprovement: analysisResult.percentageChange,
        status: newStatus,
      },
    });

    // 10. Registra nell'audit log
    await (this.prisma as any).auditLog.create({
      data: {
        testId,
        action: 'experiment_synced',
        userId: test.userId,
      },
    });

    // 11. Gestisci notifiche (solo se significativo)
    let notificationSent = false;
    if (analysisResult.isSignificant && test.user?.email) {
      const testResult = {
        testId,
        testName: test.name,
        pValue: analysisResult.pValue,
        improvement: analysisResult.percentageChange / 100,
        confidenceLevel: 1 - analysisResult.pValue,
        metricType: 'clicks',
        userId: test.userId,
        userEmail: test.user.email,
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
    const activeTests = await (this.prisma as any).test.findMany({
      where: { status: 'running' },
    });

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
    await (this.prisma as any).test.update({
      where: { id: testId },
      data: { status },
    });

    await (this.prisma as any).auditLog.create({
      data: {
        testId,
        action: `status_changed_to_${status}`,
        userId,
      },
    });
  }
}
