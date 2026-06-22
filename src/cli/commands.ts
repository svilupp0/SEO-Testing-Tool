/**
 * CLI Commands
 *
 * Implementazione dei 7 comandi: login, add, list, status, run, export, delete
 */

import { createInterface } from 'readline/promises';
import { writeFile, readFile } from 'fs/promises';
import open from 'open';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { eq, like, desc, count } from 'drizzle-orm';
import { db } from '../database/db.js';
import {
  users,
  tests,
  metrics,
  auditLogs,
  oauthTokens,
} from '../database/schema.js';
import { StatisticalEngine } from '../stats/StatisticalEngine.js';
import { SEOExperimentOrchestrator } from '../orchestrator/SEOExperimentOrchestrator.js';
import {
  ReportExportService,
  type MetricRow,
  type ExportInput,
} from '../services/ExportService.js';
import { GoogleOAuthService } from '../auth/GoogleOAuthService.js';
import { TokenManager } from '../auth/TokenManager.js';
import { getGoogleOAuthConfig } from '../config/env.js';
import {
  colors,
  colorStatus,
  colorImprovement,
  formatTestTable,
  formatStatusDetail,
  renderClicksChart,
} from './formatters.js';

// --- Helpers ---

async function prompt(
  question: string,
  defaultValue?: string
): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${colors.muted(`[${defaultValue}]`)} ` : ' ';
  try {
    const answer = await rl.question(
      `${colors.info('?')} ${question}${suffix}`
    );
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Cerca test per ID esatto o parziale. Restituisce il test o null.
 * Se ci sono più candidati con ID parziale, li stampa e restituisce null.
 */
function findTestById(id: string) {
  // Cerca per ID esatto
  const exact = db.select().from(tests).where(eq(tests.id, id)).get();
  if (exact) return exact;

  // Prova con ID parziale
  const candidates = db
    .select()
    .from(tests)
    .where(like(tests.id, `${id}%`))
    .all();

  if (candidates.length === 1) return candidates[0];

  if (candidates.length > 1) {
    console.log(
      colors.uncertain(
        `  Trovati ${candidates.length} test con ID che inizia per "${id}":`
      )
    );
    for (const c of candidates) {
      console.log(`    ${colors.muted(c.id.substring(0, 8))} ${c.name}`);
    }
    return null;
  }

  console.log(colors.error(`  Test "${id}" non trovato.`));
  return null;
}

// --- Commands ---

/**
 * login — Collega l'account Google per accedere a Google Search Console
 */
export async function loginCommand(): Promise<void> {
  console.log('');
  console.log(colors.header('  Login Google Search Console'));
  console.log(colors.muted('  ' + '\u2500'.repeat(40)));
  console.log('');

  try {
    const oauthConfig = getGoogleOAuthConfig();
    const oauthService = new GoogleOAuthService({
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
      redirectUri: oauthConfig.redirectUri,
    });

    // Genera URL di autenticazione
    const authUrl = oauthService.getAuthorizationUrl(oauthConfig.scopes);

    console.log(
      colors.info(
        '  \uD83D\uDD10 Per collegare il tuo account Google, apri questo URL nel browser:'
      )
    );
    console.log('');
    console.log(`  ${chalk.underline(authUrl)}`);
    console.log('');
    console.log(
      colors.muted(
        '  Dopo il login, Google ti mostrerà un Codice di Autorizzazione.'
      )
    );
    console.log(colors.muted('  Copialo e incollalo qui sotto.'));
    console.log('');

    // Chiedi il codice di autorizzazione
    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Incolla il Codice di Autorizzazione:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Il codice è obbligatorio.',
      },
    ]);

    console.log('');
    console.log(colors.muted('  Scambio codice in corso...'));

    // Scambia il codice per i token
    const tokenResponse = await oauthService.exchangeCodeForTokens(code.trim());

    // Determina userId
    const userId = process.env['USER_ID'] || 'default-user';

    // Assicurati che l'utente esista
    const existingUser = db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!existingUser) {
      db.insert(users)
        .values({ id: userId, email: `${userId}@seo-tool.local` })
        .run();
    }

    // Salva (o aggiorna) i token nel database
    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    const existing = db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
      .get();

    if (existing) {
      db.update(oauthTokens)
        .set({
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(oauthTokens.userId, userId))
        .run();
    } else {
      db.insert(oauthTokens)
        .values({
          userId,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
        })
        .run();
    }

    // Registra nell'audit log
    db.insert(auditLogs)
      .values({
        testId: 'system',
        action: 'user_login',
        userId,
      })
      .run();

    console.log('');
    console.log(
      colors.success(
        "  \u2705 Login effettuato! Ora puoi lanciare 'seo-tool run' per scaricare i dati."
      )
    );
    console.log('');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Google OAuth credentials not configured')) {
      console.log(colors.error('  Credenziali Google non configurate.'));
      console.log(
        colors.muted(
          '  Crea un file .env con GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'
        )
      );
      console.log(colors.muted('  Vedi .env.example per un esempio.'));
    } else {
      console.log(colors.error(`  Errore: ${msg}`));
    }
    console.log('');
  }
}

/**
 * add — Crea un nuovo test SEO con prompt interattivi
 */
export async function addCommand(): Promise<void> {
  console.log('');
  console.log(colors.header('  Nuovo Test SEO'));
  console.log(colors.muted('  ' + '\u2500'.repeat(40)));
  console.log('');

  try {
    const name = await prompt('Nome del test:');
    if (!name) {
      console.log(colors.error('  Nome obbligatorio. Operazione annullata.'));
      return;
    }

    const siteUrl = await prompt('Proprietà GSC (es. sc-domain:example.com):');
    if (!siteUrl) {
      console.log(
        colors.error('  Proprietà GSC obbligatoria. Operazione annullata.')
      );
      return;
    }

    const urlsInput = await prompt('URL da monitorare (separati da virgola):');
    const urls = urlsInput
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      console.log(
        colors.error('  Almeno un URL necessario. Operazione annullata.')
      );
      return;
    }

    const splitDateStr = await prompt('Split Date (YYYY-MM-DD):', today());
    const startDateStr = await prompt(
      'Data inizio raccolta (YYYY-MM-DD):',
      '2024-01-01'
    );
    const userId = await prompt(
      'User ID:',
      process.env['USER_ID'] || 'default-user'
    );

    // Validazione date
    const splitDate = new Date(splitDateStr);
    const startDate = new Date(startDateStr);
    if (isNaN(splitDate.getTime()) || isNaN(startDate.getTime())) {
      console.log(colors.error('  Formato data non valido. Usa YYYY-MM-DD.'));
      return;
    }

    // Verifica che l'utente esista, altrimenti crealo
    const existingUser = db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!existingUser) {
      db.insert(users)
        .values({ id: userId, email: `${userId}@seo-tool.local` })
        .run();
    }

    // Crea il test
    const test = db
      .insert(tests)
      .values({
        name,
        siteUrl,
        urls: JSON.stringify(urls),
        startDate: startDate.toISOString(),
        splitDate: splitDate.toISOString(),
        status: 'running',
        userId,
      })
      .returning()
      .get();

    console.log('');
    console.log(colors.success(`  Test creato con successo!`));
    console.log(`  ${colors.muted('ID:')} ${test.id}`);
    console.log('');
    console.log(
      colors.muted(
        '  Nota: per risultati affidabili servono almeno ~50 click/giorno'
      )
    );
    console.log(
      colors.muted(
        '  e un minimo di 7 giorni di dati per periodo (prima/dopo).'
      )
    );
    console.log('');
  } catch (error) {
    console.error(
      colors.error(
        `  Errore: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

