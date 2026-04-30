/**
 * NotificationService
 *
 * Gestisce l'invio di notifiche agli utenti:
 * - Alert per test statisticamente significativi
 * - Digest settimanali per utenti con test multipli
 * - Prevenzione alert fatigue
 */

interface TestResult {
  testId: string;
  testName: string;
  pValue: number;
  improvement: number;
  confidenceLevel: number;
  metricType: string;
  userId: string;
  userEmail: string;
}

interface ActiveTest {
  testId: string;
  testName: string;
  status: string;
  daysRunning: number;
  currentProgress: {
    pValue: number;
    improvement: number;
    confidenceLevel: number;
  };
}

interface WeeklyDigest {
  tests: ActiveTest[];
  userEmail: string;
  subject: string;
  body: string;
}

interface SendResult {
  sent: boolean;
  reason?: string;
}

export class NotificationService {
  private notificationsSent: Set<string> = new Set();
  private webhookUrl: string | undefined;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl ?? process.env.NOTIFICATION_WEBHOOK_URL;
  }

  /**
   * Invia payload JSON al webhook configurato.
   * Ritorna true se inviato, false se nessun webhook configurato o errore.
   */
  private async sendWebhook(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test 6.1 - Determina se inviare alert vittoria
   */
  async shouldSendVictoryAlert(testResult: TestResult): Promise<boolean> {
    // Regola 1: p-value deve essere < 0.05 (statisticamente significativo)
    if (testResult.pValue >= 0.05) {
      return false;
    }

    // Regola 2: Miglioramento deve essere >= 5% (evita alert fatigue per miglioramenti minimi)
    if (testResult.improvement < 0.05) {
      return false;
    }

    return true;
  }

  /**
   * Test 6.1 - Invia alert vittoria
   */
  async sendVictoryAlert(testResult: TestResult): Promise<SendResult> {
    // Previeni invio duplicati
    const notificationKey = `victory-${testResult.testId}`;

    if (this.notificationsSent.has(notificationKey)) {
      return {
        sent: false,
        reason: 'already_notified',
      };
    }

    // Verifica se deve inviare
    const shouldSend = await this.shouldSendVictoryAlert(testResult);

    if (!shouldSend) {
      return {
        sent: false,
        reason: 'not_significant',
      };
    }

    // Marca come inviata
    this.notificationsSent.add(notificationKey);

    const improvement = Math.round(testResult.improvement * 100);
    await this.sendWebhook({
      event: 'victory_alert',
      testId: testResult.testId,
      testName: testResult.testName,
      text: `🎉 Test "${testResult.testName}" significativo! +${improvement}% (p=${testResult.pValue.toFixed(4)})`,
      pValue: testResult.pValue,
      improvement: testResult.improvement,
      confidenceLevel: testResult.confidenceLevel,
    });

    return {
      sent: true,
    };
  }

  /**
   * Test 6.2 - Genera digest settimanale
   */
  async generateWeeklyDigest(
    _userId: string,
    activeTests: ActiveTest[]
  ): Promise<WeeklyDigest> {
    // Ordina test per priorità (significativi prima)
    const sortedTests = [...activeTests].sort((a, b) => {
      // Test con p-value < 0.05 hanno priorità
      const aSignificant = a.currentProgress.pValue < 0.05;
      const bSignificant = b.currentProgress.pValue < 0.05;

      if (aSignificant && !bSignificant) return -1;
      if (!aSignificant && bSignificant) return 1;

      // Altrimenti ordina per improvement
      return b.currentProgress.improvement - a.currentProgress.improvement;
    });

    // Genera riepilogo complessivo
    const significantTests = activeTests.filter(
      (t) => t.currentProgress.pValue < 0.05
    );
    const summary = `${activeTests.length} test attivi. ${significantTests.length} statisticamente significativi.`;

    // Genera body con sezioni per ogni test
    let body = `Riepilogo Settimanale\n\n${summary}\n\n`;

    for (const test of sortedTests) {
      body += this.formatTestSection(test);
    }

    const digest: WeeklyDigest = {
      tests: sortedTests,
      userEmail: 'user@example.com',
      subject: 'Report Settimanale - I Tuoi Test SEO',
      body,
    };

    await this.sendWebhook({
      event: 'weekly_digest',
      text: `📊 ${summary}`,
      subject: digest.subject,
      body: digest.body,
      testCount: activeTests.length,
      significantCount: significantTests.length,
    });

    return digest;
  }

  /**
   * Formatta sezione test nel digest
   */
  private formatTestSection(test: ActiveTest): string {
    const improvement = Math.round(test.currentProgress.improvement * 100);
    const confidence = Math.round(test.currentProgress.confidenceLevel * 100);

    let section = `\n--- ${test.testName} ---\n`;
    section += `Durata: ${test.daysRunning} giorni\n`;
    section += `Miglioramento: +${improvement}%\n`;
    section += `Confidenza: ${confidence}%\n`;

    // Azioni consigliate
    if (test.currentProgress.pValue < 0.05) {
      section += `✅ Azione: Pronto per applicare - Test statisticamente significativo!\n`;
    } else if (test.daysRunning < 10) {
      section += `⏳ Azione: Continua a monitorare - Test ancora troppo giovane\n`;
    } else {
      section += `👀 Azione: Continua a monitorare\n`;
    }

    section += '\n';

    return section;
  }

  /**
   * Test 6.2 - Determina se inviare digest settimanale
   */
  async shouldSendWeeklyDigest(
    _userId: string,
    activeTests: ActiveTest[]
  ): Promise<boolean> {
    // NON inviare se non ci sono test attivi
    return activeTests.length > 0;
  }
}
