/**
 * TimeSeriesService
 *
 * Gestisce integrità e recupero dati serie temporali con Drizzle ORM:
 * - Rilevamento gap temporali
 * - Recupero automatico dati mancanti
 * - Flag per tracciare recuperi
 * - Retention policy per dati vecchi
 */

import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db as defaultDb, type DrizzleDB } from './db.js';
import { metrics } from './schema.js';

export class TimeSeriesService {
  private db: DrizzleDB;

  constructor(drizzleDb?: DrizzleDB) {
    this.db = drizzleDb ?? defaultDb;
  }

  /**
   * Test 5.2 - Salva dati serie temporale
   */
  async saveData(
    testId: string,
    timeSeriesData: { date: string; clicks: number; impressions?: number }[]
  ): Promise<void> {
    if (timeSeriesData.length === 0) return;

    this.db
      .insert(metrics)
      .values(
        timeSeriesData.map((d) => ({
          testId,
          date: new Date(d.date).toISOString(),
          clicks: d.clicks,
          impressions: d.impressions ?? 0,
        }))
      )
      .onConflictDoNothing({ target: [metrics.testId, metrics.date] })
      .run();
  }

  /**
   * Test 5.2 - Rileva gap nella serie temporale
   */
  async detectGaps(
    testId: string,
    startDate: string,
    endDate: string
  ): Promise<{ date: string; reason: string }[]> {
    const existingMetrics = this.db
      .select({ date: metrics.date })
      .from(metrics)
      .where(
        and(
          eq(metrics.testId, testId),
          gte(metrics.date, new Date(startDate).toISOString()),
          lte(metrics.date, new Date(endDate).toISOString())
        )
      )
      .orderBy(metrics.date)
      .all();

    const existingDates = new Set(
      existingMetrics.map((m) => m.date.split('T')[0])
    );

    const gaps: { date: string; reason: string }[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      if (!existingDates.has(dateStr)) {
        gaps.push({ date: dateStr, reason: 'fetch_failed' });
      }
      current.setDate(current.getDate() + 1);
    }

    return gaps;
  }

  /**
   * Test 5.2 - Calcola date da fetchare (inclusi gap)
   */
  async getFetchDates(testId: string, today: string): Promise<string[]> {
    const lastMetric = this.db
      .select({ date: metrics.date })
      .from(metrics)
      .where(eq(metrics.testId, testId))
      .orderBy(desc(metrics.date))
      .limit(1)
      .get();

    if (!lastMetric) return [today];

    const lastDate = lastMetric.date.split('T')[0];

    const gaps = await this.detectGaps(testId, lastDate, today);
    const gapDates = gaps.map((g) => g.date);

    if (!gapDates.includes(today)) {
      gapDates.push(today);
    }

    return gapDates;
  }

  /**
   * Test 5.2 - Salva dati recuperati con flag gap_filled (upsert)
   */
  async saveGapData(
    testId: string,
    recoveredData: { date: string; clicks: number; impressions: number }
  ) {
    const dateIso = new Date(recoveredData.date).toISOString();
    const now = new Date().toISOString();

    this.db
      .insert(metrics)
      .values({
        testId,
        date: dateIso,
        clicks: recoveredData.clicks,
        impressions: recoveredData.impressions,
        gapFilled: true,
        filledAt: now,
      })
      .onConflictDoUpdate({
        target: [metrics.testId, metrics.date],
        set: {
          clicks: recoveredData.clicks,
          impressions: recoveredData.impressions,
          gapFilled: true,
          filledAt: now,
        },
      })
      .run();

    return {
      ...recoveredData,
      gap_filled: true,
      filled_at: Date.now(),
    };
  }

  /**
   * Test 5.2 - Verifica se gap è recuperabile (max 30 giorni)
   * Logica pura, non richiede query al database.
   */
  async shouldRecoverGap(
    gapDate: string | Date,
    today: Date
  ): Promise<boolean> {
    const gapTime =
      typeof gapDate === 'string'
        ? new Date(gapDate).getTime()
        : gapDate.getTime();
    const todayTime = today.getTime();
    const daysDiff = (todayTime - gapTime) / (1000 * 60 * 60 * 24);

    return daysDiff <= 30;
  }
}
