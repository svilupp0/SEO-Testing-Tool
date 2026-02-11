#!/usr/bin/env node

/**
 * SEO Testing Tool — CLI
 *
 * Interfaccia a riga di comando per gestire esperimenti SEO:
 *   seo-tool add          Crea un nuovo test
 *   seo-tool list         Mostra tutti i test
 *   seo-tool status <id>  Dettaglio test con grafico
 *   seo-tool run          Sincronizza test attivi
 *   seo-tool export <id>  Esporta dati in CSV
 *   seo-tool delete <id>  Elimina un test
 */

import { config } from 'dotenv';
config();

import { Command } from 'commander';
import {
  addCommand,
  listCommand,
  statusCommand,
  runCommand,
  exportCommand,
  deleteCommand,
} from './cli/commands.js';

const program = new Command();

program
  .name('seo-tool')
  .description('SEO Testing Tool — Analisi statistica per esperimenti SEO')
  .version('1.0.0');

program
  .command('add')
  .description('Crea un nuovo test SEO')
  .action(addCommand);

program
  .command('list')
  .description('Mostra tutti i test')
  .action(listCommand);

program
  .command('status')
  .argument('<id>', 'ID del test (anche parziale)')
  .description('Mostra dettaglio test con analisi e grafico')
  .action(statusCommand);

program
  .command('run')
  .description('Sincronizza tutti i test attivi (per cron job)')
  .action(runCommand);

program
  .command('export')
  .argument('<id>', 'ID del test (anche parziale)')
  .option('--format <fmt>', 'Formato export (csv)', 'csv')
  .description('Esporta dati test su file')
  .action(exportCommand);

program
  .command('delete')
  .argument('<id>', 'ID del test (anche parziale)')
  .description('Elimina un test e le metriche collegate')
  .action(deleteCommand);

program.parse();
