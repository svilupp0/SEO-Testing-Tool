/**
 * ExportService
 *
 * Genera report professionali in formato Excel (.xlsx) e CSV
 * a partire dai dati di un test SEO (metadata + metriche giornaliere).
 */

import ExcelJS from 'exceljs';

// ── Interfacce ────────────────────────────────────────────────────────────────

export interface TestReportData {
  id: string;
  name: string;
  siteUrl: string;
  urls: string[];
  startDate: string;
  splitDate: string;
  status: string;
  lastPValue: number | null;
  lastImprovement: number | null;
}

export interface MetricRow {
  date: string;
  clicks: number;
  impressions: number;
  gapFilled: boolean;
}

export interface ExportInput {
  test: TestReportData;
  metrics: MetricRow[];
}

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  format: 'xlsx' | 'csv';
  rowCount: number;
}

// ── Costanti stile ────────────────────────────────────────────────────────────

const COLORS = {
  primary: '1B4F72',
  headerBg: '2C3E50',
  headerFont: 'FFFFFF',
  labelBg: 'EBF5FB',
  greenBg: 'E8F8F5',
  greenFont: '1E8449',
  redBg: 'FDEDEC',
  redFont: 'C0392B',
  zebraBg: 'F8F9F9',
  borderColor: 'D5D8DC',
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

export class ReportExportService {
  /**
   * Genera un file Excel professionale con due fogli:
   * - Riepilogo (metadata + analisi)
   * - Dati Giornalieri (tabella metriche)
   */
  async exportToExcel(input: ExportInput): Promise<ExportResult> {
    const { test, metrics } = input;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SEO Testing Tool';
    workbook.created = new Date();

    this.buildRiepilogoSheet(workbook, test, metrics);
    this.buildDatiSheet(workbook, metrics);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      fileName: this.buildFileName(test.name, 'xlsx'),
      format: 'xlsx',
      rowCount: metrics.length,
    };
  }

  /**
   * Genera un file CSV piatto con le metriche giornaliere.
   */
  async exportToCSV(input: ExportInput): Promise<ExportResult> {
    const { test, metrics } = input;
    const lines: string[] = [];

    // Header
    lines.push('Data,Clicks,Impressions,Gap Filled');

    // Righe
    for (const m of metrics) {
      const date = m.date.includes('T') ? m.date.split('T')[0] : m.date;
      lines.push(`${date},${m.clicks},${m.impressions},${m.gapFilled ? 'sì' : 'no'}`);
    }

    const csv = lines.join('\n') + '\n';
    const buffer = Buffer.from(csv, 'utf-8');

    return {
      buffer,
      fileName: this.buildFileName(test.name, 'csv'),
      format: 'csv',
      rowCount: metrics.length,
    };
  }

  // ── Foglio 1: Riepilogo ───────────────────────────────────────────────────

  private buildRiepilogoSheet(
    workbook: ExcelJS.Workbook,
    test: TestReportData,
    metrics: MetricRow[],
  ): void {
    const ws = workbook.addWorksheet('Riepilogo', {
      properties: { defaultColWidth: 30 },
    });

    // Larghezze colonne
    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 50;

    let row = 1;

    // ── Titolo ──────────────────────────────────────────────────────────────
    const titleCell = ws.getCell(row, 1);
    titleCell.value = 'SEO Testing Tool — Report';
    titleCell.font = { size: 16, bold: true, color: { argb: COLORS.primary } };
    ws.mergeCells(row, 1, row, 2);
    row += 2;

    // ── Sezione: Informazioni Test ──────────────────────────────────────────
    row = this.addSectionHeader(ws, row, 'Informazioni Test');

    const startDateFormatted = this.formatDate(test.startDate);
    const splitDateFormatted = this.formatDate(test.splitDate);

    const infoRows: [string, string][] = [
      ['Nome Test', test.name],
      ['ID', test.id],
      ['Proprietà GSC', test.siteUrl],
      ['URL monitorati', test.urls.join(', ') || '—'],
      ['Data Inizio', startDateFormatted],
      ['Split Date', splitDateFormatted],
      ['Stato', test.status.toUpperCase()],
      ['Metriche raccolte', `${metrics.length} giorni`],
    ];

    for (const [label, value] of infoRows) {
      row = this.addLabelValueRow(ws, row, label, value);
    }

    row += 1;

    // ── Sezione: Risultati Analisi ──────────────────────────────────────────
    row = this.addSectionHeader(ws, row, 'Risultati Analisi');

    // P-Value
    const pValueStr = test.lastPValue !== null
      ? test.lastPValue.toFixed(4)
      : 'Non disponibile';

    const pRow = this.addLabelValueRow(ws, row, 'P-Value', pValueStr);
    if (test.lastPValue !== null) {
      const pCell = ws.getCell(row, 2);
      if (test.lastPValue < 0.05) {
        pCell.font = { bold: true, color: { argb: COLORS.greenFont } };
        pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
      } else {
        pCell.font = { color: { argb: COLORS.redFont } };
      }
    }
    row = pRow;

    // Significatività
    const sigStr = test.lastPValue !== null
      ? (test.lastPValue < 0.05 ? 'SIGNIFICATIVO' : 'Non significativo')
      : '—';
    row = this.addLabelValueRow(ws, row, 'Significatività', sigStr);

    // Miglioramento %
    const improvStr = test.lastImprovement !== null
      ? `${test.lastImprovement >= 0 ? '+' : ''}${test.lastImprovement.toFixed(1)}%`
      : 'Non disponibile';

    const improvRowNum = row;
    row = this.addLabelValueRow(ws, row, 'Miglioramento', improvStr);

    if (test.lastImprovement !== null) {
      const improvCell = ws.getCell(improvRowNum, 2);
      if (test.lastImprovement >= 0) {
        improvCell.font = { bold: true, color: { argb: COLORS.greenFont } };
        improvCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
      } else {
        improvCell.font = { bold: true, color: { argb: COLORS.redFont } };
        improvCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
      }
    }

    row += 1;

    // ── Footer ──────────────────────────────────────────────────────────────
    const footerCell = ws.getCell(row, 1);
    footerCell.value = `Report generato il ${new Date().toLocaleDateString('it-IT')} — SEO Testing Tool v1.0.0`;
    footerCell.font = { size: 9, italic: true, color: { argb: '999999' } };
    ws.mergeCells(row, 1, row, 2);
  }

  // ── Foglio 2: Dati Giornalieri ──────────────────────────────────────────

  private buildDatiSheet(workbook: ExcelJS.Workbook, metrics: MetricRow[]): void {
    const ws = workbook.addWorksheet('Dati Giornalieri', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Colonne
    ws.columns = [
      { header: 'Data', key: 'date', width: 14 },
      { header: 'Clicks', key: 'clicks', width: 12 },
      { header: 'Impressions', key: 'impressions', width: 14 },
      { header: 'Gap Filled', key: 'gapFilled', width: 12 },
    ];

    // Stile header
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLORS.headerFont } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
      };
    });

    // Righe dati
    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      const date = m.date.includes('T') ? m.date.split('T')[0] : m.date;

      const dataRow = ws.addRow({
        date,
        clicks: m.clicks,
        impressions: m.impressions,
        gapFilled: m.gapFilled ? 'Sì' : 'No',
      });

      // Zebra striping
      if (i % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraBg } };
        });
      }

      // Allineamento numerico
      dataRow.getCell('clicks').alignment = { horizontal: 'right' };
      dataRow.getCell('impressions').alignment = { horizontal: 'right' };
      dataRow.getCell('gapFilled').alignment = { horizontal: 'center' };
    }

    // Auto-filtro
    if (metrics.length > 0) {
      ws.autoFilter = { from: 'A1', to: 'D1' };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private addSectionHeader(ws: ExcelJS.Worksheet, row: number, title: string): number {
    const cell = ws.getCell(row, 1);
    cell.value = title;
    cell.font = { size: 12, bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    const cell2 = ws.getCell(row, 2);
    cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    ws.mergeCells(row, 1, row, 2);
    return row + 1;
  }

  private addLabelValueRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string): number {
    const labelCell = ws.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: '555555' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.labelBg } };
    labelCell.border = {
      bottom: { style: 'hair', color: { argb: COLORS.borderColor } },
    };

    const valueCell = ws.getCell(row, 2);
    valueCell.value = value;
    valueCell.border = {
      bottom: { style: 'hair', color: { argb: COLORS.borderColor } },
    };

    return row + 1;
  }

  buildFileName(testName: string, ext: 'xlsx' | 'csv'): string {
    const safeName = testName.replace(/[^a-zA-Z0-9àèéìòù_-]/gi, '_').replace(/_+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `report_${safeName}_${date}.${ext}`;
  }

  private formatDate(isoDate: string): string {
    try {
      return new Date(isoDate).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return isoDate;
    }
  }
}
