/**
 * Test 9 - SEOExperimentOrchestrator
 *
 * Questi test verificano il flusso completo dell'orchestratore:
 * - Fetch dati GSC → Salvataggio DB → Analisi Statistica → Notifiche
 * - Sincronizzazione batch di tutti i test attivi
 * - Resilienza agli errori e audit logging
 *
 * TDD RED → GREEN workflow
 */

import { SEOExperimentOrchestrator } from '../../src/orchestrator/SEOExperimentOrchestrator';
import { createMockPrisma, type MockPrisma } from '../helpers/prisma-mock';

// --- Mock Factories ---

function createMockGSCFetcher() {
  return {
    fetchSearchAnalytics: vi.fn(),
  };
}

function createMockTokenManager() {
  return {
    getValidAccessToken: vi.fn(),
  };
}

function createMockTimeSeriesService() {
  return {
    saveData: vi.fn(),
  };
}

function createMockNotificationService() {
  return {
    shouldSendVictoryAlert: vi.fn(),
    sendVictoryAlert: vi.fn(),
  };
}

// --- Helpers ---

/** Crea un test mock con dati standard per l'orchestratore */
function createMockTest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-123',
    name: 'Test SEO Homepage',
    urls: ['https://example.com/page1'],
    siteUrl: 'sc-domain:example.com',
    startDate: new Date('2024-01-01'),
    splitDate: new Date('2024-01-15'),
    status: 'running',
    lastSyncAt: null,
    lastPValue: null,
    lastImprovement: null,
    userId: 'user-1',
    user: { id: 'user-1', email: 'test@example.com' },
    sharedWith: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: [],
    ...overrides,
  };
}

/** Genera metriche mock per un range di date */
function generateMockMetrics(startDate: string, days: number, baseClicks: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      id: i + 1,
      testId: 'test-123',
      date,
      clicks: baseClicks + Math.floor(Math.random() * 10),
      impressions: baseClicks * 10,
      gapFilled: false,
      filledAt: null,
      createdAt: new Date(),
    };
  });
}

