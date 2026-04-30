/**
 * CLI Formatters
 *
 * Colori, tabelle e grafici ASCII per il terminale.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
// @ts-ignore - no type declarations available
import asciichart from 'asciichart';
import type { AnalysisResult } from '../stats/StatisticalEngine.js';

// --- Colori ---

export const colors = {
  significant: chalk.green.bold,
  uncertain: chalk.yellow,
  notSignificant: chalk.gray,
  error: chalk.red.bold,
  success: chalk.green,
  info: chalk.cyan,
  header: chalk.white.bold,
  muted: chalk.gray,
  value: chalk.white,
};

export function colorPValue(p: number | null): string {
  if (p === null) return colors.muted('—');
  if (p < 0.05) return colors.significant(p.toFixed(4));
  if (p < 0.1) return colors.uncertain(p.toFixed(4));
  return colors.notSignificant(p.toFixed(4));
}

export function colorStatus(status: string): string {
  switch (status) {
    case 'completed':
      return colors.significant(status);
    case 'running':
      return colors.uncertain(status);
    case 'failed':
      return colors.error(status);
    case 'paused':
      return colors.muted(status);
    default:
      return status;
  }
}

export function colorImprovement(pct: number | null): string {
  if (pct === null) return colors.muted('—');
  const sign = pct >= 0 ? '+' : '';
  const formatted = `${sign}${pct.toFixed(1)}%`;
  if (pct > 0) return chalk.green(formatted);
  if (pct < 0) return chalk.red(formatted);
  return colors.muted(formatted);
}

// --- Tabelle ---

export function formatTestTable(tests: any[]): string {
  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Nome'),
      chalk.cyan('Stato'),
      chalk.cyan('p-Value'),
      chalk.cyan('Migliora.'),
      chalk.cyan('Ultimo Sync'),
    ],
    style: { head: [], border: [] },
  });

  for (const t of tests) {
    const shortId = t.id.substring(0, 8);
    const syncDate = t.lastSyncAt
      ? new Date(t.lastSyncAt).toLocaleDateString('it-IT')
      : colors.muted('mai');

    table.push([
      colors.muted(shortId),
      t.name,
      colorStatus(t.status),
      colorPValue(t.lastPValue),
      colorImprovement(t.lastImprovement),
      syncDate,
    ]);
  }

  return table.toString();
}

export function formatStatusDetail(
  test: any,
  analysis: AnalysisResult
): string {
  const lines: string[] = [];
  const divider = colors.muted('─'.repeat(50));

  lines.push('');
  lines.push(colors.header(`  ${test.name}`));
  lines.push(divider);
  lines.push(`  ${colors.muted('ID:')}          ${test.id}`);
  lines.push(`  ${colors.muted('Sito:')}        ${test.siteUrl}`);
  lines.push(`  ${colors.muted('Stato:')}       ${colorStatus(test.status)}`);
  lines.push(
    `  ${colors.muted('Inizio:')}      ${new Date(test.startDate).toLocaleDateString('it-IT')}`
  );
  lines.push(
    `  ${colors.muted('Split Date:')}  ${new Date(test.splitDate).toLocaleDateString('it-IT')}`
  );
  lines.push('');
  lines.push(colors.header('  Analisi Statistica'));
  lines.push(divider);

  const sigLabel = analysis.isSignificant
    ? colors.significant('SIGNIFICATIVO')
    : analysis.hasInsufficientData
      ? colors.uncertain('DATI INSUFFICIENTI')
      : colors.muted('Non significativo');

  lines.push(`  ${colors.muted('Risultato:')}   ${sigLabel}`);
  lines.push(
    `  ${colors.muted('p-Value:')}     ${colorPValue(analysis.pValue)}`
  );

  const arrow =
    analysis.percentageChange >= 0 ? chalk.green('↑') : chalk.red('↓');
  lines.push(
    `  ${colors.muted('Variazione:')}  ${arrow} ${colorImprovement(analysis.percentageChange)}`
  );

  if (analysis.tStatistic !== undefined) {
    lines.push(
      `  ${colors.muted('t-Statistic:')} ${colors.value(analysis.tStatistic.toFixed(4))}`
    );
  }
  if (analysis.degreesOfFreedom !== undefined) {
    lines.push(
      `  ${colors.muted('Gradi lib.:')}  ${colors.value(analysis.degreesOfFreedom.toFixed(1))}`
    );
  }

  lines.push('');
  lines.push(colors.header('  Dati'));
  lines.push(divider);

  // Calcola medie
  const beforeClicks = test._beforeClicks as number[] | undefined;
  const afterClicks = test._afterClicks as number[] | undefined;
  const meanBefore =
    beforeClicks && beforeClicks.length > 0
      ? (
          beforeClicks.reduce((a: number, b: number) => a + b, 0) /
          beforeClicks.length
        ).toFixed(1)
      : '—';
  const meanAfter =
    afterClicks && afterClicks.length > 0
      ? (
          afterClicks.reduce((a: number, b: number) => a + b, 0) /
          afterClicks.length
        ).toFixed(1)
      : '—';

  lines.push(
    `  ${colors.muted('Before:')}      ${colors.value(meanBefore)} media clicks  (${beforeClicks?.length ?? 0} giorni)`
  );
  lines.push(
    `  ${colors.muted('After:')}       ${colors.value(meanAfter)} media clicks  (${afterClicks?.length ?? 0} giorni)`
  );

  if (analysis.outliersDetected) {
    lines.push(
      `  ${colors.uncertain(`Outlier rilevati: ${analysis.outliers.length}`)}`
    );
  }
  if (analysis.seasonalityDetected) {
    lines.push(`  ${colors.info('Stagionalità rilevata (periodo 7 giorni)')}`);
  }

  lines.push('');
  return lines.join('\n');
}

// --- Grafici ---

export function renderClicksChart(metrics: any[], splitDate: Date): string {
  if (metrics.length === 0)
    return colors.muted('  Nessun dato disponibile per il grafico.');

  const sorted = [...metrics].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const clicks = sorted.map((m: any) => m.clicks);

  // Trova indice splitDate
  const splitTime = splitDate.getTime();
  let splitIndex = sorted.findIndex(
    (m: any) => new Date(m.date).getTime() >= splitTime
  );
  if (splitIndex === -1) splitIndex = sorted.length;

  const chartHeight = Math.min(12, Math.max(4, clicks.length > 0 ? 8 : 4));

  const chart = asciichart.plot(clicks, {
    height: chartHeight,
    format: (x: number) => String(Math.round(x)).padStart(6),
  });

  const lines: string[] = [];
  lines.push('');
  lines.push(colors.header('  Trend Clicks'));
  lines.push(colors.muted('  ' + '─'.repeat(50)));
  lines.push('');

  // Aggiungi il grafico con padding
  for (const line of chart.split('\n')) {
    lines.push('  ' + line);
  }

  // Indicatore splitDate sotto il grafico
  // L'offset del grafico è ~8 caratteri (asse Y labels)
  const chartOffset = 8;
  if (splitIndex > 0 && splitIndex < sorted.length) {
    const markerPos = chartOffset + splitIndex;
    const markerLine = ' '.repeat(markerPos) + chalk.yellow('▲');
    const labelLine =
      ' '.repeat(Math.max(0, markerPos - 5)) + chalk.yellow('Split Date');
    lines.push('  ' + markerLine);
    lines.push('  ' + labelLine);
  }

  // Asse X: prima e ultima data
  const firstDate = new Date(sorted[0].date).toLocaleDateString('it-IT');
  const lastDate = new Date(sorted[sorted.length - 1].date).toLocaleDateString(
    'it-IT'
  );
  lines.push('');
  lines.push(
    `  ${colors.muted(firstDate)}${' '.repeat(Math.max(2, 40 - firstDate.length - lastDate.length))}${colors.muted(lastDate)}`
  );
  lines.push('');

  return lines.join('\n');
}
