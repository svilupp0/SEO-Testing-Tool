/**
 * TimeSeriesService
 *
 * Gestisce integrità e recupero dati serie temporali con Prisma:
 * - Rilevamento gap temporali
 * - Recupero automatico dati mancanti
 * - Flag per tracciare recuperi
 * - Retention policy per dati vecchi
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { prisma as defaultPrisma } from './prisma.js';

export class TimeSeriesService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = (prismaClient ?? defaultPrisma) as PrismaClient;
  }

  /**
   * Test 5.2 - Salva dati serie temporale
   */
  async saveData(testId: string, timeSeriesData: { date: string; clicks: number; impressions?: number }[]): Promise<void> {
    if (timeSeriesData.length === 0) return;

    await (this.prisma as any).metric.createMany({
      data: timeSeriesData.map((d) => ({
        testId,
        date: new Date(d.date),
        clicks: d.clicks,
        impressions: d.impressions ?? 0,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Test 5.2 - Rileva gap nella serie temporale
   */
  async detectGaps(testId: string, startDate: string, endDate: string): Promise<{ date: string; reason: string }[]> {
    // Recupera tutte le date presenti nel range
    const existingMetrics = await (this.prisma as any).metric.findMany({
      where: {
        testId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    const existingDates = new Set(
      existingMetrics.map((m: { date: Date }) => m.date.toISOString().split('T')[0]),
    );

    // Genera tutte le date attese nel range
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
    // Trova l'ultima data con dati
    const lastMetric = await (this.prisma as any).metric.findFirst({
      where: { testId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    if (!lastMetric) return [today];

    const lastDate = lastMetric.date.toISOString().split('T')[0];

    // Trova gap dal giorno dopo l'ultimo dato fino a oggi
    const dayAfterLast = new Date(lastDate);
    dayAfterLast.setDate(dayAfterLast.getDate() + 1);

    const gaps = await this.detectGaps(testId, lastDate, today);
    const gapDates = gaps.map((g) => g.date);

    // Aggiungi oggi se non è già nei gap
    if (!gapDates.includes(today)) {
      gapDates.push(today);
    }

    return gapDates;
  }

  /**
   * Test 5.2 - Salva dati recuperati con flag gap_filled
   */
  async saveGapData(
    testId: string,
    recoveredData: { date: string; clicks: number; impressions: number },
  ) {
    const saved = await (this.prisma as any).metric.upsert({
      where: {
        testId_date: {
          testId,
          date: new Date(recoveredData.date),
        },
      },
      update: {
        clicks: recoveredData.clicks,
        impressions: recoveredData.impressions,
        gapFilled: true,
        filledAt: new Date(),
      },
      create: {
        testId,
        date: new Date(recoveredData.date),
        clicks: recoveredData.clicks,
        impressions: recoveredData.impressions,
        gapFilled: true,
        filledAt: new Date(),
      },
    });

    return {
      ...recoveredData,
      gap_filled: saved.gapFilled,
      filled_at: saved.filledAt?.getTime() ?? Date.now(),
    };
  }

  /**
   * Test 5.2 - Verifica se gap è recuperabile (max 30 giorni)
   * Logica pura, non richiede query al database.
   */
  async shouldRecoverGap(gapDate: string | Date, today: Date): Promise<boolean> {
    const gapTime = typeof gapDate === 'string' ? new Date(gapDate).getTime() : gapDate.getTime();
    const todayTime = today.getTime();
    const daysDiff = (todayTime - gapTime) / (1000 * 60 * 60 * 24);

    // Gap più vecchi di 30 giorni NON vengono recuperati
    return daysDiff <= 30;
  }
}
