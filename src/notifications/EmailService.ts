/**
 * EmailService
 *
 * Gestisce la generazione e l'invio di email:
 * - Formattazione email vittoria
 * - Invio email (mock per ora)
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

interface Email {
  to: string;
  subject: string;
  body: string;
}

export class EmailService {

  /**
   * Test 6.1 - Genera email per test vincente
   */
  async generateVictoryEmail(testResult: TestResult): Promise<Email> {
    const improvement = Math.round(testResult.improvement * 100);
    const confidence = Math.round(testResult.confidenceLevel * 100);

    const subject = `🎉 ${testResult.testName} mostra un miglioramento significativo!`;

    let body = `Ottima notizia!\n\n`;
    body += `Il tuo test "${testResult.testName}" mostra un miglioramento significativo:\n\n`;
    body += `📈 Miglioramento: +${improvement}% ${testResult.metricType}\n`;
    body += `✅ Confidenza: ${confidence}% confidenza\n`;
    body += `📊 Statisticamente significativo (p-value < 0.05)\n\n`;

    // Call-to-action
    body += `🚀 Cosa fare ora?\n`;
    body += `Applica questa modifica al tuo sito per ottenere risultati reali!\n\n`;
    body += `Visualizza dettagli completi: [link al test]\n\n`;
    body += `---\n`;
    body += `SEO Testing Tool - Decisioni basate sui dati\n`;

    return {
      to: testResult.userEmail,
      subject,
      body,
    };
  }

  /**
   * Invia email (implementazione futura)
   */
  async send(email: Email): Promise<void> {
    // TODO: Implementare invio reale con servizio email (SendGrid, AWS SES, etc.)
    console.log(`Email sent to: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
  }
}
