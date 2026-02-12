/**
 * Database Connection (Drizzle + better-sqlite3)
 *
 * Lazy singleton: la connessione viene creata al primo accesso.
 * Crea automaticamente la directory ~/.seo-tool/ se non esiste.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

export type DrizzleDB = BetterSQLite3Database<typeof schema>;

function getDbPath(): string {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) {
    return envUrl.startsWith('file:') ? envUrl.replace('file:', '') : envUrl;
  }
  return join(homedir(), '.seo-tool', 'data.db');
}

let _sqlite: Database.Database | null = null;
let _db: DrizzleDB | null = null;

export function getDb(): DrizzleDB {
  if (!_db) {
    const dbPath = getDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
    _db = drizzle(_sqlite, { schema });
  }
  return _db;
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

/**
 * Applica le migrazioni Drizzle — zero-config al primo avvio.
 * Usa i file SQL generati da `drizzle-kit generate` nella cartella drizzle/.
 * Chiamata automatica dallo smoke-test e dall'entry point CLI.
 */
export function migrateDB(): void {
  const instance = getDb();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = join(__dirname, '..', '..', 'drizzle');
  migrate(instance, { migrationsFolder });
}

/** Lazy proxy — compatibile con il pattern di import del vecchio prisma.ts */
export const db: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    const instance = getDb();
    return (instance as any)[prop];
  },
});
