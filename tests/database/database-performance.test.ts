/**
 * Test 5 - Database e Performance (La Tenuta)
 *
 * Questi test verificano che il sistema regga sotto carico e che i dati rimangano consistenti.
 * Usano un database SQLite in-memory per isolamento totale.
 *
 * TDD RED → GREEN workflow
 */

import { DatabaseService } from '../../src/database/DatabaseService';
import { TimeSeriesService } from '../../src/database/TimeSeriesService';
import { createTestDb, seedUser, seedTest, seedMetrics, type TestDB } from '../helpers/test-db';
import { metrics } from '../../src/database/schema';

describe('Test 5.1 - Concorrenza', () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db);
    seedTest(db);
  });

  it('dovrebbe gestire 100 richieste simultanee senza deadlock', async () => {
    const numberOfUsers = 100;
    const dbService = new DatabaseService(db as any);

    // Act: Lanciamo 100 richieste simultanee
    const promises = Array.from({ length: numberOfUsers }, (_, i) => {
      return dbService.getTestReport('test-123', 'user-1');
    });

    const results = await Promise.all(promises);

    // Assert: Tutte le 100 richieste devono completare con successo
    expect(results).toHaveLength(numberOfUsers);
    expect(results.every(r => r !== null)).toBe(true);
  });

  it('dovrebbe prevenire race condition quando più utenti modificano lo stesso test', async () => {
    // Arrange: crea utenti extra
    seedUser(db, 'user-2', 'user2@test.com');
    seedTest(db, { id: 'test-race', userId: 'user-1' });

    const dbService = new DatabaseService(db as any);

    // Act: Modifiche simultanee (solo user-1 è proprietario)
    const [result1, result2] = await Promise.all([
      dbService.updateTest('test-race', { name: 'Updated by user 1' }, 'user-1'),
      dbService.updateTest('test-race', { name: 'Updated by user 2' }, 'user-2'),
    ]);

    // Assert: Solo l'update di user-1 (proprietario) ha effetto
    expect(result1.matchedCount).toBe(1);
    expect(result2.matchedCount).toBe(0);
  });

  it('dovrebbe gestire transazioni atomiche per operazioni multi-step', async () => {
    const testData = {
      name: 'Test Transazionale',
      startDate: '2024-01-01',
      urls: ['https://example.com/page1'],
    };

    const metrics = [
      { date: '2024-01-01', clicks: 100, impressions: 1000 },
      { date: '2024-01-02', clicks: 120, impressions: 1100 },
    ];

    const dbService = new DatabaseService(db as any);

    // Act
    const result = await dbService.createTestWithMetrics(testData, metrics, 'user-1');

    // Assert
    expect(result.testId).toBeDefined();
    expect(result.metricsInserted).toBe(2);
    expect(result.statsUpdated).toBe(true);
  });
});

describe('Test 5.2 - Integrità Serie Temporale', () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db);
    seedTest(db);
  });

  it('dovrebbe rilevare gap nella serie temporale dopo fetch fallito', async () => {
    const tsService = new TimeSeriesService(db as any);

    // Salva dati con un gap (manca il 2024-01-03)
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
    const tsService = new TimeSeriesService(db as any);

    // Salva dati fino al 2024-01-02
    await tsService.saveData('test-123', [
      { date: '2024-01-01', clicks: 100 },
      { date: '2024-01-02', clicks: 110 },
    ]);

    // Act: Fetch successivo deve recuperare anche i gap
    const fetchDates = await tsService.getFetchDates('test-123', '2024-01-04');

    // Assert: Deve pianificare fetch sia per il gap che per oggi
    expect(fetchDates).toContain('2024-01-03');
    expect(fetchDates).toContain('2024-01-04');
    expect(fetchDates).toHaveLength(2);
  });

  it('dovrebbe mantenere flag "gap_filled" per tracciare recupero dati', async () => {
    const tsService = new TimeSeriesService(db as any);

    const recoveredData = {
      date: '2024-01-03',
      clicks: 120,
      impressions: 1050,
    };

    // Act: Salviamo dati recuperati con flag
    const saved = await tsService.saveGapData('test-123', recoveredData);

    // Assert: I dati devono avere flag gap_filled
    expect(saved.gap_filled).toBe(true);
    expect(saved.filled_at).toBeDefined();
    expect(saved.clicks).toBe(120);
  });

  it('dovrebbe NON riempire gap più vecchi di 30 giorni', async () => {
    const today = new Date('2024-02-01');
    const oldGapDate = '2023-12-01'; // 2 mesi fa

    const tsService = new TimeSeriesService(db as any);

    // Act: Verifichiamo quali gap recuperare
    const shouldRecover = await tsService.shouldRecoverGap(oldGapDate, today);

    // Assert: Gap troppo vecchi non devono essere recuperati
    expect(shouldRecover).toBe(false);
  });
});

