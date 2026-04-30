/**
 * Test - Comando delete CLI
 *
 * Verifica: ID parziale, conferma interattiva, cascade metriche, audit log
 * Usa DB in-memory reale con mock solo per readline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestDb,
  seedUser,
  seedTest,
  type TestDB,
} from '../helpers/test-db';
import { tests, metrics, auditLogs } from '../../src/database/schema';

// Mock readline/promises
const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock('readline/promises', () => ({
  createInterface: () => ({ question: mockQuestion, close: mockClose }),
}));

// Mock db module — il DB reale viene iniettato via testDb
let testDb: TestDB;
vi.mock('../../src/database/db.js', () => ({
  get db() {
    return testDb;
  },
}));

// Mock chalk (passthrough)
vi.mock('chalk', () => ({
  default: new Proxy(
    {},
    {
      get: () => {
        const fn = (s: unknown) => String(s);
        return new Proxy(fn, { get: () => fn });
      },
    }
  ),
}));

// Mock formatters
vi.mock('../../src/cli/formatters.js', () => ({
  colors: {
    header: (s: string) => s,
    muted: (s: string) => s,
    error: (s: string) => s,
    success: (s: string) => s,
    info: (s: string) => s,
    uncertain: (s: string) => s,
  },
  colorStatus: (s: string) => s,
  colorPValue: (p: number | null) => String(p),
  colorImprovement: (p: number | null) => String(p),
  formatTestTable: () => '',
  formatStatusDetail: () => '',
  renderClicksChart: () => '',
}));

const { deleteCommand } = await import('../../src/cli/commands.js');

describe('Comando delete', () => {
  const testId = 'abcd1234-5678-9abc-def0-123456789abc';

  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
    seedUser(testDb, 'user-1');
    seedTest(testDb, {
      id: testId,
      name: 'Test SEO Homepage',
      status: 'running',
      userId: 'user-1',
      siteUrl: 'sc-domain:example.com',
    });
  });

  it('dovrebbe eliminare un test trovato per ID esatto con conferma "s"', async () => {
    // Inserisci metriche per il test
    testDb
      .insert(metrics)
      .values([
        { testId, date: '2024-01-01', clicks: 10, impressions: 100 },
        { testId, date: '2024-01-02', clicks: 20, impressions: 200 },
        { testId, date: '2024-01-03', clicks: 30, impressions: 300 },
        { testId, date: '2024-01-04', clicks: 40, impressions: 400 },
        { testId, date: '2024-01-05', clicks: 50, impressions: 500 },
      ])
      .run();

    mockQuestion.mockResolvedValue('s');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(testId);

    // Test eliminato
    const deleted = testDb
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();
    expect(deleted).toBeUndefined();

    // Audit log registrato
    const logs = testDb.select().from(auditLogs).all();
    expect(
      logs.some((l) => l.action === 'test_deleted' && l.testId === testId)
    ).toBe(true);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('eliminato con successo');
    expect(output).toContain('5 metriche rimosse');

    logSpy.mockRestore();
  });

  it('dovrebbe trovare il test per ID parziale', async () => {
    mockQuestion.mockResolvedValue('s');

    await deleteCommand('abcd');

    // Test eliminato
    const deleted = testDb
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();
    expect(deleted).toBeUndefined();
  });

  it("dovrebbe mostrare ambiguità se più test corrispondono all'ID parziale", async () => {
    seedTest(testDb, {
      id: 'abcd9999-aaaa-bbbb-cccc-dddddddddddd',
      name: 'Altro Test',
      userId: 'user-1',
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand('abcd');

    // Nessun test eliminato
    const remaining = testDb.select().from(tests).all();
    expect(remaining).toHaveLength(2);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Trovati 2 test');

    logSpy.mockRestore();
  });

  it('dovrebbe mostrare errore se il test non esiste', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand('zzzzz');

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('non trovato');

    logSpy.mockRestore();
  });

  it("dovrebbe annullare se l'utente non conferma", async () => {
    mockQuestion.mockResolvedValue('n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(testId);

    // Test ancora presente
    const existing = testDb
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();
    expect(existing).toBeDefined();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('annullata');

    logSpy.mockRestore();
  });

  it("dovrebbe annullare se l'utente preme Invio senza rispondere", async () => {
    mockQuestion.mockResolvedValue('');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(testId);

    const existing = testDb
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();
    expect(existing).toBeDefined();

    logSpy.mockRestore();
  });

  it('dovrebbe accettare "si" come conferma', async () => {
    mockQuestion.mockResolvedValue('si');

    await deleteCommand(testId);

    const deleted = testDb
      .select()
      .from(tests)
      .where(eq(tests.id, testId))
      .get();
    expect(deleted).toBeUndefined();
  });

  it('dovrebbe registrare audit log con action test_deleted', async () => {
    mockQuestion.mockResolvedValue('s');

    await deleteCommand(testId);

    const logs = testDb.select().from(auditLogs).all();
    const deleteLog = logs.find((l) => l.action === 'test_deleted');
    expect(deleteLog).toBeDefined();
    expect(deleteLog?.testId).toBe(testId);
    expect(deleteLog?.userId).toBe('user-1');
  });

  it('dovrebbe mostrare il nome del test prima della conferma', async () => {
    testDb
      .insert(metrics)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          testId,
          date: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
          clicks: 10,
          impressions: 100,
        }))
      )
      .run();

    mockQuestion.mockResolvedValue('n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(testId);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Test SEO Homepage');
    expect(output).toContain('10 record');

    logSpy.mockRestore();
  });
});
