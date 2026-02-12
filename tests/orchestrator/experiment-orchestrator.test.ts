/**
 * Test 9 - SEOExperimentOrchestrator
 *
 * Questi test verificano il flusso completo dell'orchestratore:
 * - Fetch dati GSC → Salvataggio DB → Analisi Statistica → Notifiche
 * - Sincronizzazione batch di tutti i test attivi
 * - Resilienza agli errori e audit logging
 *
 * Usa DB in-memory reale + mock dei servizi esterni (GSC, Token, Notification).
 */

import { eq } from 'drizzle-orm';
import { SEOExperimentOrchestrator } from '../../src/orchestrator/SEOExperimentOrchestrator';
import { createTestDb, seedUser, seedTest, type TestDB } from '../helpers/test-db';
import { tests, metrics, auditLogs } from '../../src/database/schema';

// --- Mock Factories ---

function createMockGSCFetcher() {
  return { fetchSearchAnalytics: vi.fn() };
}

function createMockTokenManager() {
  return { getValidAccessToken: vi.fn() };
}

function createMockTimeSeriesService() {
  return { saveData: vi.fn() };
}

function createMockNotificationService() {
  return {
    shouldSendVictoryAlert: vi.fn(),
    sendVictoryAlert: vi.fn(),
  };
}

// --- Helpers ---

/** Inserisce metriche nel DB reale per un range di date */
function insertMetrics(db: TestDB, testId: string, startDate: string, days: number, baseClicks: number) {
  const rows = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      testId,
      date: date.toISOString(),
      clicks: baseClicks + Math.floor(Math.random() * 10),
      impressions: baseClicks * 10,
    };
  });
  if (rows.length > 0) {
    db.insert(metrics).values(rows).run();
  }
}

describe('Test 9.1 - Esecuzione Singolo Esperimento', () => {
  let db: TestDB;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db, 'user-1', 'test@example.com');
    seedTest(db);

    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      db: db as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  it('dovrebbe fetchare dati GSC, salvare e analizzare per un test attivo', async () => {
    // Arrange: Inserisci metriche nel DB reale
    insertMetrics(db, 'test-123', '2024-01-01', 14, 100);
    insertMetrics(db, 'test-123', '2024-01-15', 14, 150);

    mockToken.getValidAccessToken.mockResolvedValue({
      success: true, error: null, token: 'valid-access-token',
    });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({
      rows: [{ keys: ['2024-01-28'], clicks: 155, impressions: 1500, date: '2024-01-28' }],
    });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
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
    expect(result.testId).toBe('test-123');
    expect(result.dataPointsBefore).toBe(14);
    expect(result.dataPointsAfter).toBe(14);
    expect(result.pValue).not.toBeNull();
  });

  it('dovrebbe dividere correttamente le metriche in before/after alla splitDate', async () => {
    insertMetrics(db, 'test-123', '2024-01-01', 14, 100);
    insertMetrics(db, 'test-123', '2024-01-15', 14, 100);

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false });

    const result = await orchestrator.runExperiment('test-123');

    expect(result.dataPointsBefore).toBe(14);
    expect(result.dataPointsAfter).toBe(14);
  });

  it('dovrebbe lanciare errore se il test non esiste', async () => {
    await expect(orchestrator.runExperiment('non-existent'))
      .rejects.toThrow('non trovato');
  });

  it('dovrebbe lanciare errore se il test non ha status running', async () => {
    db.update(tests).set({ status: 'completed' }).where(eq(tests.id, 'test-123')).run();

    await expect(orchestrator.runExperiment('test-123'))
      .rejects.toThrow('non è in esecuzione');
  });

  it('dovrebbe gestire errore token non valido e aggiornare status a failed', async () => {
    mockToken.getValidAccessToken.mockResolvedValue({
      success: false, error: 'Token scaduto', token: null,
    });

    await expect(orchestrator.runExperiment('test-123'))
      .rejects.toThrow('Token non valido');

    const updated = db.select().from(tests).where(eq(tests.id, 'test-123')).get();
    expect(updated?.status).toBe('failed');
  });

  it('dovrebbe restituire insufficient_data quando dati non bastano per analisi', async () => {
    insertMetrics(db, 'test-123', '2024-01-01', 3, 100);
    insertMetrics(db, 'test-123', '2024-01-15', 3, 150);

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);

    const result = await orchestrator.runExperiment('test-123');

    expect(result.status).toBe('insufficient_data');
    expect(result.isSignificant).toBe(false);
    expect(result.dataPointsBefore).toBe(3);
    expect(result.dataPointsAfter).toBe(3);
  });
});

