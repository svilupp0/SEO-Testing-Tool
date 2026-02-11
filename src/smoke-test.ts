/**
 * Smoke Test — Verifica connessione DB Railway
 *
 * Crea un test di prova, lo recupera, e lo elimina subito.
 * Conferma che la connessione al database è attiva e funzionante.
 *
 * Uso: npx tsx src/smoke-test.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from './database/prisma.js';

const SMOKE_TEST_NAME = 'SMOKE_TEST';

async function smokeTest(): Promise<void> {
  console.log('--- Smoke Test DB ---');
  console.log(`Connessione a: ${process.env['DATABASE_URL']?.replace(/:[^@]+@/, ':***@') ?? '(non configurato)'}`);
  console.log('');

  try {
    // 1. Assicura che esista un utente per il test
    const userId = 'smoke-test-user';
    let user = await (prisma as any).user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await (prisma as any).user.create({
        data: { id: userId, email: 'smoke@test.local' },
      });
      console.log('[OK] Utente di test creato');
    } else {
      console.log('[OK] Utente di test già presente');
    }

    // 2. Crea test di prova
    const test = await (prisma as any).test.create({
      data: {
        name: SMOKE_TEST_NAME,
        siteUrl: 'sc-domain:smoke-test.local',
        urls: ['https://smoke-test.local/'],
        startDate: new Date(),
        splitDate: new Date(),
        status: 'running',
        userId,
      },
    });
    console.log(`[OK] Test creato: ${test.id}`);

    // 3. Recupera dal DB
    const fetched = await (prisma as any).test.findUnique({ where: { id: test.id } });
    if (!fetched || fetched.name !== SMOKE_TEST_NAME) {
      throw new Error('Test recuperato non corrisponde');
    }
    console.log(`[OK] Test recuperato: "${fetched.name}"`);

    // 4. Elimina il test
    await (prisma as any).test.delete({ where: { id: test.id } });
    console.log('[OK] Test eliminato');

    // 5. Verifica eliminazione
    const deleted = await (prisma as any).test.findUnique({ where: { id: test.id } });
    if (deleted) {
      throw new Error('Test ancora presente dopo eliminazione');
    }
    console.log('[OK] Eliminazione confermata');

    console.log('');
    console.log('=== SMOKE TEST SUPERATO ===');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('[ERRORE] Smoke test fallito:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

smokeTest();