describe('Test 9.1 - Esecuzione Singolo Esperimento', () => {
  let mockPrisma: MockPrisma;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      prisma: mockPrisma as any,
      gscFetcher: mockGSC as any,
      statisticalEngine: undefined, // Usa il vero StatisticalEngine
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  it('dovrebbe fetchare dati GSC, salvare e analizzare per un test attivo', async () => {
    // Arrange
    const beforeMetrics = generateMockMetrics('2024-01-01', 14, 100);
    const afterMetrics = generateMockMetrics('2024-01-15', 14, 150);
    const allMetrics = [...beforeMetrics, ...afterMetrics];

    const mockTest = createMockTest({ metrics: allMetrics });

    mockPrisma.test.findUnique.mockResolvedValue(mockTest);
    mockToken.getValidAccessToken.mockResolvedValue({
      success: true,
      error: null,
      token: 'valid-access-token',
    });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({
      rows: [
        { keys: ['2024-01-28'], clicks: 155, impressions: 1500, date: '2024-01-28' },
      ],
    });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockPrisma.metric.findMany.mockResolvedValue(allMetrics);
    mockPrisma.test.update.mockResolvedValue({ ...mockTest, lastSyncAt: new Date() });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false, reason: 'not_significant' });

    // Act
    const result = await orchestrator.runExperiment('test-123');

    // Assert
    expect(mockToken.getValidAccessToken).toHaveBeenCalledWith('user-1');
    expect(mockGSC.fetchSearchAnalytics).toHaveBeenCalledWith(
      'valid-access-token',
      'sc-domain:example.com',
      expect.objectContaining({ startDate: '2024-01-01' }),
    );
    expect(mockTimeSeries.saveData).toHaveBeenCalled();
    expect(mockPrisma.test.update).toHaveBeenCalled();
    expect(result.testId).toBe('test-123');
    expect(result.dataPointsBefore).toBe(14);
    expect(result.dataPointsAfter).toBe(14);
    expect(result.pValue).not.toBeNull();
  });

  it('dovrebbe dividere correttamente le metriche in before/after alla splitDate', async () => {
    // Arrange: 14 giorni before (01-14 gen), 14 giorni after (15-28 gen)
    const beforeMetrics = generateMockMetrics('2024-01-01', 14, 100);
    const afterMetrics = generateMockMetrics('2024-01-15', 14, 100);
    const allMetrics = [...beforeMetrics, ...afterMetrics];

    mockPrisma.test.findUnique.mockResolvedValue(createMockTest());
    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockPrisma.metric.findMany.mockResolvedValue(allMetrics);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false });

    // Act
    const result = await orchestrator.runExperiment('test-123');

    // Assert: Divisione corretta alla splitDate (15 gen)
    expect(result.dataPointsBefore).toBe(14);
    expect(result.dataPointsAfter).toBe(14);
  });

  it('dovrebbe lanciare errore se il test non esiste', async () => {
    // Arrange
    mockPrisma.test.findUnique.mockResolvedValue(null);

    // Act & Assert
    await expect(orchestrator.runExperiment('non-existent'))
      .rejects.toThrow('non trovato');
  });

  it('dovrebbe lanciare errore se il test non ha status running', async () => {
    // Arrange
    mockPrisma.test.findUnique.mockResolvedValue(
      createMockTest({ status: 'completed' }),
    );

    // Act & Assert
    await expect(orchestrator.runExperiment('test-123'))
      .rejects.toThrow('non è in esecuzione');
  });

  it('dovrebbe gestire errore token non valido e aggiornare status a failed', async () => {
    // Arrange
    mockPrisma.test.findUnique.mockResolvedValue(createMockTest());
    mockToken.getValidAccessToken.mockResolvedValue({
      success: false,
      error: 'Token scaduto',
      token: null,
    });
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    // Act & Assert
    await expect(orchestrator.runExperiment('test-123'))
      .rejects.toThrow('Token non valido');

    // Verifica che lo status sia stato aggiornato a 'failed'
    expect(mockPrisma.test.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('dovrebbe restituire insufficient_data quando dati non bastano per analisi', async () => {
    // Arrange: Solo 3 punti before e 3 after (meno del minimo 7)
    const fewBefore = generateMockMetrics('2024-01-01', 3, 100);
    const fewAfter = generateMockMetrics('2024-01-15', 3, 150);

    mockPrisma.test.findUnique.mockResolvedValue(createMockTest());
    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockPrisma.metric.findMany.mockResolvedValue([...fewBefore, ...fewAfter]);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    // Act
    const result = await orchestrator.runExperiment('test-123');

    // Assert
    expect(result.status).toBe('insufficient_data');
    expect(result.isSignificant).toBe(false);
    expect(result.dataPointsBefore).toBe(3);
    expect(result.dataPointsAfter).toBe(3);
  });
});

describe('Test 9.2 - Notifiche su Risultati Significativi', () => {
  let mockPrisma: MockPrisma;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      prisma: mockPrisma as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  /** Setup comune per test notifiche */
  function setupForAnalysis(beforeClicks: number, afterClicks: number) {
    // Genera metriche con valori costanti (nessuna varianza) per forzare risultato chiaro
    const beforeMetrics = Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      return { id: i + 1, testId: 'test-123', date, clicks: beforeClicks, impressions: 1000, gapFilled: false, filledAt: null, createdAt: new Date() };
    });
    const afterMetrics = Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-02-01');
      date.setDate(date.getDate() + i);
      return { id: 31 + i, testId: 'test-123', date, clicks: afterClicks, impressions: 1000, gapFilled: false, filledAt: null, createdAt: new Date() };
    });

    mockPrisma.test.findUnique.mockResolvedValue(createMockTest({
      startDate: new Date('2024-01-01'),
      splitDate: new Date('2024-02-01'),
    }));
    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockPrisma.metric.findMany.mockResolvedValue([...beforeMetrics, ...afterMetrics]);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
  }

  it('dovrebbe inviare notifica quando analisi rileva miglioramento significativo', async () => {
    // Arrange: Before=100 clicks, After=200 clicks → miglioramento enorme, sicuramente significativo
    setupForAnalysis(100, 200);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: true });

    // Act
    const result = await orchestrator.runExperiment('test-123');

    // Assert
    expect(mockNotification.sendVictoryAlert).toHaveBeenCalled();
    expect(result.notificationSent).toBe(true);
    expect(result.isSignificant).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('NON dovrebbe inviare notifica se risultato non significativo', async () => {
    // Arrange: Before=100, After=100 → nessun miglioramento, pValue=1.0
    setupForAnalysis(100, 100);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false });

    // Act
    const result = await orchestrator.runExperiment('test-123');

    // Assert: sendVictoryAlert NON deve essere chiamato perché non significativo
    expect(mockNotification.sendVictoryAlert).not.toHaveBeenCalled();
    expect(result.notificationSent).toBe(false);
    expect(result.isSignificant).toBe(false);
  });

  it('dovrebbe passare improvement come decimale (20.0% → 0.20) al NotificationService', async () => {
    // Arrange: Before=100, After=200 → percentageChange ~100%, improvement = ~1.0
    setupForAnalysis(100, 200);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: true });

    // Act
    await orchestrator.runExperiment('test-123');

    // Assert: improvement deve essere decimale (non percentuale)
    const callArgs = mockNotification.sendVictoryAlert.mock.calls[0][0];
    expect(callArgs.improvement).toBeLessThan(10); // Deve essere decimale, non 100+
    expect(callArgs.improvement).toBeGreaterThan(0);
    expect(callArgs.pValue).toBeLessThan(0.05);
    expect(callArgs.metricType).toBe('clicks');
    expect(callArgs.userEmail).toBe('test@example.com');
  });
});

