/**
 * URLMonitoringService
 *
 * Monitora redirect e cambiamenti URL durante i test:
 * - Rilevamento redirect 301/302
 * - Tracking migrazioni URL
 * - Storia redirect per analisi
 */

interface GSCData {
  url: string;
  hasRedirect?: boolean;
  redirectTarget?: string;
  redirectType?: number;
  clicks?: number;
  impressions?: number;
}

interface RedirectDetection {
  hasRedirect: boolean;
  redirectTarget?: string;
  redirectType?: number;
  detectedAt: Date;
}

interface MigrationPlan {
  oldUrl: string;
  newUrl: string;
  estimatedImpact: {
    affectedTests: number;
    dataLoss: number;
  };
  recommendations: string[];
}

interface RedirectHistory {
  testId: string;
  redirectChain: Array<{
    from: string;
    to: string;
    type: number;
    detectedAt: Date;
  }>;
}

interface AlertConfig {
  enabled: boolean;
  notifyOnRedirect: boolean;
}

export class URLMonitoringService {
  private redirectHistory: Map<string, RedirectHistory> = new Map();
  private alertConfig: AlertConfig = {
    enabled: true,
    notifyOnRedirect: true,
  };

  /**
   * Test 7.1 - Rileva redirect durante il test
   */
  async checkForRedirects(testId: string, gscData: GSCData): Promise<RedirectDetection> {
    const detection: RedirectDetection = {
      hasRedirect: gscData.hasRedirect || false,
      detectedAt: new Date(),
    };

    if (gscData.hasRedirect) {
      detection.redirectTarget = gscData.redirectTarget;
      detection.redirectType = gscData.redirectType;

      // Salva nella storia (come array)
      await this.saveRedirectHistory(testId, [
        {
          from: gscData.url,
          to: gscData.redirectTarget!,
          type: gscData.redirectType!,
          detectedAt: detection.detectedAt,
        },
      ]);
    }

    return detection;
  }

  /**
   * Test 7.1 - Salva storia redirect
   */
  async saveRedirectHistory(
    testId: string,
    redirects: Array<{ from: string; to: string; type: number; date?: string; detectedAt?: Date }>
  ): Promise<void> {
    const history = this.redirectHistory.get(testId) || {
      testId,
      redirectChain: [],
    };

    for (const redirect of redirects) {
      history.redirectChain.push({
        from: redirect.from,
        to: redirect.to,
        type: redirect.type,
        detectedAt: redirect.detectedAt || new Date(),
      });
    }

    this.redirectHistory.set(testId, history);
  }

  /**
   * Test 7.1 - Recupera storia redirect (come array)
   */
  async getRedirectHistory(testId: string): Promise<Array<{ from: string; to: string; type: number }>> {
    const history = this.redirectHistory.get(testId);
    if (!history) return [];

    return history.redirectChain.map(r => ({
      from: r.from,
      to: r.to,
      type: r.type,
    }));
  }

  /**
   * Test 7.1 - Gestisce redirect (sospende per 301, continua per 302)
   */
  async handleRedirect(
    testId: string,
    originalUrl: string,
    redirectInfo: { hasRedirect: boolean; redirectTarget?: string; redirectType: number }
  ): Promise<{
    testStatus: string;
    reason?: string;
    requiresUserAction?: boolean;
    urlToTrack?: string;
  }> {
    if (!redirectInfo.hasRedirect) {
      return { testStatus: 'running' };
    }

    // Redirect 301 = permanente → sospendi e chiedi conferma utente
    if (redirectInfo.redirectType === 301) {
      return {
        testStatus: 'suspended',
        reason: 'redirect_detected',
        requiresUserAction: true,
      };
    }

    // Redirect 302 = temporaneo → continua su URL originale
    if (redirectInfo.redirectType === 302) {
      return {
        testStatus: 'running',
        urlToTrack: originalUrl,
      };
    }

    return { testStatus: 'running' };
  }

  /**
   * Test 7.1 - Genera messaggio per utente su redirect
   */
  async generateRedirectMessage(
    testId: string,
    originalUrl: string,
    redirectInfo: { hasRedirect: boolean; redirectTarget?: string; redirectType: number }
  ): Promise<string> {
    let message = `⚠️ URL reindirizzato\n\n`;
    message += `Il tuo test sta tracciando:\n${originalUrl}\n\n`;
    message += `Ma questo URL è stato reindirizzato a:\n${redirectInfo.redirectTarget}\n\n`;
    message += `Vuoi continuare il test sul nuovo URL?\n`;
    return message;
  }

  /**
   * Test 7.1 - Migra test a nuovo URL (o termina se utente rifiuta)
   */
  async migrateTestToNewUrl(
    testId: string,
    originalUrl: string,
    newUrl: string,
    userAccepts: boolean
  ): Promise<{
    testUrl?: string;
    testStatus: string;
    migrated: boolean;
    oldUrl?: string;
    reason?: string;
  }> {
    if (userAccepts) {
      return {
        testUrl: newUrl,
        testStatus: 'running',
        migrated: true,
        oldUrl: originalUrl,
      };
    } else {
      return {
        testStatus: 'terminated',
        reason: 'user_declined_migration',
        migrated: false,
      };
    }
  }

  /**
   * Test 7.1 - Suggerisce migrazione URL
   */
  async suggestMigration(testId: string, oldUrl: string, newUrl: string): Promise<MigrationPlan> {
    // Simula analisi impatto
    const affectedTests = 1;
    const dataLoss = 0;

    const recommendations: string[] = [
      'Aggiorna URL test con il nuovo URL',
      'Mantieni dati storici associati al vecchio URL',
    ];

    if (dataLoss > 0) {
      recommendations.push('⚠️ Alcuni dati storici potrebbero andare persi');
    }

    return {
      oldUrl,
      newUrl,
      estimatedImpact: {
        affectedTests,
        dataLoss,
      },
      recommendations,
    };
  }

  /**
   * Test 7.1 - Distingue 301 (permanente) da 302 (temporaneo)
   */
  async classifyRedirect(redirectType: number): Promise<{
    type: 'permanent' | 'temporary';
    shouldMigrate: boolean;
    recommendation: string;
  }> {
    if (redirectType === 301) {
      return {
        type: 'permanent',
        shouldMigrate: true,
        recommendation: 'Redirect permanente - Aggiorna URL test',
      };
    } else if (redirectType === 302) {
      return {
        type: 'temporary',
        shouldMigrate: false,
        recommendation: 'Redirect temporaneo - Continua monitoraggio',
      };
    }

    return {
      type: 'temporary',
      shouldMigrate: false,
      recommendation: 'Tipo redirect sconosciuto',
    };
  }

  /**
   * Test 7.1 - Invia alert quando rileva redirect
   */
  async sendRedirectAlert(testId: string, detection: RedirectDetection): Promise<boolean> {
    if (!this.alertConfig.enabled || !this.alertConfig.notifyOnRedirect) {
      return false;
    }

    if (!detection.hasRedirect) {
      return false;
    }

    // Qui invieremmo realmente l'alert
    return true;
  }

  /**
   * Test 7.1 - Conta redirect nel test
   */
  async countRedirects(testId: string): Promise<number> {
    const history = this.redirectHistory.get(testId);
    return history ? history.redirectChain.length : 0;
  }
}