describe('Test 9.2 - Notifiche su Risultati Significativi', () => {
  let db: TestDB;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db, 'user-1', 'test@example.com');
    seedTest(db, {
      startDate: new Date('2024-01-01').toISOString(),
      splitDate: new Date('2024-02-01').toISOString(),
    });

    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      db: db as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
  });

  /** Inserisce metriche con valori costanti (nessuna varianza interna) */
  function insertConstantMetrics(beforeClicks: number, afterClicks: number) {
    const beforeRows = Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      return { testId: 'test-123', date: date.toISOString(), clicks: beforeClicks, impressions: 1000 };
    });
    const afterRows = Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-02-01');
      date.setDate(date.getDate() + i);
      return { testId: 'test-123', date: date.toISOString(), clicks: afterClicks, impressions: 1000 };
    });
    db.insert(metrics).values([...beforeRows, ...afterRows]).run();
  }

  it('dovrebbe inviare notifica quando analisi rileva miglioramento significativo', async () => {
    insertConstantMetrics(100, 200);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: true });

    const result = await orchestrator.runExperiment('test-123');

    expect(mockNotification.sendVictoryAlert).toHaveBeenCalled();
    expect(result.notificationSent).toBe(true);
    expect(result.isSignificant).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('NON dovrebbe inviare notifica se risultato non significativo', async () => {
    insertConstantMetrics(100, 100);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false });

    const result = await orchestrator.runExperiment('test-123');

    expect(mockNotification.sendVictoryAlert).not.toHaveBeenCalled();
    expect(result.notificationSent).toBe(false);
    expect(result.isSignificant).toBe(false);
  });

  it('dovrebbe passare improvement come decimale (20.0% → 0.20) al NotificationService', async () => {
    insertConstantMetrics(100, 200);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: true });

    await orchestrator.runExperiment('test-123');

    const callArgs = mockNotification.sendVictoryAlert.mock.calls[0][0];
    expect(callArgs.improvement).toBeLessThan(10);
    expect(callArgs.improvement).toBeGreaterThan(0);
    expect(callArgs.pValue).toBeLessThan(0.05);
    expect(callArgs.metricType).toBe('clicks');
    expect(callArgs.userEmail).toBe('test@example.com');
  });
});

