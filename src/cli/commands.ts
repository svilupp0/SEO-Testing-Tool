/**
 * CLI Commands
 *
 * Implementazione dei 6 comandi: add, list, status, run, export, delete
 */

import { createInterface } from 'readline/promises';
import { writeFile } from 'fs/promises';
import chalk from 'chalk';
import { prisma } from '../database/prisma.js';
import { StatisticalEngine } from '../stats/StatisticalEngine.js';
import { SEOExperimentOrchestrator } from '../orchestrator/SEOExperimentOrchestrator.js';
import { ExportService } from '../ui/ExportService.js';
import {
  colors,
  colorStatus,
  colorPValue,
  colorImprovement,
  formatTestTable,
  formatStatusDetail,
  renderClicksChart,
} from './formatters.js';

// --- Helpers ---

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${colors.muted(`[${defaultValue}]`)} ` : ' ';
  try {
    const answer = await rl.question(`${colors.info('?')} ${question}${suffix}`);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// --- Commands ---

/**
 * add — Crea un nuovo test SEO con prompt interattivi
 */
export async function addCommand(): Promise<void> {
  console.log('');
  console.log(colors.header('  Nuovo Test SEO'));
  console.log(colors.muted('  ' + '─'.repeat(40)));
  console.log('');

  try {
    const name = await prompt('Nome del test:');
    if (!name) {
      console.log(colors.error('  Nome obbligatorio. Operazione annullata.'));
      return;
    }

    const siteUrl = await prompt('Proprietà GSC (es. sc-domain:example.com):');
    if (!siteUrl) {
      console.log(colors.error('  Proprietà GSC obbligatoria. Operazione annullata.'));
      return;
    }

    const urlsInput = await prompt('URL da monitorare (separati da virgola):');
    const urls = urlsInput.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      console.log(colors.error('  Almeno un URL necessario. Operazione annullata.'));
      return;
    }

    const splitDateStr = await prompt('Split Date (YYYY-MM-DD):', today());
    const startDateStr = await prompt('Data inizio raccolta (YYYY-MM-DD):', '2024-01-01');
    const userId = await prompt('User ID:', process.env['USER_ID'] || 'default-user');

    // Validazione date
    const splitDate = new Date(splitDateStr);
    const startDate = new Date(startDateStr);
    if (isNaN(splitDate.getTime()) || isNaN(startDate.getTime())) {
      console.log(colors.error('  Formato data non valido. Usa YYYY-MM-DD.'));
      return;
    }

    // Verifica che l'utente esista, altrimenti crealo
    const existingUser = await (prisma as any).user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      await (prisma as any).user.create({
        data: { id: userId, email: `${userId}@seo-tool.local` },
      });
    }

    // Crea il test
    const test = await (prisma as any).test.create({
      data: {
        name,
        siteUrl,
        urls,
        startDate,
        splitDate,
        status: 'running',
        userId,
      },
    });

    console.log('');
    console.log(colors.success(`  Test creato con successo!`));
    console.log(`  ${colors.muted('ID:')} ${test.id}`);
    console.log('');
  } catch (error) {
    console.error(colors.error(`  Errore: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * list — Mostra tabella con tutti i test
 */
