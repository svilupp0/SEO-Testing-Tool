/**
 * Smoke Test — Verifica connessione DB SQLite (Drizzle + better-sqlite3)
 *
 * Crea le tabelle, inserisce un test di prova, lo recupera, e lo elimina subito.
 * Conferma che la connessione al database è attiva e funzionante.
 *
 * Uso: npx tsx src/smoke-test.ts
 */

import { config } from 'dotenv';
config();

import { eq } from 'drizzle-orm';
import { db, migrateDB, closeDb } from './database/db.js';
import { users, tests } from './database/schema.js';

const SMOKE_TEST_NAME = 'SMOKE_TEST';

async function smokeTest(): Promise<void> {
  console.log('--- Smoke Test DB ---');
  console.log(`Database: ${process.env['DATABASE_URL'] ?? '(default: ~/.seo-tool/data.db)'}`);
  console.log('');

  try {
    // 0. Crea tabelle se non esistono
    migrateDB();
    console.log('[OK] Schema migrato');

    // 1. Assicura che esista un utente per il test
    const userId = 'smoke-test-user';
    const existingUser = db.select().from(users).where(eq(users.id, userId)).get();
    if (!existingUser) {
      db.insert(users).values({ id: userId, email: 'smoke@test.local' }).run();
      console.log('[OK] Utente di test creato');
    } else {
      console.log('[OK] Utente di test già presente');
    }

    // 2. Crea test di prova
    const test = db.insert(tests).values({
      name: SMOKE_TEST_NAME,
      siteUrl: 'sc-domain:smoke-test.local',
      urls: JSON.stringify(['https://smoke-test.local/']),
      startDate: new Date().toISOString(),
      splitDate: new Date().toISOString(),
      status: 'running',
      userId,
    }).returning().get();
    console.log(`[OK] Test creato: ${test.id}`);

    // 3. Recupera dal DB
    const fetched = db.select().from(tests).where(eq(tests.id, test.id)).get();
    if (!fetched || fetched.name !== SMOKE_TEST_NAME) {
      throw new Error('Test recuperato non corrisponde');
    }
    console.log(`[OK] Test recuperato: "${fetched.name}"`);

    // 4. Elimina il test
    db.delete(tests).where(eq(tests.id, test.id)).run();
    console.log('[OK] Test eliminato');

    // 5. Verifica eliminazione
    const deleted = db.select().from(tests).where(eq(tests.id, test.id)).get();
    if (deleted) {
      throw new Error('Test ancora presente dopo eliminazione');
    }
    console.log('[OK] Eliminazione confermata');

    console.log('');
    console.log('=== SMOKE TEST SUPERATO ===');
    closeDb();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('[ERRORE] Smoke test fallito:');
    console.error(error instanceof Error ? error.message : error);
    closeDb();
    process.exit(1);
  }
}

smokeTest();
