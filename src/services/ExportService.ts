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
  warningBg: 'FEF9E7',
  warningFont: 'B7950B',
  splitBg: 'FFF9E0',
  totalsBg: 'EAECEE',
  zebraBg: 'F8F9F9',
  borderColor: 'D5D8DC',
} as const;

interface PeriodStats {
  beforeDays: number;
  afterDays: number;
  beforeFirstDate: string;
  beforeLastDate: string;
  afterFirstDate: string;
  afterLastDate: string;
  meanClicksBefore: number;
  meanClicksAfter: number;
  meanImpressionsBefore: number;
  meanImpressionsAfter: number;
  ctrBefore: number;
  ctrAfter: number;
  clicksVariation: number;
  ctrVariationPp: number;
  gapFilledCount: number;
  gapFilledPercent: number;
}

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
    this.buildDatiSheet(workbook, metrics, test.splitDate);

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
    const splitDateStr = test.splitDate.includes('T') ? test.splitDate.split('T')[0] : test.splitDate;

    // Header
    lines.push('Data,Clicks,Impressions,CTR (%),Periodo,Gap Filled');

    // Righe
    for (const m of metrics) {
      const date = m.date.includes('T') ? m.date.split('T')[0] : m.date;
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions * 100).toFixed(2) : '';
      const periodo = date >= splitDateStr ? 'After' : 'Before';
      lines.push(`${date},${m.clicks},${m.impressions},${ctr},${periodo},${m.gapFilled ? 'sì' : 'no'}`);
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
    ws.getColumn(1).width = 28;
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

    // ── Sezione: Panoramica Periodi ───────────────────────────────────────
    const stats = this.computePeriodStats(metrics, test.splitDate);

    if (metrics.length > 0) {
      row = this.addSectionHeader(ws, row, 'Panoramica Periodi');

      const periodRows: [string, string][] = [
        ['Periodo Before', stats.beforeDays > 0
          ? `${stats.beforeDays} giorni (dal ${this.formatDate(stats.beforeFirstDate)} al ${this.formatDate(stats.beforeLastDate)})`
          : 'Nessun dato'],
        ['Periodo After', stats.afterDays > 0
          ? `${stats.afterDays} giorni (dal ${this.formatDate(stats.afterFirstDate)} al ${this.formatDate(stats.afterLastDate)})`
          : 'Nessun dato'],
        ['Media clicks/giorno (Before)', stats.beforeDays > 0 ? stats.meanClicksBefore.toFixed(1) : '—'],
        ['Media clicks/giorno (After)', stats.afterDays > 0 ? stats.meanClicksAfter.toFixed(1) : '—'],
      ];

      for (const [label, value] of periodRows) {
        row = this.addLabelValueRow(ws, row, label, value);
      }

      // Variazione assoluta clicks (color-coded)
      if (stats.beforeDays > 0 && stats.afterDays > 0) {
        const variationStr = `${stats.clicksVariation >= 0 ? '+' : ''}${stats.clicksVariation.toFixed(1)} clicks/giorno`;
        const variationRowNum = row;
        row = this.addLabelValueRow(ws, row, 'Variazione assoluta', variationStr);
        this.applyColorCoding(ws, variationRowNum, stats.clicksVariation);
      }

      // Impressions
      const impressionRows: [string, string][] = [
        ['Media impressions/giorno (Before)', stats.beforeDays > 0 ? stats.meanImpressionsBefore.toFixed(0) : '—'],
        ['Media impressions/giorno (After)', stats.afterDays > 0 ? stats.meanImpressionsAfter.toFixed(0) : '—'],
      ];
      for (const [label, value] of impressionRows) {
        row = this.addLabelValueRow(ws, row, label, value);
      }

      // CTR
      const ctrRows: [string, string][] = [
        ['CTR medio Before', stats.beforeDays > 0 ? `${stats.ctrBefore.toFixed(2)}%` : '—'],
        ['CTR medio After', stats.afterDays > 0 ? `${stats.ctrAfter.toFixed(2)}%` : '—'],
      ];
      for (const [label, value] of ctrRows) {
        row = this.addLabelValueRow(ws, row, label, value);
      }

      // Variazione CTR (color-coded)
      if (stats.beforeDays > 0 && stats.afterDays > 0) {
        const ctrVarStr = `${stats.ctrVariationPp >= 0 ? '+' : ''}${stats.ctrVariationPp.toFixed(2)} pp`;
        const ctrVarRowNum = row;
        row = this.addLabelValueRow(ws, row, 'Variazione CTR', ctrVarStr);
        this.applyColorCoding(ws, ctrVarRowNum, stats.ctrVariationPp);
      }

      row += 1;
    }

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

    // Soglia utilizzata
    row = this.addLabelValueRow(ws, row, 'Soglia utilizzata', 'α = 0.05');

    // Interpretazione
    const interpretation = this.getInterpretation(test.lastPValue, test.lastImprovement);
    row = this.addLabelValueRow(ws, row, 'Interpretazione', interpretation);

    row += 1;

    // ── Sezione: Qualità Dati ───────────────────────────────────────────────
    row = this.addSectionHeader(ws, row, 'Qualità Dati');

    row = this.addLabelValueRow(ws, row, 'Giorni totali', `${metrics.length}`);

    const gapStr = metrics.length > 0
      ? `${stats.gapFilledCount} (${stats.gapFilledPercent.toFixed(1)}%)`
      : '0';
    row = this.addLabelValueRow(ws, row, 'Giorni gap-filled', gapStr);

    // Qualità con color-coding
    const qualityRowNum = row;
    const isHighGap = metrics.length > 0 && stats.gapFilledPercent >= 15;
    const qualityStr = metrics.length === 0
      ? '—'
      : isHighGap
        ? 'Attenzione: >15% dati interpolati'
        : 'Buona';
    row = this.addLabelValueRow(ws, row, 'Qualità dati', qualityStr);

    if (metrics.length > 0) {
      const qualityCell = ws.getCell(qualityRowNum, 2);
      if (isHighGap) {
        qualityCell.font = { bold: true, color: { argb: COLORS.warningFont } };
        qualityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.warningBg } };
      } else {
        qualityCell.font = { bold: true, color: { argb: COLORS.greenFont } };
        qualityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
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

  private buildDatiSheet(workbook: ExcelJS.Workbook, metrics: MetricRow[], splitDate: string): void {
    const ws = workbook.addWorksheet('Dati Giornalieri', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const splitDateStr = splitDate.includes('T') ? splitDate.split('T')[0] : splitDate;

    // Colonne
    ws.columns = [
      { header: 'Data', key: 'date', width: 14 },
      { header: 'Clicks', key: 'clicks', width: 12 },
      { header: 'Impressions', key: 'impressions', width: 14 },
      { header: 'CTR (%)', key: 'ctr', width: 10 },
      { header: 'Periodo', key: 'periodo', width: 10 },
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
    let splitHighlighted = false;
    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      const date = m.date.includes('T') ? m.date.split('T')[0] : m.date;
      const isAfter = date >= splitDateStr;
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions * 100).toFixed(2) : '—';

      const dataRow = ws.addRow({
        date,
        clicks: m.clicks,
        impressions: m.impressions,
        ctr,
        periodo: isAfter ? 'After' : 'Before',
        gapFilled: m.gapFilled ? 'Sì' : 'No',
      });

      // Evidenzia prima riga After (split date)
      if (isAfter && !splitHighlighted) {
        splitHighlighted = true;
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.splitBg } };
          cell.border = {
            top: { style: 'medium', color: { argb: COLORS.warningFont } },
          };
        });
      } else if (i % 2 === 1) {
        // Zebra striping (skip for split row)
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraBg } };
        });
      }

      // Allineamento
      dataRow.getCell('clicks').alignment = { horizontal: 'right' };
      dataRow.getCell('impressions').alignment = { horizontal: 'right' };
      dataRow.getCell('ctr').alignment = { horizontal: 'right' };
      dataRow.getCell('periodo').alignment = { horizontal: 'center' };
      dataRow.getCell('gapFilled').alignment = { horizontal: 'center' };
    }

    // Riga totali/medie
    if (metrics.length > 0) {
      const totalClicks = metrics.reduce((s, m) => s + m.clicks, 0);
      const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : '—';
      const gapCount = metrics.filter(m => m.gapFilled).length;

      const totalsRow = ws.addRow({
        date: 'TOTALE',
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: avgCtr,
        periodo: '—',
        gapFilled: `${gapCount}/${metrics.length}`,
      });

      totalsRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalsBg } };
        cell.border = {
          top: { style: 'double', color: { argb: COLORS.borderColor } },
        };
      });

      totalsRow.getCell('clicks').alignment = { horizontal: 'right' };
      totalsRow.getCell('impressions').alignment = { horizontal: 'right' };
      totalsRow.getCell('ctr').alignment = { horizontal: 'right' };
      totalsRow.getCell('periodo').alignment = { horizontal: 'center' };
      totalsRow.getCell('gapFilled').alignment = { horizontal: 'center' };
    }

    // Auto-filtro
    if (metrics.length > 0) {
      ws.autoFilter = { from: 'A1', to: 'F1' };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computePeriodStats(metrics: MetricRow[], splitDate: string): PeriodStats {
    const splitDateStr = splitDate.includes('T') ? splitDate.split('T')[0] : splitDate;

    const normalize = (d: string) => d.includes('T') ? d.split('T')[0] : d;

    const before = metrics.filter(m => normalize(m.date) < splitDateStr);
    const after = metrics.filter(m => normalize(m.date) >= splitDateStr);

    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const meanClicksBefore = mean(before.map(m => m.clicks));
    const meanClicksAfter = mean(after.map(m => m.clicks));
    const meanImprBefore = mean(before.map(m => m.impressions));
    const meanImprAfter = mean(after.map(m => m.impressions));

    const totalClicksBefore = before.reduce((s, m) => s + m.clicks, 0);
    const totalImprBefore = before.reduce((s, m) => s + m.impressions, 0);
    const totalClicksAfter = after.reduce((s, m) => s + m.clicks, 0);
    const totalImprAfter = after.reduce((s, m) => s + m.impressions, 0);

    const ctrBefore = totalImprBefore > 0 ? (totalClicksBefore / totalImprBefore * 100) : 0;
    const ctrAfter = totalImprAfter > 0 ? (totalClicksAfter / totalImprAfter * 100) : 0;

    const gapFilledCount = metrics.filter(m => m.gapFilled).length;

    const sortedBefore = before.map(m => normalize(m.date)).sort();
    const sortedAfter = after.map(m => normalize(m.date)).sort();

    return {
      beforeDays: before.length,
      afterDays: after.length,
      beforeFirstDate: sortedBefore[0] ?? '',
      beforeLastDate: sortedBefore[sortedBefore.length - 1] ?? '',
      afterFirstDate: sortedAfter[0] ?? '',
      afterLastDate: sortedAfter[sortedAfter.length - 1] ?? '',
      meanClicksBefore,
      meanClicksAfter,
      meanImpressionsBefore: meanImprBefore,
      meanImpressionsAfter: meanImprAfter,
      ctrBefore,
      ctrAfter,
      clicksVariation: meanClicksAfter - meanClicksBefore,
      ctrVariationPp: ctrAfter - ctrBefore,
      gapFilledCount,
      gapFilledPercent: metrics.length > 0 ? (gapFilledCount / metrics.length * 100) : 0,
    };
  }

  private getInterpretation(pValue: number | null, improvement: number | null): string {
    if (pValue === null) return 'Analisi non ancora disponibile';
    if (pValue < 0.05 && improvement !== null && improvement > 0) {
      return 'Variazione positiva statisticamente significativa';
    }
    if (pValue < 0.05 && improvement !== null && improvement < 0) {
      return 'Variazione negativa statisticamente significativa — valutare rollback';
    }
    return 'Risultato non conclusivo — considerare estensione del test';
  }

  private applyColorCoding(ws: ExcelJS.Worksheet, rowNum: number, value: number): void {
    const cell = ws.getCell(rowNum, 2);
    if (value >= 0) {
      cell.font = { bold: true, color: { argb: COLORS.greenFont } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.greenBg } };
    } else {
      cell.font = { bold: true, color: { argb: COLORS.redFont } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redBg } };
    }
  }

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