describe('Test 5.3 - Storage e Performance', () => {
  let db: TestDB;

  beforeEach(() => {
    db = createTestDb();
    seedUser(db);
    seedTest(db);
  });

  it('dovrebbe calcolare media su grandi dataset', async () => {
    // Arrange: Inseriamo un set di metriche reali
    seedMetrics(db, 'test-123', '2024-01-01', 365, 150);

    const dbService = new DatabaseService(db as any);

    // Act
    const result = await dbService.calculateAverageMetrics(1, 365);

    // Assert
    expect(result.rowsProcessed).toBe(365);
    expect(result.avgClicks).toBeGreaterThan(0);
    expect(result.avgImpressions).toBeGreaterThan(0);
  });

  it('dovrebbe usare indici appropriati per query time-series', async () => {
    seedMetrics(db, 'test-123', '2024-01-01', 365, 100);

    const dbService = new DatabaseService(db as any);

    const startTime = Date.now();
    const result = await dbService.queryTimeRange('test-123', '2024-01-01', '2024-12-31');
    const elapsedTime = Date.now() - startTime;

    expect(result.useIndex).toBe(true);
    expect(result.indexName).toContain('idx_test_date');
    expect(result.rows).toBe(365);
    expect(elapsedTime).toBeLessThan(1000);
  });

  it('dovrebbe calcolare varianza su grandi dataset in meno di 2 secondi', async () => {
    // Arrange: Inseriamo metriche con clicks variabili
    const rows = Array.from({ length: 365 }, (_, i) => ({
      testId: 'test-123',
      date: new Date(2024, 0, 1 + i).toISOString(),
      clicks: 100 + (i % 100),
      impressions: 1000,
    }));
    db.insert(metrics).values(rows).run();

    const dbService = new DatabaseService(db as any);

    const startTime = Date.now();
    const result = await dbService.calculateVariance('test-123');
    const elapsedTime = Date.now() - startTime;

    expect(elapsedTime).toBeLessThan(2000);
    expect(result.variance).toBeGreaterThan(0);
    expect(result.stdDev).toBeGreaterThan(0);
    expect(result.rowsProcessed).toBe(365);
  });

  it('dovrebbe paginare risultati per grandi query senza timeout', async () => {
    seedMetrics(db, 'test-123', '2024-01-01', 100, 100);

    const dbService = new DatabaseService(db as any);
    const pageSize = 10;

    const page1 = await dbService.getMetricsPaginated('test-123', 1, pageSize);

    expect(page1.data).toHaveLength(pageSize);
    expect(page1.total).toBe(100);
    expect(page1.hasMore).toBe(true);
    expect(page1.page).toBe(1);
  });

  it('dovrebbe cleanup dati vecchi oltre la retention policy', async () => {
    // Arrange: Inserisci metriche con createdAt molto vecchio
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 6);

    db.insert(metrics).values([
      { testId: 'test-123', date: oldDate.toISOString(), clicks: 50, impressions: 500, createdAt: oldDate.toISOString() },
    ]).run();

    // Inserisci anche metriche recenti
    seedMetrics(db, 'test-123', '2024-01-01', 10, 100);

    const dbService = new DatabaseService(db as any);

    const deleted = await dbService.cleanupOldData(5);

    expect(deleted.rowsDeleted).toBe(1);
    expect(new Date(deleted.oldestDateRemaining)).toBeInstanceOf(Date);
  });
});
