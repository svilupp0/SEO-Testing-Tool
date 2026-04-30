/**
 * Test - Comando export CLI
 *
 * Verifica: scelta formato interattiva, generazione Excel/CSV,
 * gestione metriche vuote, flag --format diretto.
 * Usa DB in-memory reale con mock per inquirer e fs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTestDb,
  seedUser,
  seedTest,
  seedMetrics,
  type TestDB,
} from '../helpers/test-db';
import { metrics } from '../../src/database/schema';

// ── Mock: readline/promises (usato da prompt() helper) ──────────────────────
const mockQuestion = vi.fn().mockResolvedValue('');
const mockClose = vi.fn();
vi.mock('readline/promises', () => ({
  createInterface: () => ({ question: mockQuestion, close: mockClose }),
}));

// ── Mock: inquirer ──────────────────────────────────────────────────────────
const mockPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: { prompt: (...args: unknown[]) => mockPrompt(...args) },
}));

// ── Mock: fs/promises (writeFile) ───────────────────────────────────────────
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// ── Mock: db module ─────────────────────────────────────────────────────────
let testDb: TestDB;
vi.mock('../../src/database/db.js', () => ({
  get db() {
    return testDb;
  },
}));

// ── Mock: chalk (passthrough) ───────────────────────────────────────────────
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

// ── Mock: formatters ────────────────────────────────────────────────────────
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

const { exportCommand } = await import('../../src/cli/commands.js');

// ── Fixtures ────────────────────────────────────────────────────────────────

const TEST_ID = 'export-test-1234-5678-9abc-def0';

function setupTestWithMetrics(metricDays = 15) {
  seedUser(testDb, 'user-1');
  seedTest(testDb, {
    id: TEST_ID,
    name: 'Migrazione HTTPS',
    status: 'running',
    userId: 'user-1',
    siteUrl: 'sc-domain:example.com',
  });
  if (metricDays > 0) {
    seedMetrics(testDb, TEST_ID, '2025-01-01', metricDays, 50);
  }
}

// ── Test Suite ──────────────────────────────────────────────────────────────

describe('Comando export', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── Selezione formato interattiva ───────────────────────────────────────

  it('chiede il formato via inquirer quando non specificato', async () => {
    setupTestWithMetrics();
    mockPrompt.mockResolvedValueOnce({ format: 'csv' });

    await exportCommand(TEST_ID);

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    const promptArg = mockPrompt.mock.calls[0][0];
    expect(promptArg[0].type).toBe('list');
    expect(promptArg[0].choices).toHaveLength(2);
  });

  it('non chiede il formato se --format è specificato', async () => {
    setupTestWithMetrics();

    await exportCommand(TEST_ID, { format: 'csv' });

    expect(mockPrompt).not.toHaveBeenCalled();
  });

  // ── Export CSV ──────────────────────────────────────────────────────────

  it("genera un file CSV quando l'utente sceglie csv", async () => {
    setupTestWithMetrics();
    mockPrompt.mockResolvedValueOnce({ format: 'csv' });

    await exportCommand(TEST_ID);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, buffer] = mockWriteFile.mock.calls[0];
    expect(filePath).toMatch(/\.csv$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const csv = buffer.toString('utf-8');
    expect(csv).toContain('Data,Clicks,Impressions,CTR (%),Periodo,Gap Filled');
  });

  it('genera un file CSV con --format=csv diretto', async () => {
    setupTestWithMetrics(5);

    await exportCommand(TEST_ID, { format: 'csv' });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(filePath).toMatch(/report_Migrazione_HTTPS_.*\.csv$/);
  });

  // ── Export Excel ────────────────────────────────────────────────────────

  it("genera un file Excel quando l'utente sceglie xlsx", async () => {
    setupTestWithMetrics();
    mockPrompt.mockResolvedValueOnce({ format: 'xlsx' });

    await exportCommand(TEST_ID);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, buffer] = mockWriteFile.mock.calls[0];
    expect(filePath).toMatch(/\.xlsx$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100); // un Excel valido è > 100 bytes
  });

  it('genera un file Excel con --format=xlsx diretto', async () => {
    setupTestWithMetrics(10);

    await exportCommand(TEST_ID, { format: 'xlsx' });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(filePath).toMatch(/report_Migrazione_HTTPS_.*\.xlsx$/);
  });

  // ── Feedback UX ─────────────────────────────────────────────────────────

  it('mostra messaggio di successo con percorso file', async () => {
    setupTestWithMetrics(10);

    await exportCommand(TEST_ID, { format: 'csv' });

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Export completato');
    expect(output).toMatch(/File:.*report_Migrazione_HTTPS/);
    expect(output).toContain('10 giorni');
  });

  it('mostra messaggio di successo per Excel con formato corretto', async () => {
    setupTestWithMetrics(20);
    mockPrompt.mockResolvedValueOnce({ format: 'xlsx' });

    await exportCommand(TEST_ID);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Export completato');
    expect(output).toContain('XLSX');
    expect(output).toContain('20 giorni');
  });

  // ── Metriche vuote ────────────────────────────────────────────────────

  it('mostra avviso se il test non ha metriche', async () => {
    setupTestWithMetrics(0);

    await exportCommand(TEST_ID);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockPrompt).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Nessuna metrica disponibile');
    expect(output).toContain('seo-tool run');
  });

  // ── Test non trovato ──────────────────────────────────────────────────

  it('mostra errore se il test non esiste', async () => {
    seedUser(testDb, 'user-1');

    await exportCommand('id-inesistente');

    expect(mockWriteFile).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('non trovato');
  });

  // ── ID parziale ───────────────────────────────────────────────────────

  it('trova il test per ID parziale', async () => {
    setupTestWithMetrics(5);

    await exportCommand('export-test', { format: 'csv' });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });
});
