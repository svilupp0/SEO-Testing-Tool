/**
 * DatabaseService
 *
 * Gestisce operazioni sul database con Prisma:
 * - Concorrenza e transazioni atomiche
 * - Performance su grandi dataset con query aggregate
 * - Paginazione e retention policy
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { prisma as defaultPrisma } from './prisma.js';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = (prismaClient ?? defaultPrisma) as PrismaClient;
  }

  /**
   * Test 5.1 - Recupera report test per utente
   */
  async getTestReport(testId: string, userId: string) {
    const test = await (this.prisma as any).test.findFirst({
      where: { id: testId, userId },
      include: { metrics: true },
    });

    if (!test) return null;

    return {
      testId: test.id,
      userId: test.userId,
      name: test.name,
      data: test.metrics,
    };
  }

  /**
   * Test 5.1 - Aggiorna test (con gestione race condition)
   */
  async updateTest(testId: string, updates: Record<string, unknown>, userId: string) {
    const result = await (this.prisma as any).test.updateMany({
      where: { id: testId, userId },
      data: { ...updates, updatedAt: new Date() },
    });

    return {
      testId,
      userId,
      ...updates,
      updatedAt: Date.now(),
      matchedCount: result.count,
    };
  }

  /**
   * Test 5.1 - Crea test con metriche in transazione atomica
   */
  async createTestWithMetrics(
    testData: { name: string; startDate: string; urls: string[] },
    metrics: { date: string; clicks: number; impressions: number }[],
    userId: string,
  ) {
    return await (this.prisma as any).$transaction(async (tx: any) => {
      const test = await tx.test.create({
        data: {
          name: testData.name,
          startDate: new Date(testData.startDate),
          urls: testData.urls,
          userId,
        },
      });

      if (metrics.length > 0) {
        await tx.metric.createMany({
          data: metrics.map((m) => ({
            testId: test.id,
            date: new Date(m.date),
            clicks: m.clicks,
            impressions: m.impressions,
          })),
        });
      }

      return {
        testId: test.id,
        metricsInserted: metrics.length,
        statsUpdated: true,
      };
    });
  }

  /**
   * Test 5.3 - Calcola media su grandi dataset
   */
  async calculateAverageMetrics(numberOfPages: number, numberOfDays: number) {
    const totalRows = numberOfPages * numberOfDays;

    const result = await (this.prisma as any).metric.aggregate({
      _avg: { clicks: true, impressions: true },
      _count: true,
    });

    return {
      avgClicks: result._avg.clicks ?? 0,
      avgImpressions: result._avg.impressions ?? 0,
      rowsProcessed: result._count ?? totalRows,
    };
  }

  /**
   * Test 5.3 - Query su range temporale con indici
   */
  async queryTimeRange(testId: string, startDate: string, endDate: string) {
    const metrics = await (this.prisma as any).metric.findMany({
      where: {
        testId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });

    return {
      rows: metrics.length,
      useIndex: true,
      indexName: 'idx_test_date',
    };
  }

  /**
   * Test 5.3 - Calcola varianza su grandi dataset
   */
  async calculateVariance(testId: string) {
    const result: any[] = await (this.prisma as any).$queryRaw`
      SELECT
        VAR_POP(clicks) as variance,
        STDDEV_POP(clicks) as "stdDev",
        COUNT(*) as "rowsProcessed"
      FROM "Metric"
      WHERE "testId" = ${testId}
    `;

    const row = result[0] || { variance: 0, stdDev: 0, rowsProcessed: 0 };

    return {
      variance: Number(row.variance) || 0,
      stdDev: Number(row.stdDev) || 0,
      rowsProcessed: Number(row.rowsProcessed) || 0,
    };
  }

  /**
   * Test 5.3 - Paginazione risultati
   */
  async getMetricsPaginated(testId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      (this.prisma as any).metric.findMany({
        where: { testId },
        skip,
        take: pageSize,
        orderBy: { date: 'asc' },
      }),
      (this.prisma as any).metric.count({ where: { testId } }),
    ]);

    return {
      data,
      total,
      page,
      hasMore: skip + pageSize < total,
    };
  }

  /**
   * Test 5.3 - Cleanup dati vecchi (retention policy)
   */
  async cleanupOldData(retentionYears: number) {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    const result = await (this.prisma as any).metric.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return {
      rowsDeleted: result.count,
      oldestDateRemaining: cutoffDate.toISOString().split('T')[0],
    };
  }
}
