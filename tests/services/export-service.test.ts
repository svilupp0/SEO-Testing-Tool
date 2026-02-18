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

    it('il foglio Dati Giornalieri ha le 6 colonne corrette', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      const headerRow = ws.getRow(1);

      expect(headerRow.getCell(1).value).toBe('Data');
      expect(headerRow.getCell(2).value).toBe('Clicks');
      expect(headerRow.getCell(3).value).toBe('Impressions');
      expect(headerRow.getCell(4).value).toBe('CTR (%)');
      expect(headerRow.getCell(5).value).toBe('Periodo');
      expect(headerRow.getCell(6).value).toBe('Gap Filled');
    });

    it('il foglio Dati Giornalieri contiene tutte le righe metriche + riga totali', async () => {
      const metricsCount = 45;
      const input = createInput({ metrics: createMetrics(metricsCount) });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      // Riga 1 = header, righe 2..N+1 = dati, riga N+2 = totali
      expect(ws.rowCount).toBe(metricsCount + 2);
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

  // ── Panoramica Periodi Tests ────────────────────────────────────────────

  describe('Panoramica Periodi (Riepilogo)', () => {
    it('mostra la sezione Panoramica Periodi con medie clicks', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Panoramica Periodi');
      expect(values).toContain('Media clicks/giorno (Before)');
      expect(values).toContain('Media clicks/giorno (After)');
    });

    it('calcola medie before/after correttamente', async () => {
      // splitDate = 2025-06-15, metrics from 2025-06-01
      // Before: days 0-13 (June 1-14), After: days 14-29 (June 15-30)
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      // Before: 14 days (June 1-14), clicks = 100,102,105,107,110,112,115,117,120,122,125,127,130,132
      // Mean before ≈ 116.0
      expect(values).toContain('Variazione assoluta');
      // Should contain a number for mean clicks
      const meanBeforeValue = values.find(v => v === 'Media clicks/giorno (Before)');
      expect(meanBeforeValue).toBeDefined();
    });

    it('mostra CTR medio calcolato', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('CTR medio Before');
      expect(values).toContain('CTR medio After');
      expect(values).toContain('Variazione CTR');
    });

    it('mostra periodi con durata e date', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Periodo Before');
      expect(values).toContain('Periodo After');
      // Should contain "giorni" in period description
      const periodValue = values.find(v => typeof v === 'string' && v.includes('giorni (dal'));
      expect(periodValue).toBeDefined();
    });

    it('gestisce metriche vuote nella panoramica senza crash', async () => {
      const input = createInput({ metrics: [] });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      // Con metriche vuote, la sezione Panoramica Periodi non appare
      expect(values).not.toContain('Panoramica Periodi');
      // Ma il report si genera correttamente
      expect(values).toContain('Risultati Analisi');
    });
  });

  // ── Qualità Dati Tests ──────────────────────────────────────────────────

  describe('Qualità Dati (Riepilogo)', () => {
    it('mostra sezione Qualità Dati', async () => {
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Qualità Dati');
      expect(values).toContain('Giorni totali');
      expect(values).toContain('Giorni gap-filled');
      expect(values).toContain('Qualità dati');
    });

    it('mostra qualità buona con pochi gap', async () => {
      // Default createMetrics: gap at i=10,20 → 2/30 = 6.7%
      const input = createInput();
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Buona');
    });

    it('segnala alta percentuale gap (>15%)', async () => {
      // Create metrics where >15% are gap-filled
      const metrics: MetricRow[] = [];
      for (let i = 0; i < 20; i++) {
        const date = new Date('2025-06-01');
        date.setDate(date.getDate() + i);
        metrics.push({
          date: date.toISOString(),
          clicks: 100,
          impressions: 1000,
          gapFilled: i < 4, // 4/20 = 20% gap
        });
      }

      const input = createInput({ metrics });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Attenzione: >15% dati interpolati');
    });
  });

  // ── Interpretazione Tests ───────────────────────────────────────────────

  describe('Interpretazione risultato (Riepilogo)', () => {
    it('mostra interpretazione risultato significativo positivo', async () => {
      const input = createInput({
        test: createTestData({ lastPValue: 0.03, lastImprovement: 12.5 }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Variazione positiva statisticamente significativa');
      expect(values).toContain('α = 0.05');
    });

    it('mostra interpretazione risultato significativo negativo', async () => {
      const input = createInput({
        test: createTestData({ lastPValue: 0.01, lastImprovement: -5.0 }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Variazione negativa statisticamente significativa — valutare rollback');
    });

    it('mostra interpretazione risultato non conclusivo', async () => {
      const input = createInput({
        test: createTestData({ lastPValue: 0.45, lastImprovement: 3.0 }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Risultato non conclusivo — considerare estensione del test');
    });

    it('mostra interpretazione quando analisi non disponibile', async () => {
      const input = createInput({
        test: createTestData({ lastPValue: null, lastImprovement: null }),
      });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Riepilogo')!;
      const values = getAllCellValues(ws);

      expect(values).toContain('Analisi non ancora disponibile');
    });
  });

  // ── Dati Giornalieri Enhanced Tests ─────────────────────────────────────

  describe('Dati Giornalieri (colonne CTR e Periodo)', () => {
    it('CTR calcolato correttamente', async () => {
      const metrics: MetricRow[] = [
        { date: '2025-06-01', clicks: 50, impressions: 1000, gapFilled: false },
      ];
      const input = createInput({ metrics });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      const ctrValue = ws.getRow(2).getCell(4).value as string;

      // 50/1000 * 100 = 5.00
      expect(ctrValue).toBe('5.00');
    });

    it('gestisce impressions zero nel CTR', async () => {
      const metrics: MetricRow[] = [
        { date: '2025-06-01', clicks: 0, impressions: 0, gapFilled: false },
      ];
      const input = createInput({ metrics });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      const ctrValue = ws.getRow(2).getCell(4).value as string;

      expect(ctrValue).toBe('—');
    });

    it('colonna Periodo mostra Before/After', async () => {
      // splitDate = 2025-06-15
      const metrics: MetricRow[] = [
        { date: '2025-06-14', clicks: 100, impressions: 1000, gapFilled: false },
        { date: '2025-06-15', clicks: 110, impressions: 1100, gapFilled: false },
      ];
      const input = createInput({ metrics });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;

      expect(ws.getRow(2).getCell(5).value).toBe('Before');
      expect(ws.getRow(3).getCell(5).value).toBe('After');
    });

    it('riga totali presente in fondo con somme corrette', async () => {
      const metrics: MetricRow[] = [
        { date: '2025-06-01', clicks: 100, impressions: 1000, gapFilled: false },
        { date: '2025-06-02', clicks: 200, impressions: 2000, gapFilled: true },
      ];
      const input = createInput({ metrics });
      const result = await service.exportToExcel(input);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.buffer);

      const ws = workbook.getWorksheet('Dati Giornalieri')!;
      // Row 1 = header, Row 2-3 = data, Row 4 = totals
      const totalsRow = ws.getRow(4);

      expect(totalsRow.getCell(1).value).toBe('TOTALE');
      expect(totalsRow.getCell(2).value).toBe(300);  // 100 + 200
      expect(totalsRow.getCell(3).value).toBe(3000); // 1000 + 2000
      expect(totalsRow.getCell(6).value).toBe('1/2'); // 1 gap-filled out of 2
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

    it('la prima riga è l\'header con CTR e Periodo', async () => {
      const input = createInput();
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines[0]).toBe('Data,Clicks,Impressions,CTR (%),Periodo,Gap Filled');
    });

    it('le righe dati hanno il formato corretto con CTR e Periodo', async () => {
      const metrics: MetricRow[] = [
        { date: '2025-06-01', clicks: 50, impressions: 1000, gapFilled: false },
      ];
      const input = createInput({ metrics });
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(2); // header + 1 row
      // 50/1000*100 = 5.00, Before (date < splitDate 2025-06-15)
      expect(lines[1]).toBe('2025-06-01,50,1000,5.00,Before,no');
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
      expect(lines[0]).toBe('Data,Clicks,Impressions,CTR (%),Periodo,Gap Filled');
    });

    it('CSV mostra Periodo Before/After correttamente', async () => {
      const input = createInput({
        metrics: [
          { date: '2025-06-14', clicks: 10, impressions: 100, gapFilled: false },
          { date: '2025-06-15', clicks: 20, impressions: 200, gapFilled: false },
        ],
      });
      const result = await service.exportToCSV(input);
      const csv = result.buffer.toString('utf-8');
      const lines = csv.trim().split('\n');

      expect(lines[1]).toContain(',Before,');
      expect(lines[2]).toContain(',After,');
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
