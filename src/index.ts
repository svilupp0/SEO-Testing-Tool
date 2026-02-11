/**
 * Entry point per cron job
 *
 * Eseguito periodicamente per sincronizzare tutti i test SEO attivi:
 * - Fetch nuovi dati da Google Search Console
 * - Analisi statistica (Welch's t-test)
 * - Invio notifiche se risultati significativi
 *
 * Uso: npx tsx src/index.ts
 */

import { config } from 'dotenv';
config();

import { SEOExperimentOrchestrator } from './orchestrator/SEOExperimentOrchestrator.js';

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Avvio sincronizzazione test attivi...`);

  const orchestrator = new SEOExperimentOrchestrator();

  try {
    const result = await orchestrator.syncAllActiveTests();

    console.log(`[${new Date().toISOString()}] Sincronizzazione completata:`);
    console.log(`  Test totali: ${result.totalTests}`);
    console.log(`  Successi: ${result.successCount}`);
    console.log(`  Errori: ${result.errorCount}`);

    for (const r of result.results) {
      const status = r.isSignificant ? 'SIGNIFICATIVO' : 'in corso';
      console.log(`  [${r.testId}] ${status} - p=${r.pValue?.toFixed(4)} (${r.dataPointsBefore}+${r.dataPointsAfter} punti)`);
    }

    if (result.errors.length > 0) {
      console.error('Errori:');
      for (const err of result.errors) {
        console.error(`  [${err.testId}] ${err.error}`);
      }
    }

    process.exit(result.errorCount === result.totalTests && result.totalTests > 0 ? 1 : 0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Errore fatale:`, error);
    process.exit(1);
  }
}

main();