/**
 * list — Mostra tabella con tutti i test
 */
export async function listCommand(): Promise<void> {
  try {
    const allTests = db
      .select()
      .from(tests)
      .orderBy(desc(tests.createdAt))
      .all();

    console.log('');

    if (allTests.length === 0) {
      console.log(
        colors.muted(
          '  Nessun test trovato. Usa "seo-tool add" per crearne uno.'
        )
      );
      console.log('');
      return;
    }

    console.log(colors.header(`  ${allTests.length} test trovati`));
    console.log('');
    console.log(formatTestTable(allTests));
    console.log('');
  } catch (error) {
    console.error(
      colors.error(
        `  Errore: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

/**
 * status <id> — Dettaglio di un singolo test con analisi e grafico
 */
export async function statusCommand(id: string): Promise<void> {
  try {
    const test = findTestById(id);
    if (!test) return;

    // Carica metriche ordinate per data
    const testMetrics = db
      .select()
      .from(metrics)
      .where(eq(metrics.testId, test.id))
      .orderBy(metrics.date)
      .all();

    // Dividi metriche before/after
    const splitDateStr = test.splitDate;
    const beforeClicks = testMetrics
      .filter((m) => m.date < splitDateStr)
      .map((m) => m.clicks);
    const afterClicks = testMetrics
      .filter((m) => m.date >= splitDateStr)
      .map((m) => m.clicks);

    // Analisi statistica
    const engine = new StatisticalEngine();
    const analysis = engine.analyze({
      before: beforeClicks,
      after: afterClicks,
    });

    // Attacca dati per il formatter
    const testView = {
      ...test,
      metrics: testMetrics,
      _beforeClicks: beforeClicks,
      _afterClicks: afterClicks,
    };

    // Stampa dettaglio
    console.log(formatStatusDetail(testView, analysis));

    // Grafico ASCII
    if (testMetrics.length > 0) {
      console.log(renderClicksChart(testMetrics, new Date(test.splitDate)));

      // Bonus: proponi export
      const { wantExport } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantExport',
          message: 'Vuoi esportare questi dati ora?',
          default: false,
        },
      ]);

      if (wantExport) {
        await exportCommand(test.id);
      }
    }
  } catch (error) {
    console.error(
      colors.error(
        `  Errore: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

/**
 * run — Sincronizza tutti i test attivi via orchestratore
 */
export async function runCommand(): Promise<void> {
  console.log('');
  console.log(colors.header('  Sincronizzazione Test Attivi'));
  console.log(colors.muted('  ' + '\u2500'.repeat(40)));
  console.log('');
  console.log(colors.info('  Avvio sincronizzazione...'));
  console.log('');

  try {
    // Carica config OAuth e token dal database
    const oauthConfig = getGoogleOAuthConfig();
    const tokenManager = new TokenManager({
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
    });

    // Popola il TokenManager con i token salvati nel DB
    const savedTokens = db.select().from(oauthTokens).all();
    if (savedTokens.length === 0) {
      console.log(colors.error('  Nessun account Google collegato.'));
      console.log(
        colors.muted('  Esegui prima "seo-tool login" per autenticarti.')
      );
      console.log('');
      return;
    }
    for (const t of savedTokens) {
      const remainingSeconds = Math.max(
        0,
        Math.floor((t.expiresAt - Date.now()) / 1000)
      );
      await tokenManager.saveTokens(t.userId, {
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        expires_in: remainingSeconds,
        token_type: 'Bearer',
      });
    }

    const orchestrator = new SEOExperimentOrchestrator({ tokenManager });
    const result = await orchestrator.syncAllActiveTests();

    if (result.totalTests === 0) {
      console.log(colors.muted('  Nessun test attivo da sincronizzare.'));
      console.log('');
      return;
    }

    // Risultati per ogni test
    for (const r of result.results) {
      const icon = r.isSignificant
        ? chalk.green('\u2714')
        : chalk.yellow('\u25CB');
      const pStr = r.pValue !== null ? `p=${r.pValue.toFixed(4)}` : '';
      const changeStr = colorImprovement(r.percentageChange);
      console.log(
        `  ${icon} ${colors.muted(r.testId.substring(0, 8))} ${changeStr} ${colors.muted(pStr)}`
      );

      if (r.notificationSent) {
        console.log(`    ${colors.info('\u2190 Notifica inviata')}`);
      }
    }

    // Errori
    for (const err of result.errors) {
      console.log(
        `  ${chalk.red('\u2717')} ${colors.muted(err.testId.substring(0, 8))} ${colors.error(err.error)}`
      );
    }

    // Riepilogo
    console.log('');
    console.log(colors.muted('  ' + '\u2500'.repeat(40)));
    console.log(
      `  ${colors.success(`${result.successCount} completati`)} \u00B7 ${result.errorCount > 0 ? colors.error(`${result.errorCount} errori`) : colors.muted('0 errori')}`
    );
    console.log('');
  } catch (error) {
    console.error(
      colors.error(
        `  Errore fatale: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

/**
 * export <id> — Esporta dati test su file Excel o CSV (con scelta interattiva)
 */
export async function exportCommand(
  id: string,
  options?: { format?: string }
): Promise<void> {
  try {
    const test = findTestById(id);
    if (!test) return;

    const testMetrics = db
      .select()
      .from(metrics)
      .where(eq(metrics.testId, test.id))
      .orderBy(metrics.date)
      .all();

    if (testMetrics.length === 0) {
      console.log('');
      console.log(
        colors.uncertain('  ⚠ Nessuna metrica disponibile per questo test.')
      );
      console.log(
        colors.muted(
          '  Esegui prima "seo-tool run" per raccogliere dati da GSC.'
        )
      );
      console.log('');
      return;
    }

    // Scelta formato: flag CLI oppure prompt interattivo
    let format = options?.format;
    if (!format) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'format',
          message: 'In quale formato vuoi esportare?',
          choices: [
            {
              name: 'Excel (.xlsx) — Report completo con grafici e formattazione',
              value: 'xlsx',
            },
            {
              name: 'CSV (.csv) — Dati piatti per import in altri tool',
              value: 'csv',
            },
          ],
        },
      ]);
      format = answer.format;
    }

    // Prepara input per ExportService
    const metricRows: MetricRow[] = testMetrics.map((m) => ({
      date: m.date,
      clicks: m.clicks,
      impressions: m.impressions,
      gapFilled: m.gapFilled ?? false,
    }));

    const exportInput: ExportInput = {
      test: {
        id: test.id,
        name: test.name,
        siteUrl: test.siteUrl,
        urls: JSON.parse(test.urls) as string[],
        startDate: test.startDate,
        splitDate: test.splitDate,
        status: test.status,
        lastPValue: test.lastPValue,
        lastImprovement: test.lastImprovement,
      },
      metrics: metricRows,
    };

    const exportService = new ReportExportService();

    const result =
      format === 'xlsx'
        ? await exportService.exportToExcel(exportInput)
        : await exportService.exportToCSV(exportInput);

    // Scrivi il file nella cartella corrente
    const filePath = path.resolve(result.fileName);
    await writeFile(filePath, result.buffer);

    console.log('');
    console.log(colors.success('  Export completato!'));
    console.log(`  ${colors.muted('File:')}     ${filePath}`);
    console.log(
      `  ${colors.muted('Formato:')}  ${result.format.toUpperCase()}`
    );
    console.log(`  ${colors.muted('Metriche:')} ${result.rowCount} giorni`);
    console.log('');
  } catch (error) {
    console.error(
      colors.error(
        `  Errore: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

const GOOGLE_CLOUD_CONSOLE_URL =
  'https://console.cloud.google.com/apis/credentials';
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/auth/callback';

/**
 * Aggiorna le righe di un file .env sostituendo le variabili già presenti
 * e aggiungendo in coda quelle mancanti. Le variabili non-Google vengono preservate.
 */
function updateEnvVars(
  existingContent: string,
  vars: Record<string, string>
): string {
  const lines = existingContent ? existingContent.split('\n') : [];
  const remaining = { ...vars };

  const updated = lines.map((line) => {
    const match = /^([A-Z_]+)=/.exec(line);
    if (match && match[1] in remaining) {
      const key = match[1];
      const value = remaining[key];
      delete remaining[key];
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(remaining)) {
    updated.push(`${key}=${value}`);
  }

  return updated.join('\n');
}

/**
 * setup — Wizard interattivo per configurare le credenziali Google OAuth2
 */
export async function setupCommand(): Promise<void> {
  // BLOCCO A — Header
  console.log('');
  console.log(colors.header('  Configurazione Credenziali Google OAuth2'));
  console.log(colors.muted('  ' + '\u2500'.repeat(40)));
  console.log('');

  // BLOCCO B — Rilevamento credenziali esistenti
  const hasClientId = !!process.env['GOOGLE_CLIENT_ID'];
  const hasClientSecret = !!process.env['GOOGLE_CLIENT_SECRET'];

  if (hasClientId && hasClientSecret) {
    console.log(colors.success('  \u2713 Credenziali già configurate:'));
    console.log(
      colors.muted(
        `    GOOGLE_CLIENT_ID:     ${process.env['GOOGLE_CLIENT_ID']!.substring(0, 8)}...`
      )
    );
    console.log(colors.muted('    GOOGLE_CLIENT_SECRET: ***'));
    console.log('');

    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Vuoi sovrascriverle con nuove credenziali?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(
        colors.muted(
          '  Operazione annullata. Esegui "seo-tool login" per procedere.'
        )
      );
      console.log('');
      return;
    }
  }

  // Leggi il .env esistente prima della parte interattiva
  const envPath = path.join(process.cwd(), '.env');
  let existingContent = '';
  try {
    existingContent = await readFile(envPath, 'utf-8');
  } catch {
    // File .env non esiste — partiamo da zero
  }

  // BLOCCO C — Apertura browser + guida numerata
  console.log(colors.muted(`  ${GOOGLE_CLOUD_CONSOLE_URL}`));
  try {
    console.log(colors.info('  Apro Google Cloud Console nel browser...'));
    await open(GOOGLE_CLOUD_CONSOLE_URL);
  } catch {
    console.log(colors.muted('  (impossibile aprire il browser — visita il link sopra)'));
  }

  console.log('');
  console.log(colors.info('  Segui questi passaggi in Google Cloud Console:'));
  console.log('');
  console.log(colors.muted('  1. Seleziona o crea un progetto Google Cloud'));
  console.log(colors.muted('  2. Vai su "API e servizi" \u2192 "Credenziali"'));
  console.log(colors.muted('  3. Clicca "Crea credenziali" \u2192 "ID client OAuth 2.0"'));
  console.log(colors.muted('  4. Tipo applicazione: "App desktop" \u2192 assegna un nome \u2192 Crea'));
  console.log(
    colors.muted('  5. Scarica il file JSON oppure copia Client ID e Client Secret')
  );
  console.log('');

  await inquirer.prompt([
    { type: 'input', name: '_', message: 'Premi INVIO quando sei pronto...' },
  ]);

  // BLOCCO D — Selezione modalità
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Come vuoi inserire le credenziali?',
      choices: [
        {
          name: 'Carica file JSON scaricato da Google (client_secret_*.json)',
          value: 'json',
        },
        {
          name: 'Inserisci manualmente Client ID e Client Secret',
          value: 'manual',
        },
      ],
    },
  ]);

  // BLOCCO E/F — Raccolta credenziali (JSON o manuale)
  let clientId: string;
  let clientSecret: string;
  let customRedirectUri: string = DEFAULT_REDIRECT_URI;

  if (mode === 'json') {
    // BLOCCO E — Carica file JSON
    const { jsonPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'jsonPath',
        message: 'Percorso del file JSON scaricato:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Il percorso è obbligatorio.',
      },
    ]);

    let rawContent: string;
    try {
      rawContent = await readFile((jsonPath as string).trim(), 'utf-8');
    } catch {
      console.log(
        colors.error('  File non trovato. Controlla il percorso e riprova.')
      );
      console.log('');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.log(
        colors.error(
          '  File non valido. Assicurati di aver scaricato il file JSON da Google Cloud Console.'
        )
      );
      console.log('');
      return;
    }

    const asObj = parsed as Record<string, unknown>;
    const rawCreds = asObj['installed'] ?? asObj['web'];

    if (!rawCreds || typeof rawCreds !== 'object') {
      console.log(
        colors.error(
          '  Formato file non riconosciuto. Usa il file client_secret_*.json scaricato da Google Cloud Console.'
        )
      );
      console.log('');
      return;
    }

    const creds = rawCreds as Record<string, unknown>;
    clientId = String(creds['client_id'] ?? '').trim();
    clientSecret = String(creds['client_secret'] ?? '').trim();

    if (!clientId || !clientSecret) {
      console.log(
        colors.error(
          '  File JSON non contiene client_id o client_secret validi.'
        )
      );
      console.log('');
      return;
    }
    // customRedirectUri rimane DEFAULT_REDIRECT_URI (override del valore nel JSON)
  } else {
    // BLOCCO F — Inserimento manuale
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'GOOGLE_CLIENT_ID:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Il Client ID è obbligatorio.',
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'GOOGLE_CLIENT_SECRET:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Il Client Secret è obbligatorio.',
      },
      {
        type: 'input',
        name: 'redirectUri',
        message: 'GOOGLE_REDIRECT_URI:',
        default: DEFAULT_REDIRECT_URI,
      },
    ]);
    clientId = (answers.clientId as string).trim();
    clientSecret = (answers.clientSecret as string).trim();
    customRedirectUri =
      (answers.redirectUri as string).trim() || DEFAULT_REDIRECT_URI;
  }

  // BLOCCO G — Scrittura .env
  const newContent = updateEnvVars(existingContent, {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REDIRECT_URI: customRedirectUri,
  });

  await writeFile(envPath, newContent, 'utf-8');

  // BLOCCO H — Messaggio finale
  console.log('');
  console.log(
    colors.success('  \u2713 File .env aggiornato con le credenziali Google.')
  );
  console.log('');
  console.log(colors.info('  Prossimo step:'));
  console.log(`  ${colors.muted('$')} seo-tool login`);
  console.log('');
}

/**
 * demo — Popola il database con 2 esperimenti di esempio (senza account Google)
 */
export async function demoCommand(): Promise<void> {
  const { demo } = await import('../demo.js');
  demo();
}

/**
 * delete <id> — Elimina un test (con conferma interattiva) e registra nell'Audit Log
 */
export async function deleteCommand(id: string): Promise<void> {
  try {
    const test = findTestById(id);
    if (!test) return;

    // Conta metriche collegate
    const metricsResult = db
      .select({ total: count() })
      .from(metrics)
      .where(eq(metrics.testId, test.id))
      .get();
    const metricsCount = metricsResult?.total ?? 0;

    // Mostra info e chiedi conferma
    console.log('');
    console.log(colors.header('  Eliminazione Test'));
    console.log(colors.muted('  ' + '\u2500'.repeat(40)));
    console.log(`  ${colors.muted('Nome:')}     ${test.name}`);
    console.log(`  ${colors.muted('ID:')}       ${test.id}`);
    console.log(`  ${colors.muted('Stato:')}    ${colorStatus(test.status)}`);
    console.log(`  ${colors.muted('Metriche:')} ${metricsCount} record`);
    console.log('');

    const answer = await prompt(
      chalk.red(
        "Confermi l'eliminazione? Questa operazione è irreversibile. (s/N):"
      )
    );

    if (
      answer.toLowerCase() !== 's' &&
      answer.toLowerCase() !== 'si' &&
      answer.toLowerCase() !== 'sì'
    ) {
      console.log(colors.muted('  Operazione annullata.'));
      return;
    }

    // Elimina il test (le metriche vengono eliminate via ON DELETE CASCADE)
    db.delete(tests).where(eq(tests.id, test.id)).run();

    // Registra nell'Audit Log
    db.insert(auditLogs)
      .values({
        testId: test.id,
        action: 'test_deleted',
        userId: test.userId,
      })
      .run();

    console.log('');
    console.log(
      colors.success(`  Test "${test.name}" eliminato con successo.`)
    );
    if (metricsCount > 0) {
      console.log(
        colors.muted(`  ${metricsCount} metriche rimosse (cascade).`)
      );
    }
    console.log('');
  } catch (error) {
    console.error(
      colors.error(
        `  Errore: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}
