/**
 * Demo — Popola il database con dati finti per provare il tool
 *
 * Crea due esperimenti di esempio:
 *   1. "Esperimento Positivo" — incremento reale di click (+50%) nel periodo post
 *   2. "Esperimento Neutro"   — nessuna differenza significativa tra pre e post
 *
 * Ogni esperimento ha 35 giorni di metriche pre-split e 35 giorni post-split.
 *
 * Uso: npx tsx src/demo.ts   oppure   npm run demo
 */

import { fileURLToPath } from 'url';
import { config } from 'dotenv';
config();

import { eq } from 'drizzle-orm';
import { db, migrateDB, closeDb } from './database/db.js';
import { users, tests, metrics } from './database/schema.js';

// ── Generatore pseudo-random deterministico (seeded LCG) ─────────────────
class SeededRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  /** Restituisce un float in [0, 1) */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }
  /** Distribuzione normale approssimata (Box-Muller) */
  normal(mean: number, stdDev: number): number {
    const u1 = this.next() || 0.0001;
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Genera una data ISO (YYYY-MM-DD) a partire da un offset in giorni da oggi */
function dateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** Genera N giorni di metriche (clicks/impressions) con rumore realistico */
function generateMetrics(
  rng: SeededRng,
  testId: string,
  startOffset: number,
  days: number,
  clickMean: number,
  clickStdDev: number,
  impressionMultiplier: number
): { testId: string; date: string; clicks: number; impressions: number }[] {
  const rows: {
    testId: string;
    date: string;
    clicks: number;
    impressions: number;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const clicks = Math.max(0, Math.round(rng.normal(clickMean, clickStdDev)));
    const impressions = Math.max(
      clicks,
      Math.round(
        rng.normal(
          clicks * impressionMultiplier,
          clicks * impressionMultiplier * 0.15
        )
      )
    );
    rows.push({
      testId,
      date: dateOffset(startOffset + i),
      clicks,
      impressions,
    });
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function demo(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   SEO Testing Tool — Modalità Demo       ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    migrateDB();
    console.log('[OK] Database pronto');

    // ── Utente demo ──────────────────────────────────────────────────────
    const DEMO_USER_ID = 'demo-user';
    const existing = db
      .select()
      .from(users)
      .where(eq(users.id, DEMO_USER_ID))
      .get();
    if (!existing) {
      db.insert(users)
        .values({ id: DEMO_USER_ID, email: 'demo@seo-tool.local' })
        .run();
    }
    console.log('[OK] Utente demo pronto');

    // ── Configurazione esperimenti ───────────────────────────────────────
    const DAYS_PRE = 35;
    const DAYS_POST = 35;
    const START_OFFSET = -(DAYS_PRE + DAYS_POST); // inizio = 70 giorni fa
    const SPLIT_OFFSET = START_OFFSET + DAYS_PRE; // split = 35 giorni fa

    const startDate = dateOffset(START_OFFSET);
    const splitDate = dateOffset(SPLIT_OFFSET);

    // ── 1. Esperimento Positivo ──────────────────────────────────────────
    const rngPositive = new SeededRng(42);

    const testPositive = db
      .insert(tests)
      .values({
        name: 'Esperimento Positivo',
        siteUrl: 'sc-domain:esempio-positivo.it',
        urls: JSON.stringify(['https://esempio-positivo.it/landing-page']),
        startDate,
        splitDate,
        status: 'completed',
        lastPValue: 0.001,
        lastImprovement: 46.6,
        userId: DEMO_USER_ID,
      })
      .returning()
      .get();

    // Pre-split: ~50 click/giorno, post-split: ~75 click/giorno (+50%)
    const prePositive = generateMetrics(
      rngPositive,
      testPositive.id,
      START_OFFSET,
      DAYS_PRE,
      1500,
      100,
      10
    );
    const postPositive = generateMetrics(
      rngPositive,
      testPositive.id,
      SPLIT_OFFSET,
      DAYS_POST,
      2200,
      150,
      10
    );

    for (const row of [...prePositive, ...postPositive]) {
      db.insert(metrics).values(row).run();
    }

    console.log(
      `[OK] Esperimento Positivo creato — ID: ${testPositive.id.slice(0, 8)}...`
    );
    console.log(`     Pre:  ${DAYS_PRE} giorni (~1500 click/giorno)`);
    console.log(`     Post: ${DAYS_POST} giorni (~2200 click/giorno, +46%)`);

    // ── 2. Esperimento Neutro ────────────────────────────────────────────
    const rngNeutral = new SeededRng(123);

    const testNeutral = db
      .insert(tests)
      .values({
        name: 'Esperimento Neutro',
        siteUrl: 'sc-domain:esempio-neutro.it',
        urls: JSON.stringify(['https://esempio-neutro.it/pagina-test']),
        startDate,
        splitDate,
        status: 'completed',
        lastPValue: 0.72,
        lastImprovement: 1.2,
        userId: DEMO_USER_ID,
      })
      .returning()
      .get();

    // Pre-split: ~50 click/giorno, post-split: ~51 click/giorno (nessun cambiamento reale)
    const preNeutral = generateMetrics(
      rngNeutral,
      testNeutral.id,
      START_OFFSET,
      DAYS_PRE,
      50,
      8,
      10
    );
    const postNeutral = generateMetrics(
      rngNeutral,
      testNeutral.id,
      SPLIT_OFFSET,
      DAYS_POST,
      51,
      8,
      10
    );

    for (const row of [...preNeutral, ...postNeutral]) {
      db.insert(metrics).values(row).run();
    }

    console.log(
      `[OK] Esperimento Neutro creato  — ID: ${testNeutral.id.slice(0, 8)}...`
    );
    console.log(`     Pre:  ${DAYS_PRE} giorni (~50 click/giorno)`);
    console.log(
      `     Post: ${DAYS_POST} giorni (~51 click/giorno, nessun effetto)`
    );

    // ── Riepilogo ────────────────────────────────────────────────────────
    console.log('');
    console.log('════════════════════════════════════════════');
    console.log('  Demo completata! Prova questi comandi:');
    console.log('');
    console.log(`  seo-tool list`);
    console.log(`  seo-tool status ${testPositive.id.slice(0, 8)}`);
    console.log(`  seo-tool status ${testNeutral.id.slice(0, 8)}`);
    console.log(`  seo-tool export ${testPositive.id.slice(0, 8)}`);
    console.log('════════════════════════════════════════════');
    console.log('');

    closeDb();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('[ERRORE] Demo fallita:');
    console.error(error instanceof Error ? error.message : error);
    closeDb();
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  demo();
}
