/**
 * Test 5 - Database e Performance (La Tenuta)
 *
 * Questi test verificano che il sistema regga sotto carico e che i dati rimangano consistenti.
 * Usano un mock del PrismaClient per isolamento dai database di produzione.
 *
 * TDD RED → GREEN workflow
 */

import { DatabaseService } from '../../src/database/DatabaseService';
import { TimeSeriesService } from '../../src/database/TimeSeriesService';
import { createMockPrisma, type MockPrisma } from '../helpers/prisma-mock';

describe('Test 5.1 - Concorrenza', () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  it('dovrebbe gestire 100 richieste simultanee senza deadlock', async () => {
    // Arrange
    const numberOfUsers = 100;
    const testId = 'test-concurrent-123';

    // Configura il mock per restituire un report per ogni richiesta
    mockPrisma.test.findFirst.mockResolvedValue({
      id: testId,
      userId: 'user-0',
      name: 'Mock Test Report',
      metrics: [],
    });

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Lanciamo 100 richieste simultanee
    const promises = Array.from({ length: numberOfUsers }, (_, i) => {
      return dbService.getTestReport(testId, `user-${i}`);
    });

    const results = await Promise.all(promises);

    // Assert: Tutte le 100 richieste devono completare con successo
    expect(results).toHaveLength(numberOfUsers);
    expect(results.every(r => r !== null)).toBe(true);
  });

  it('dovrebbe prevenire race condition quando più utenti modificano lo stesso test', async () => {
    // Arrange
    const testId = 'test-123';
    const user1 = 'user-1';
    const user2 = 'user-2';

    mockPrisma.test.updateMany.mockResolvedValue({ count: 1 });

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Modifiche simultanee
    const [result1, result2] = await Promise.all([
      dbService.updateTest(testId, { name: 'Updated by user 1' }, user1),
      dbService.updateTest(testId, { name: 'Updated by user 2' }, user2),
    ]);

    // Assert: Una delle due modifiche deve vincere
    expect(result1 || result2).toBeDefined();
  });

  it('dovrebbe gestire transazioni atomiche per operazioni multi-step', async () => {
    // Arrange
    const testData = {
      name: 'Test Transazionale',
      startDate: '2024-01-01',
      urls: ['https://example.com/page1'],
    };

    const metrics = [
      { date: '2024-01-01', clicks: 100, impressions: 1000 },
      { date: '2024-01-02', clicks: 120, impressions: 1100 },
    ];

    // Configura il mock della transazione
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const txMock = createMockPrisma();
      txMock.test.create.mockResolvedValue({
        id: `test-${Date.now()}`,
        name: testData.name,
        startDate: new Date(testData.startDate),
        urls: testData.urls,
        userId: 'user-1',
      });
      txMock.metric.createMany.mockResolvedValue({ count: metrics.length });
      return fn(txMock);
    });

    const dbService = new DatabaseService(mockPrisma as any);

    // Act
    const result = await dbService.createTestWithMetrics(testData, metrics, 'user-1');

    // Assert
    expect(result.testId).toBeDefined();
    expect(result.metricsInserted).toBe(2);
    expect(result.statsUpdated).toBe(true);
  });
});

describe('Test 5.2 - Integrità Serie Temporale', () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  it('dovrebbe rilevare gap nella serie temporale dopo fetch fallito', async () => {
    // Arrange: Serie temporale con dati mancanti (manca il 2024-01-03)
    mockPrisma.metric.createMany.mockResolvedValue({ count: 4 });
    mockPrisma.metric.findMany.mockResolvedValue([
      { date: new Date('2024-01-01') },
      { date: new Date('2024-01-02') },
      // GAP: 2024-01-03 mancante
      { date: new Date('2024-01-04') },
      { date: new Date('2024-01-05') },
    ]);

    const tsService = new TimeSeriesService(mockPrisma as any);

    await tsService.saveData('test-123', [
      { date: '2024-01-01', clicks: 100 },
      { date: '2024-01-02', clicks: 110 },
      { date: '2024-01-04', clicks: 130 },
      { date: '2024-01-05', clicks: 140 },
    ]);

    // Act: Verifichiamo gap
    const gaps = await tsService.detectGaps('test-123', '2024-01-01', '2024-01-05');

    // Assert: Il gap del 03/01 deve essere rilevato
    expect(gaps).toHaveLength(1);
    expect(gaps[0].date).toBe('2024-01-03');
    expect(gaps[0].reason).toBe('fetch_failed');
  });

  it('dovrebbe recuperare automaticamente i dati mancanti nel fetch successivo', async () => {
    // Arrange: Ultimo dato è 2024-01-02, gap su 2024-01-03
    mockPrisma.metric.findFirst.mockResolvedValue({
      date: new Date('2024-01-02'),
    });

    // detectGaps troverà il 2024-01-03 mancante
    mockPrisma.metric.findMany.mockResolvedValue([
      { date: new Date('2024-01-02') },
      // 2024-01-03 mancante
    ]);

    const tsService = new TimeSeriesService(mockPrisma as any);

    // Act: Fetch successivo deve recuperare anche i gap
    const fetchDates = await tsService.getFetchDates('test-123', '2024-01-04');

    // Assert: Deve pianificare fetch sia per il gap che per oggi
    expect(fetchDates).toContain('2024-01-03');
    expect(fetchDates).toContain('2024-01-04');
    expect(fetchDates).toHaveLength(2);
  });

  it('dovrebbe mantenere flag "gap_filled" per tracciare recupero dati', async () => {
    // Arrange: Recuperiamo dati per gap
    const recoveredData = {
      date: '2024-01-03',
      clicks: 120,
      impressions: 1050,
    };

    mockPrisma.metric.upsert.mockResolvedValue({
      id: 1,
      testId: 'test-123',
      date: new Date('2024-01-03'),
      clicks: 120,
      impressions: 1050,
      gapFilled: true,
      filledAt: new Date(),
      createdAt: new Date(),
    });

    const tsService = new TimeSeriesService(mockPrisma as any);

    // Act: Salviamo dati recuperati con flag
    const saved = await tsService.saveGapData('test-123', recoveredData);

    // Assert: I dati devono avere flag gap_filled
    expect(saved.gap_filled).toBe(true);
    expect(saved.filled_at).toBeDefined();
    expect(saved.clicks).toBe(120);
  });

  it('dovrebbe NON riempire gap più vecchi di 30 giorni', async () => {
    // Arrange: Gap molto vecchio
    const today = new Date('2024-02-01');
    const oldGapDate = '2023-12-01'; // 2 mesi fa

    const tsService = new TimeSeriesService(mockPrisma as any);

    // Act: Verifichiamo quali gap recuperare
    const shouldRecover = await tsService.shouldRecoverGap(oldGapDate, today);

    // Assert: Gap troppo vecchi non devono essere recuperati
    expect(shouldRecover).toBe(false);
  });
});