describe('Test 9.3 - Sincronizzazione Tutti i Test Attivi', () => {
  let db: TestDB;
  let mockGSC: ReturnType<typeof createMockGSCFetcher>;
  let mockToken: ReturnType<typeof createMockTokenManager>;
  let mockTimeSeries: ReturnType<typeof createMockTimeSeriesService>;
  let mockNotification: ReturnType<typeof createMockNotificationService>;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db, 'user-1', 'u1@test.com');
    seedUser(db, 'user-2', 'u2@test.com');
    seedUser(db, 'user-3', 'u3@test.com');

    mockGSC = createMockGSCFetcher();
    mockToken = createMockTokenManager();
    mockTimeSeries = createMockTimeSeriesService();
    mockNotification = createMockNotificationService();

    orchestrator = new SEOExperimentOrchestrator({
      db: db as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  function insertTestWithMetrics(testId: string, userId: string) {
    seedTest(db, { id: testId, userId });
    const beforeRows = Array.from({ length: 14 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      return { testId, date: date.toISOString(), clicks: 100, impressions: 1000 };
    });
    const afterRows = Array.from({ length: 14 }, (_, i) => {
      const date = new Date('2024-01-15');
      date.setDate(date.getDate() + i);
      return { testId, date: date.toISOString(), clicks: 100, impressions: 1000 };
    });
    db.insert(metrics).values([...beforeRows, ...afterRows]).run();
  }

  it('dovrebbe iterare tutti i test con status running', async () => {
    insertTestWithMetrics('test-1', 'user-1');
    insertTestWithMetrics('test-2', 'user-2');
    insertTestWithMetrics('test-3', 'user-3');

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);

    const result = await orchestrator.syncAllActiveTests();

    expect(result.totalTests).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  it('dovrebbe continuare se un test fallisce e riportare l\'errore', async () => {
    insertTestWithMetrics('test-1', 'user-1');
    insertTestWithMetrics('test-2', 'user-2');
    insertTestWithMetrics('test-3', 'user-3');

    mockToken.getValidAccessToken
      .mockResolvedValueOnce({ success: true, error: null, token: 'tok' })
      .mockResolvedValueOnce({ success: false, error: 'Token scaduto', token: null })
      .mockResolvedValueOnce({ success: true, error: null, token: 'tok' });

    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);

    const result = await orchestrator.syncAllActiveTests();

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].testId).toBe('test-2');
    expect(result.errors[0].error).toContain('Token non valido');
  });

  it('dovrebbe restituire risultato vuoto se non ci sono test attivi', async () => {
    const result = await orchestrator.syncAllActiveTests();

    expect(result.totalTests).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Test 9.4 - Audit Log e Tracciabilità', () => {
  let db: TestDB;
  let orchestrator: SEOExperimentOrchestrator;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db, 'user-1', 'test@example.com');
    seedTest(db);

    const beforeRows = Array.from({ length: 14 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      return { testId: 'test-123', date: date.toISOString(), clicks: 100, impressions: 1000 };
    });
    const afterRows = Array.from({ length: 14 }, (_, i) => {
      const date = new Date('2024-01-15');
      date.setDate(date.getDate() + i);
      return { testId: 'test-123', date: date.toISOString(), clicks: 100, impressions: 1000 };
    });
    db.insert(metrics).values([...beforeRows, ...afterRows]).run();

    const mockToken = createMockTokenManager();
    const mockGSC = createMockGSCFetcher();
    const mockTimeSeries = createMockTimeSeriesService();
    const mockNotification = createMockNotificationService();

    mockToken.getValidAccessToken.mockResolvedValue({ success: true, error: null, token: 'tok' });
    mockGSC.fetchSearchAnalytics.mockResolvedValue({ rows: [] });
    mockTimeSeries.saveData.mockResolvedValue(undefined);
    mockNotification.sendVictoryAlert.mockResolvedValue({ sent: false, reason: 'not_significant' });

    orchestrator = new SEOExperimentOrchestrator({
      db: db as any,
      gscFetcher: mockGSC as any,
      timeSeriesService: mockTimeSeries as any,
      notificationService: mockNotification as any,
      tokenManager: mockToken as any,
    });
  });

  it('dovrebbe registrare ogni sincronizzazione nell\'audit log', async () => {
    await orchestrator.runExperiment('test-123');

    const logs = db.select().from(auditLogs).where(eq(auditLogs.testId, 'test-123')).all();
    expect(logs.some(l => l.action === 'experiment_synced')).toBe(true);
    expect(logs.some(l => l.userId === 'user-1')).toBe(true);
  });

  it('dovrebbe aggiornare lastSyncAt dopo ogni sincronizzazione riuscita', async () => {
    const beforeRun = new Date().toISOString();

    await orchestrator.runExperiment('test-123');

    const updated = db.select().from(tests).where(eq(tests.id, 'test-123')).get();
    expect(updated?.lastSyncAt).toBeDefined();
    expect(updated!.lastSyncAt! >= beforeRun).toBe(true);
    expect(updated?.lastPValue).toEqual(expect.any(Number));
  });
});
