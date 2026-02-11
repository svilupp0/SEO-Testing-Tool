/**
 * Test 6 - Notifiche e Automazione (Il Valore)
 *
 * Questi test verificano che le notifiche siano tempestive, accurate e non fastidiose
 *
 * TDD RED → GREEN workflow
 */

import { NotificationService } from '../../src/notifications/NotificationService';
import { EmailService } from '../../src/notifications/EmailService';

describe('Test 6.1 - Alert Vittoria', () => {

  it('dovrebbe inviare notifica solo quando test è statisticamente significativo', async () => {
    // Arrange: Test con risultato statisticamente significativo
    const notificationService = new NotificationService();

    const testResult = {
      testId: 'test-123',
      testName: 'Titolo Ottimizzato',
      pValue: 0.03, // < 0.05 = statisticamente significativo
      improvement: 0.20, // +20% miglioramento
      confidenceLevel: 0.95, // 95% confidenza
      metricType: 'clicks',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act: Verifichiamo se deve inviare notifica
    const shouldNotify = await notificationService.shouldSendVictoryAlert(testResult);

    // Assert: Deve inviare notifica perché p-value < 0.05
    expect(shouldNotify).toBe(true);
  });

  it('NON dovrebbe inviare notifica se p-value non è significativo', async () => {
    // Arrange: Test senza significatività statistica
    const notificationService = new NotificationService();

    const testResult = {
      testId: 'test-456',
      testName: 'Test Non Significativo',
      pValue: 0.15, // > 0.05 = NON significativo
      improvement: 0.10, // +10% ma non significativo
      confidenceLevel: 0.85, // 85% confidenza (< 95%)
      metricType: 'clicks',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act
    const shouldNotify = await notificationService.shouldSendVictoryAlert(testResult);

    // Assert: NON deve inviare per evitare alert fatigue
    expect(shouldNotify).toBe(false);
  });

  it('dovrebbe generare email con formato corretto per test vincente', async () => {
    // Arrange: Test statisticamente significativo
    const emailService = new EmailService();

    const testResult = {
      testId: 'test-789',
      testName: 'Titolo Ottimizzato',
      pValue: 0.02,
      improvement: 0.20, // +20%
      confidenceLevel: 0.95,
      metricType: 'clicks',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act: Generiamo email
    const email = await emailService.generateVictoryEmail(testResult);

    // Assert: Verifichiamo formato email
    expect(email.to).toBe('user@example.com');
    expect(email.subject).toContain('miglioramento significativo');
    expect(email.body).toContain('Titolo Ottimizzato');
    expect(email.body).toContain('+20%');
    expect(email.body).toContain('95% confidenza');
    expect(email.body).toContain('clicks');
  });

  it('dovrebbe includere call-to-action nell\'email di vittoria', async () => {
    // Arrange
    const emailService = new EmailService();

    const testResult = {
      testId: 'test-999',
      testName: 'Meta Description Migliorata',
      pValue: 0.01,
      improvement: 0.35, // +35%
      confidenceLevel: 0.99, // 99% confidenza
      metricType: 'impressions',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act
    const email = await emailService.generateVictoryEmail(testResult);

    // Assert: Deve suggerire azione successiva
    expect(email.body).toContain('Applica questa modifica');
    expect(email.body).toContain('link');
  });

  it('NON dovrebbe inviare notifica per miglioramenti minimi anche se significativi', async () => {
    // Arrange: Miglioramento statisticamente significativo ma troppo piccolo (< 5%)
    const notificationService = new NotificationService();

    const testResult = {
      testId: 'test-small',
      testName: 'Miglioramento Minimo',
      pValue: 0.04, // Significativo
      improvement: 0.02, // Solo +2% (troppo piccolo per notificare)
      confidenceLevel: 0.95,
      metricType: 'clicks',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act
    const shouldNotify = await notificationService.shouldSendVictoryAlert(testResult);

    // Assert: NON notificare miglioramenti < 5% per evitare alert fatigue
    expect(shouldNotify).toBe(false);
  });

  it('dovrebbe tracciare le notifiche inviate per evitare duplicati', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const testResult = {
      testId: 'test-duplicate',
      testName: 'Test Duplicato',
      pValue: 0.03,
      improvement: 0.20,
      confidenceLevel: 0.95,
      metricType: 'clicks',
      userId: 'user-123',
      userEmail: 'user@example.com',
    };

    // Act: Inviamo notifica due volte
    await notificationService.sendVictoryAlert(testResult);
    const secondSend = await notificationService.sendVictoryAlert(testResult);

    // Assert: La seconda volta NON deve inviare (già inviata)
    expect(secondSend.sent).toBe(false);
    expect(secondSend.reason).toBe('already_notified');
  });
});

describe('Test 6.2 - Report Settimanale', () => {

  it('dovrebbe aggregare tutti i test attivi in un singolo digest settimanale', async () => {
    // Arrange: Utente con 10 test attivi
    const notificationService = new NotificationService();

    const userId = 'user-multi-test';
    const userEmail = 'user@example.com';

    const activeTests = Array.from({ length: 10 }, (_, i) => ({
      testId: `test-${i}`,
      testName: `Test ${i + 1}`,
      status: 'running',
      daysRunning: 15 + i,
      currentProgress: {
        pValue: 0.05 + (i * 0.01),
        improvement: 0.10 + (i * 0.02),
        confidenceLevel: 0.90 + (i * 0.005),
      },
    }));

    // Act: Generiamo digest settimanale
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Deve contenere TUTTI i test in un'unica email
    expect(digest.tests).toHaveLength(10);
    expect(digest.userEmail).toBe(userEmail);
    expect(digest.subject).toContain('Report Settimanale');
  });

  it('dovrebbe includere sezione per ogni test nel digest', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const userId = 'user-123';
    const activeTests = [
      {
        testId: 'test-1',
        testName: 'Test A/B Titolo',
        status: 'running',
        daysRunning: 20,
        currentProgress: {
          pValue: 0.08,
          improvement: 0.15,
          confidenceLevel: 0.92,
        },
      },
      {
        testId: 'test-2',
        testName: 'Test Meta Description',
        status: 'running',
        daysRunning: 10,
        currentProgress: {
          pValue: 0.03,
          improvement: 0.25,
          confidenceLevel: 0.97,
        },
      },
    ];

    // Act
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Ogni test deve avere la sua sezione
    expect(digest.body).toContain('Test A/B Titolo');
    expect(digest.body).toContain('Test Meta Description');
    expect(digest.body).toContain('20 giorni'); // Test 1 durata
    expect(digest.body).toContain('10 giorni'); // Test 2 durata
  });

  it('dovrebbe includere azioni consigliate per ogni test', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const userId = 'user-123';
    const activeTests = [
      {
        testId: 'test-significant',
        testName: 'Test Significativo',
        status: 'running',
        daysRunning: 30,
        currentProgress: {
          pValue: 0.02, // Significativo!
          improvement: 0.30,
          confidenceLevel: 0.98,
        },
      },
      {
        testId: 'test-early',
        testName: 'Test Troppo Giovane',
        status: 'running',
        daysRunning: 5, // Troppo presto
        currentProgress: {
          pValue: 0.10,
          improvement: 0.05,
          confidenceLevel: 0.90,
        },
      },
    ];

    // Act
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Deve suggerire azioni specifiche
    expect(digest.body).toContain('Pronto per applicare'); // Test significativo
    expect(digest.body).toContain('Continua a monitorare'); // Test troppo giovane
  });

  it('NON dovrebbe inviare digest se utente non ha test attivi', async () => {
    // Arrange: Utente senza test attivi
    const notificationService = new NotificationService();

    const userId = 'user-no-tests';
    const activeTests = []; // Nessun test attivo

    // Act
    const shouldSend = await notificationService.shouldSendWeeklyDigest(userId, activeTests);

    // Assert: NON inviare email vuote
    expect(shouldSend).toBe(false);
  });

  it('dovrebbe formattare percentuali e metriche in modo user-friendly', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const userId = 'user-123';
    const activeTests = [
      {
        testId: 'test-format',
        testName: 'Test Formatting',
        status: 'running',
        daysRunning: 15,
        currentProgress: {
          pValue: 0.0234, // Deve essere formattato come "2.34%"
          improvement: 0.2567, // Deve essere formattato come "+25.67%" o "+26%"
          confidenceLevel: 0.9512, // Deve essere formattato come "95%"
        },
      },
    ];

    // Act
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Formattazione user-friendly
    expect(digest.body).toMatch(/\+2[56](\.\d{1,2})?%/); // +25% o +26%
    expect(digest.body).toMatch(/95%/); // Confidenza 95%
  });

  it('dovrebbe ordinare test per priorità (significativi prima)', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const userId = 'user-123';
    const activeTests = [
      {
        testId: 'test-not-significant',
        testName: 'Test Non Significativo',
        status: 'running',
        daysRunning: 10,
        currentProgress: {
          pValue: 0.15, // Non significativo
          improvement: 0.10,
          confidenceLevel: 0.85,
        },
      },
      {
        testId: 'test-significant',
        testName: 'Test SIGNIFICATIVO',
        status: 'running',
        daysRunning: 25,
        currentProgress: {
          pValue: 0.01, // MOLTO significativo
          improvement: 0.40,
          confidenceLevel: 0.99,
        },
      },
    ];

    // Act
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Test significativo deve apparire PRIMA nel digest
    const significantIndex = digest.body.indexOf('Test SIGNIFICATIVO');
    const nonSignificantIndex = digest.body.indexOf('Test Non Significativo');

    expect(significantIndex).toBeLessThan(nonSignificantIndex);
  });

  it('dovrebbe includere riepilogo complessivo all\'inizio del digest', async () => {
    // Arrange
    const notificationService = new NotificationService();

    const userId = 'user-123';
    const activeTests = [
      {
        testId: 'test-1',
        testName: 'Test 1',
        status: 'running',
        daysRunning: 30,
        currentProgress: { pValue: 0.02, improvement: 0.20, confidenceLevel: 0.98 },
      },
      {
        testId: 'test-2',
        testName: 'Test 2',
        status: 'running',
        daysRunning: 15,
        currentProgress: { pValue: 0.10, improvement: 0.05, confidenceLevel: 0.90 },
      },
      {
        testId: 'test-3',
        testName: 'Test 3',
        status: 'running',
        daysRunning: 20,
        currentProgress: { pValue: 0.03, improvement: 0.15, confidenceLevel: 0.97 },
      },
    ];

    // Act
    const digest = await notificationService.generateWeeklyDigest(userId, activeTests);

    // Assert: Deve avere riepilogo all'inizio
    expect(digest.body).toContain('3 test attivi'); // Totale test
    expect(digest.body).toMatch(/2.*significativ/i); // 2 test significativi (p < 0.05)
  });
});