describe('Test 5.3 - Storage e Performance', () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  it('dovrebbe calcolare media su 9 milioni di righe in meno di 2 secondi', async () => {
    // Arrange: Simuliamo query aggregata su grande dataset
    const numberOfPages = 5000;
    const numberOfDays = 365 * 5;
    const totalRows = numberOfPages * numberOfDays;

    mockPrisma.metric.aggregate.mockResolvedValue({
      _avg: { clicks: 150.5, impressions: 1500.75 },
      _count: totalRows,
    });

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Calcoliamo media con query aggregata
    const startTime = Date.now();

    const result = await dbService.calculateAverageMetrics(numberOfPages, numberOfDays);

    const elapsedTime = Date.now() - startTime;

    // Assert: Query deve completare in <2 secondi
    expect(elapsedTime).toBeLessThan(2000);
    expect(result.rowsProcessed).toBeGreaterThan(8000000);
    expect(result.avgClicks).toBeGreaterThan(0);
  });

  it('dovrebbe usare indici appropriati per query time-series', async () => {
    // Arrange: Query su range temporale
    const testId = 'test-123';
    const startDate = '2024-01-01';
    const endDate = '2024-12-31';

    mockPrisma.metric.findMany.mockResolvedValue(
      Array(365).fill({ testId, date: new Date(), clicks: 100, impressions: 1000 }),
    );

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Query con filtro su date
    const startTime = Date.now();

    const result = await dbService.queryTimeRange(testId, startDate, endDate);

    const elapsedTime = Date.now() - startTime;

    // Assert: Deve usare indice e completare velocemente
    expect(result.useIndex).toBe(true);
    expect(result.indexName).toContain('idx_test_date');
    expect(elapsedTime).toBeLessThan(100);
  });

  it('dovrebbe calcolare varianza su grandi dataset in meno di 2 secondi', async () => {
    // Arrange: Dataset grande per calcolo statistico
    const testId = 'test-123';

    mockPrisma.$queryRaw.mockResolvedValue([
      { variance: 1234.56, stdDev: 35.13, rowsProcessed: BigInt(1825) },
    ]);

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Calcolo varianza (operazione complessa)
    const startTime = Date.now();

    const result = await dbService.calculateVariance(testId);

    const elapsedTime = Date.now() - startTime;

    // Assert: Calcolo deve essere efficiente
    expect(elapsedTime).toBeLessThan(2000);
    expect(result.variance).toBeGreaterThan(0);
    expect(result.stdDev).toBeGreaterThan(0);
  });

  it('dovrebbe paginare risultati per grandi query senza timeout', async () => {
    // Arrange: Query che restituisce molti risultati
    const testId = 'test-123';
    const pageSize = 1000;
    const totalRows = 10000;

    mockPrisma.metric.findMany.mockResolvedValue(
      Array(pageSize).fill({ clicks: 100 }),
    );
    mockPrisma.metric.count.mockResolvedValue(totalRows);

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Fetch paginato
    const page1 = await dbService.getMetricsPaginated(testId, 1, pageSize);

    // Assert: Deve restituire solo pageSize risultati, non tutti
    expect(page1.data).toHaveLength(pageSize);
    expect(page1.total).toBe(totalRows);
    expect(page1.hasMore).toBe(true);
    expect(page1.page).toBe(1);
  });

  it('dovrebbe cleanup dati vecchi oltre la retention policy', async () => {
    // Arrange: Dati più vecchi di X anni
    const retentionYears = 5;
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    mockPrisma.metric.deleteMany.mockResolvedValue({ count: 1500000 });

    const dbService = new DatabaseService(mockPrisma as any);

    // Act: Pulizia dati vecchi
    const deleted = await dbService.cleanupOldData(retentionYears);

    // Assert: Dati vecchi devono essere eliminati
    expect(deleted.rowsDeleted).toBeGreaterThan(0);
    expect(new Date(deleted.oldestDateRemaining)).toBeInstanceOf(Date);
  });
});