export async function listCommand(): Promise<void> {
  try {
    const tests = await (prisma as any).test.findMany({
      orderBy: { createdAt: 'desc' },
    });

    console.log('');

    if (tests.length === 0) {
      console.log(colors.muted('  Nessun test trovato. Usa "seo-tool add" per crearne uno.'));
      console.log('');
      return;
    }

    console.log(colors.header(`  ${tests.length} test trovati`));
    console.log('');
    console.log(formatTestTable(tests));
    console.log('');
  } catch (error) {
    console.error(colors.error(`  Errore: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * status <id> — Dettaglio di un singolo test con analisi e grafico
 */
export async function statusCommand(id: string): Promise<void> {
  try {
    // Cerca per ID esatto o parziale
    let test = await (prisma as any).test.findUnique({
      where: { id },
      include: { metrics: { orderBy: { date: 'asc' } } },
    });

    // Se non trovato, prova con ID parziale
    if (!test) {
      const candidates = await (prisma as any).test.findMany({
        where: { id: { startsWith: id } },
        include: { metrics: { orderBy: { date: 'asc' } } },
      });

      if (candidates.length === 1) {
        test = candidates[0];
      } else if (candidates.length > 1) {
        console.log(colors.uncertain(`  Trovati ${candidates.length} test con ID che inizia per "${id}":`));
        for (const c of candidates) {
          console.log(`    ${colors.muted(c.id.substring(0, 8))} ${c.name}`);
        }
        return;
      } else {
        console.log(colors.error(`  Test "${id}" non trovato.`));
        return;
      }
    }

    // Dividi metriche before/after
    const splitTime = test.splitDate.getTime();
    const beforeClicks = test.metrics
      .filter((m: any) => m.date.getTime() < splitTime)
      .map((m: any) => m.clicks);
    const afterClicks = test.metrics
      .filter((m: any) => m.date.getTime() >= splitTime)
      .map((m: any) => m.clicks);

    // Analisi statistica
    const engine = new StatisticalEngine();
    const analysis = engine.analyze({
      before: beforeClicks,
      after: afterClicks,
    });

    // Attacca dati per il formatter
    test._beforeClicks = beforeClicks;
    test._afterClicks = afterClicks;

    // Stampa dettaglio
    console.log(formatStatusDetail(test, analysis));

    // Grafico ASCII
    if (test.metrics.length > 0) {
      console.log(renderClicksChart(test.metrics, test.splitDate));
    }
  } catch (error) {
    console.error(colors.error(`  Errore: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * run — Sincronizza tutti i test attivi via orchestratore
 */
export async function runCommand(): Promise<void> {
  console.log('');
  console.log(colors.header('  Sincronizzazione Test Attivi'));
  console.log(colors.muted('  ' + '─'.repeat(40)));
  console.log('');
  console.log(colors.info('  Avvio sincronizzazione...'));
  console.log('');

  try {
    const orchestrator = new SEOExperimentOrchestrator();
    const result = await orchestrator.syncAllActiveTests();

    if (result.totalTests === 0) {
      console.log(colors.muted('  Nessun test attivo da sincronizzare.'));
      console.log('');
      return;
    }

    // Risultati per ogni test
    for (const r of result.results) {
      const icon = r.isSignificant ? chalk.green('✓') : chalk.yellow('○');
      const pStr = r.pValue !== null ? `p=${r.pValue.toFixed(4)}` : '';
      const changeStr = colorImprovement(r.percentageChange);
      console.log(`  ${icon} ${colors.muted(r.testId.substring(0, 8))} ${changeStr} ${colors.muted(pStr)}`);

      if (r.notificationSent) {
        console.log(`    ${colors.info('→ Notifica inviata')}`);
      }
    }

    // Errori
    for (const err of result.errors) {
      console.log(`  ${chalk.red('✗')} ${colors.muted(err.testId.substring(0, 8))} ${colors.error(err.error)}`);
    }

    // Riepilogo
    console.log('');
    console.log(colors.muted('  ' + '─'.repeat(40)));
    console.log(`  ${colors.success(`${result.successCount} completati`)} · ${result.errorCount > 0 ? colors.error(`${result.errorCount} errori`) : colors.muted('0 errori')}`);
    console.log('');
  } catch (error) {
    console.error(colors.error(`  Errore fatale: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * export <id> — Esporta dati test su file CSV
 */
export async function exportCommand(id: string, options: { format: string }): Promise<void> {
  try {
    // Cerca test (supporta ID parziale)
    let test = await (prisma as any).test.findUnique({
      where: { id },
      include: { metrics: { orderBy: { date: 'asc' } } },
    });

    if (!test) {
      const candidates = await (prisma as any).test.findMany({
        where: { id: { startsWith: id } },
        include: { metrics: { orderBy: { date: 'asc' } } },
      });
      if (candidates.length === 1) test = candidates[0];
      else {
        console.log(colors.error(`  Test "${id}" non trovato.`));
        return;
      }
    }

    if (test.metrics.length === 0) {
      console.log(colors.uncertain('  Nessuna metrica da esportare per questo test.'));
      return;
    }

    const format = options.format || 'csv';

    if (format === 'csv') {
      const exportService = new ExportService();
      const rows = test.metrics.map((m: any) => ({
        date: m.date.toISOString().split('T')[0],
        clicks: m.clicks,
        impressions: m.impressions,
        gapFilled: m.gapFilled ? 'yes' : 'no',
      }));

      const csv = await exportService.exportToCSV(rows);

      // Nome file: NomeTest_2024-01-15.csv
      const safeName = test.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeName}_${today()}.csv`;

      await writeFile(fileName, csv, 'utf-8');

      console.log('');
      console.log(colors.success(`  Export completato!`));
      console.log(`  ${colors.muted('File:')}   ${fileName}`);
      console.log(`  ${colors.muted('Righe:')}  ${rows.length}`);
      console.log(`  ${colors.muted('Format:')} ${format.toUpperCase()}`);
      console.log('');
    } else {
      console.log(colors.error(`  Formato "${format}" non supportato. Usa --format=csv`));
    }
  } catch (error) {
    console.error(colors.error(`  Errore: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * delete <id> — Elimina un test (con conferma interattiva) e registra nell'Audit Log
 */
export async function deleteCommand(id: string): Promise<void> {
  try {
    // Cerca test (supporta ID parziale)
    let test = await (prisma as any).test.findUnique({ where: { id } });

    if (!test) {
      const candidates = await (prisma as any).test.findMany({
        where: { id: { startsWith: id } },
      });

      if (candidates.length === 1) {
        test = candidates[0];
      } else if (candidates.length > 1) {
        console.log(colors.uncertain(`  Trovati ${candidates.length} test con ID che inizia per "${id}":`));
        for (const c of candidates) {
          console.log(`    ${colors.muted(c.id.substring(0, 8))} ${c.name}`);
        }
        return;
      } else {
        console.log(colors.error(`  Test "${id}" non trovato.`));
        return;
      }
    }

    // Conta metriche collegate
    const metricsCount = await (prisma as any).metric.count({ where: { testId: test.id } });

    // Mostra info e chiedi conferma
    console.log('');
    console.log(colors.header('  Eliminazione Test'));
    console.log(colors.muted('  ' + '─'.repeat(40)));
    console.log(`  ${colors.muted('Nome:')}     ${test.name}`);
    console.log(`  ${colors.muted('ID:')}       ${test.id}`);
    console.log(`  ${colors.muted('Stato:')}    ${colorStatus(test.status)}`);
    console.log(`  ${colors.muted('Metriche:')} ${metricsCount} record`);
    console.log('');

    const answer = await prompt(
      chalk.red('Confermi l\'eliminazione? Questa operazione è irreversibile. (s/N):'),
    );

    if (answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'si' && answer.toLowerCase() !== 'sì') {
      console.log(colors.muted('  Operazione annullata.'));
      return;
    }

    // Elimina il test (le metriche vengono eliminate via onDelete: Cascade)
    await (prisma as any).test.delete({ where: { id: test.id } });

    // Registra nell'Audit Log
    await (prisma as any).auditLog.create({
      data: {
        testId: test.id,
        action: 'test_deleted',
        userId: test.userId,
      },
    });

    console.log('');
    console.log(colors.success(`  Test "${test.name}" eliminato con successo.`));
    if (metricsCount > 0) {
      console.log(colors.muted(`  ${metricsCount} metriche rimosse (cascade).`));
    }
    console.log('');
  } catch (error) {
    console.error(colors.error(`  Errore: ${error instanceof Error ? error.message : error}`));
  }
}
