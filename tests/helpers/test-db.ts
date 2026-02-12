/**
 * Test Helper: Database in-memory per test
 *
 * Crea un'istanza Drizzle con SQLite in memoria.
 * Ogni chiamata restituisce un DB fresco e isolato.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/database/schema.js';

export type TestDB = BetterSQLite3Database<typeof schema>;

export function createTestDb(): TestDB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE "User" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text NOT NULL UNIQUE,
      "createdAt" text NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "Test" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "urls" text NOT NULL DEFAULT '[]',
      "siteUrl" text NOT NULL,
      "startDate" text NOT NULL,
      "splitDate" text NOT NULL,
      "status" text NOT NULL DEFAULT 'running',
      "lastSyncAt" text,
      "lastPValue" real,
      "lastImprovement" real,
      "userId" text NOT NULL REFERENCES "User"("id"),
      "sharedWith" text NOT NULL DEFAULT '[]',
      "createdAt" text NOT NULL DEFAULT (datetime('now')),
      "updatedAt" text NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX "Test_userId_idx" ON "Test"("userId");
    CREATE INDEX "Test_status_idx" ON "Test"("status");

    CREATE TABLE "Metric" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "testId" text NOT NULL REFERENCES "Test"("id") ON DELETE CASCADE,
      "date" text NOT NULL,
      "clicks" integer NOT NULL,
      "impressions" integer NOT NULL,
      "gapFilled" integer NOT NULL DEFAULT 0,
      "filledAt" text,
      "createdAt" text NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX "Metric_testId_date_key" ON "Metric"("testId", "date");
    CREATE INDEX "Metric_testId_date_idx" ON "Metric"("testId", "date");

    CREATE TABLE "OAuthToken" (
      "userId" text PRIMARY KEY NOT NULL REFERENCES "User"("id"),
      "accessToken" text NOT NULL,
      "refreshToken" text NOT NULL,
      "expiresAt" integer NOT NULL,
      "createdAt" text NOT NULL DEFAULT (datetime('now')),
      "updatedAt" text NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "AuditLog" (
      "id" text PRIMARY KEY NOT NULL,
      "testId" text NOT NULL,
      "action" text NOT NULL,
      "userId" text NOT NULL,
      "timestamp" text NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX "AuditLog_testId_idx" ON "AuditLog"("testId");
    CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
  `);

  return drizzle(sqlite, { schema });
}

/**
 * Inserisce un utente di test nel DB.
 */
export function seedUser(db: TestDB, id = 'user-1', email = 'test@example.com') {
  db.insert(schema.users).values({ id, email }).run();
}

/**
 * Inserisce un test SEO nel DB. Richiede un utente esistente.
 */
export function seedTest(db: TestDB, overrides: Partial<typeof schema.tests.$inferInsert> = {}) {
  const defaults = {
    id: 'test-123',
    name: 'Test SEO Homepage',
    siteUrl: 'sc-domain:example.com',
    urls: JSON.stringify(['https://example.com/page1']),
    startDate: new Date('2024-01-01').toISOString(),
    splitDate: new Date('2024-01-15').toISOString(),
    status: 'running' as const,
    userId: 'user-1',
  };
  const values = { ...defaults, ...overrides };
  db.insert(schema.tests).values(values).run();
  return values;
}

/**
 * Inserisce metriche per un range di date.
 */
export function seedMetrics(
  db: TestDB,
  testId: string,
  startDate: string,
  days: number,
  baseClicks: number,
) {
  const rows = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      testId,
      date: date.toISOString(),
      clicks: baseClicks + Math.floor(Math.random() * 10),
      impressions: baseClicks * 10,
    };
  });
  if (rows.length > 0) {
    db.insert(schema.metrics).values(rows).run();
  }
  return rows;
}
