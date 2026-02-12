/**
 * Test per ReportExportService
 *
 * Verifica generazione report Excel (.xlsx) e CSV
 * con metadata test e metriche giornaliere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import {
  ReportExportService,
  type ExportInput,
  type TestReportData,
  type MetricRow,
} from '../../src/services/ExportService.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function createTestData(overrides?: Partial<TestReportData>): TestReportData {
  return {
    id: 'test-abc-123',
    name: 'Migrazione HTTPS',
    siteUrl: 'sc-domain:example.com',
    urls: ['https://example.com/page1', 'https://example.com/page2'],
    startDate: '2025-01-01T00:00:00.000Z',
    splitDate: '2025-06-15T00:00:00.000Z',
    status: 'running',
    lastPValue: 0.032,
    lastImprovement: 12.5,
    ...overrides,
  };
}

function createMetrics(count: number): MetricRow[] {
  const metrics: MetricRow[] = [];
  const baseDate = new Date('2025-06-01');

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);

    metrics.push({
      date: date.toISOString(),
      clicks: 100 + Math.floor(i * 2.5),
      impressions: 1000 + i * 30,
      gapFilled: i % 10 === 0 && i > 0,
    });
  }

  return metrics;
}

function createInput(overrides?: Partial<ExportInput>): ExportInput {
  return {
    test: createTestData(),
    metrics: createMetrics(30),
    ...overrides,
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('ReportExportService', () => {
  let service: ReportExportService;

  beforeEach(() => {
    service = new ReportExportService();
  });

  // ── Excel Tests ───────────────────────────────────────────────────────────

  describe('exportToExcel', () => {
    it('genera un buffer Excel valido', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.format).toBe('xlsx');
      expect(result.rowCount).toBe(30);
    });

    it('il file Excel contiene i due fogli previsti', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      expect(workbook.worksheets.length).toBe(2);
      expect(workbook.worksheets[0].name).toBe('Riepilogo');
      expect(workbook.worksheets[1].name).toBe('Dati Giornalieri');
    });

    it('il foglio Riepilogo contiene il nome del test', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Migrazione HTTPS');
      expect(values).toContain('sc-domain:example.com');
      expect(values).toContain('test-abc-123');
    });

    it('il foglio Riepilogo mostra il P-Value', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('0.0320');
    });

    it('il foglio Riepilogo mostra il miglioramento con segno positivo', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('+12.5%');
    });

    it('mostra miglioramento negativo correttamente', async () => {
      const input = createInput({
        test: createTestData({ lastImprovement: -8.3 }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('-8.3%');
    });

    it('gestisce P-Value e miglioramento null', async () => {
      const input = createInput({
        test: createTestData({ lastPValue: null, lastImprovement: null }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Non disponibile');
    });

    it('il foglio Dati Giornalieri ha le colonne corrette', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      const headerRow = ws.getRow(1);

      expect(headerRow.getCell(1).value).toBe('Data');
      expect(headerRow.getCell(2).value).toBe('Clicks');
      expect(headerRow.getCell(3).value).toBe('Impressions');
      expect(headerRow.getCell(4).value).toBe('Gap Filled');
    });

    it('il foglio Dati Giornalieri contiene tutte le righe metriche', async () => {
      const metricsCount = 45;
      const input = createInput({ metrics: createMetrics(metricsCount) });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      // Riga 1 = header, righe 2..N+1 = dati
      expect(ws.rowCount).toBe(metricsCount + 1);
      expect(result.rowCount).toBe(metricsCount);
    });

    it('le date nel foglio Dati sono in formato YYYY-MM-DD', async () => {
      const input = createInput({ metrics: createMetrics(3) });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      const firstDataDate = ws.getRow(2).getCell(1).value as string;

      expect(firstDataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('genera un file con metriche vuote (solo header nel foglio dati)', async () => {
      const input = createInput({ metrics: [] });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      expect(ws.rowCount).toBe(1); // solo header
      expect(result.rowCount).toBe(0);
    });
  });

  // ── CSV Tests ─────────────────────────────────────────────────────────────

  describe('exportToCSV', () => {
    it('genera un buffer CSV valido', async () => {
      const input = createInput();
      const result = await service.exportToCSV(input);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.format).toBe('csv');
      expect(result.rowCount).toBe(30);
    });

    it('la prima riga è l\'header', async () => {
      const input = createInput();
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines[0]).toBe('Data,Clicks,Impressions,Gap Filled');
    });

    it('le righe dati hanno il formato corretto', async () => {
      const input = createInput({ metrics: createMetrics(3) });
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      // Riga 1 = header, righe successive = dati
      expect(lines.length).toBe(4); // header + 3 righe
      expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},\d+,\d+,(sì|no)$/);
    });

    it('gap_filled viene tradotto correttamente', async () => {
      const input = createInput({
        metrics: [
          { date: '2025-06-01', clicks: 10, impressions: 100, gapFilled: false },
          { date: '2025-06-02', clicks: 20, impressions: 200, gapFilled: true },
        ],
      });
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines[1]).toContain(',no');
      expect(lines[2]).toContain(',sì');
    });

    it('CSV vuoto ha solo header', async () => {
      const input = createInput({ metrics: [] });
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(1);
      expect(lines[0]).toBe('Data,Clicks,Impressions,Gap Filled');
    });
  });

  // ── File Name Tests ───────────────────────────────────────────────────────

  describe('buildFileName', () => {
    it('genera nome file con formato corretto', () => {
      const fileName = service.buildFileName('Test SEO', 'xlsx');
      expect(fileName).toMatch(/^report_Test_SEO_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('sanitizza caratteri speciali nel nome', () => {
      const fileName = service.buildFileName('Test/con:caratteri*speciali', 'csv');
      expect(fileName).not.toMatch(/[\/\*:]/);
      expect(fileName).toMatch(/\.csv$/);
    });

    it('gestisce nomi con accenti italiani', () => {
      const fileName = service.buildFileName('Migrazione Città', 'xlsx');
      expect(fileName).toMatch(/Migrazione_Citt/);
      expect(fileName).toMatch(/\.xlsx$/);
    });
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────

function getAllCellValues(ws: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined) {
        values.push(String(cell.value));
      }
    });
  });
  return values;
}
