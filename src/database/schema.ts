import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── Users ───────────────────────────────────────────────────────────────────
export const users = sqliteTable('User', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Tests ───────────────────────────────────────────────────────────────────
export const tests = sqliteTable(
  'Test',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    urls: text('urls').notNull().default('[]'),
    siteUrl: text('siteUrl').notNull(),
    startDate: text('startDate').notNull(),
    splitDate: text('splitDate').notNull(),
    status: text('status').notNull().default('running'),
    lastSyncAt: text('lastSyncAt'),
    lastPValue: real('lastPValue'),
    lastImprovement: real('lastImprovement'),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updatedAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('Test_userId_idx').on(table.userId),
    index('Test_status_idx').on(table.status),
  ]
);

// ── Metrics ─────────────────────────────────────────────────────────────────
export const metrics = sqliteTable(
  'Metric',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    testId: text('testId')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    gapFilled: integer('gapFilled', { mode: 'boolean' })
      .notNull()
      .default(false),
    filledAt: text('filledAt'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('Metric_testId_date_key').on(table.testId, table.date),
    index('Metric_testId_date_idx').on(table.testId, table.date),
  ]
);

// ── OAuth Tokens ─────────────────────────────────────────────────────────────
export const oauthTokens = sqliteTable('OAuthToken', {
  userId: text('userId')
    .primaryKey()
    .references(() => users.id),
  accessToken: text('accessToken').notNull(),
  refreshToken: text('refreshToken').notNull(),
  expiresAt: integer('expiresAt').notNull(), // Unix timestamp in ms
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updatedAt')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Audit Log ───────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable(
  'AuditLog',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    testId: text('testId').notNull(),
    action: text('action').notNull(),
    userId: text('userId').notNull(),
    timestamp: text('timestamp')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('AuditLog_testId_idx').on(table.testId),
    index('AuditLog_userId_idx').on(table.userId),
  ]
);