describe('Test 9.3 - Sincronizzazione Tutti i Test Attivi', () => {
  let mockPrisma: MockPrisma;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      prisma: mockPrisma as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  it('dovrebbe iterare tutti i test con status running', async () => {
    // Arrange: 3 test attivi
    const test1 = createMockTest({ id: 'test-1', userId: 'user-1' });
    const test2 = createMockTest({ id: 'test-2', userId: 'user-2' });
    const test3 = createMockTest({ id: 'test-3', userId: 'user-3' });

    mockPrisma.test.findMany.mockResolvedValue([test1, test2, test3]);

    // findUnique per ciascun runExperiment
    mockPrisma.test.findUnique
      .mockResolvedValueOnce(test1)
      .mockResolvedValueOnce(test2)
      .mockResolvedValueOnce(test3);

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);

    const metrics = generateMockMetrics('2024-01-01', 14, 100)
      .concat(generateMockMetrics('2024-01-15', 14, 100));
    mockPrisma.metric.findMany.mockResolvedValue(metrics);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    // Act
    const result = await orchestrator.syncAllActiveTests();

    // Assert
    expect(result.totalTests).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  it('dovrebbe continuare se un test fallisce e riportare l\'errore', async () => {
    // Arrange: 3 test, il secondo fallirà per token non valido
    const test1 = createMockTest({ id: 'test-1', userId: 'user-1' });
    const test2 = createMockTest({ id: 'test-2', userId: 'user-2' });
    const test3 = createMockTest({ id: 'test-3', userId: 'user-3' });

    mockPrisma.test.findMany.mockResolvedValue([test1, test2, test3]);

    mockPrisma.test.findUnique
      .mockResolvedValueOnce(test1)
      .mockResolvedValueOnce(test2)
      .mockResolvedValueOnce(test3);

    // Token valido per test 1 e 3, fallito per test 2
    mockToken.getValidAccessToken
      .mockResolvedValueOnce({ success: true, error: null, token: 'tok' })
      .mockResolvedValueOnce({ success: false, error: 'Token scaduto', token: null })
      .mockResolvedValueOnce({ success: true, error: null, token: 'tok' });

    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);

    const metrics = generateMockMetrics('2024-01-01', 14, 100)
      .concat(generateMockMetrics('2024-01-15', 14, 100));
    mockPrisma.metric.findMany.mockResolvedValue(metrics);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    // Act
    const result = await orchestrator.syncAllActiveTests();

    // Assert: 2 successi, 1 errore
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].testId).toBe('test-2');
    expect(result.errors[0].error).toContain('Token non valido');
  });

  it('dovrebbe restituire risultato vuoto se non ci sono test attivi', async () => {
    // Arrange
    mockPrisma.test.findMany.mockResolvedValue([]);

    // Act
    const result = await orchestrator.syncAllActiveTests();

    // Assert
    expect(result.totalTests).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Test 9.4 - Audit Log e Tracciabilità', () => {
  let mockPrisma: MockPrisma;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      prisma: mockPrisma as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  function setupStandardMocks() {
    const metrics = generateMockMetrics('2024-01-01', 14, 100)
      .concat(generateMockMetrics('2024-01-15', 14, 100));

    mockPrisma.test.findUnique.mockResolvedValue(createMockTest());
    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockPrisma.metric.findMany.mockResolvedValue(metrics);
    mockPrisma.test.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false, reason: 'not_significant' });
  }

  it('dovrebbe registrare ogni sincronizzazione nell\'audit log', async () => {
    // Arrange
    setupStandardMocks();

    // Act
    await orchestrator.runExperiment('test-123');

    // Assert
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        testId: 'test-123',
        action: 'experiment_synced',
        userId: 'user-1',
      }),
    });
  });

  it('dovrebbe aggiornare lastSyncAt dopo ogni sincronizzazione riuscita', async () => {
    // Arrange
    setupStandardMocks();
    const beforeRun = Date.now();

    // Act
    await orchestrator.runExperiment('test-123');

    // Assert
    expect(mockPrisma.test.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-123' },
        data: expect.objectContaining({
          lastSyncAt: expect.any(Date),
          lastPValue: expect.any(Number),
        }),
      }),
    );

    // Verifica che lastSyncAt sia recente (entro 5 secondi)
    const updateCall = mockPrisma.test.update.mock.calls[0][0];
    const lastSyncAt = updateCall.data.lastSyncAt.getTime();
    expect(lastSyncAt).toBeGreaterThanOrEqual(beforeRun);
    expect(lastSyncAt).toBeLessThanOrEqual(Date.now());
  });
});
