import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDbUrl(): string {
  // Forza l'uso del file locale per lo sviluppo se non specificato
  const defaultDbPath = join(homedir(), '.seo-tool', 'data.db');
  let dbUrl = process.env['DATABASE_URL'] || `file:${defaultDbPath}`;

  if (dbUrl.startsWith('file:')) {
    const filePath = dbUrl.replace('file:', '');
    mkdirSync(dirname(filePath), { recursive: true });
  }
  return dbUrl;
}

function createPrismaClient(): PrismaClient {
  const url = getDbUrl();
  // Necessario per Prisma v7: l'URL deve essere presente nell'env
  // perché l'engine WASM lo cerca anche se si usa un adapter
  process.env['DATABASE_URL'] = url;

  const client = createClient({ url });
  const adapter = new PrismaLibSql(client);

  // In Prisma v7 con provider "prisma-client", l'adapter è obbligatorio
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const p = getPrisma();
    return (p as any)[prop];
  },
});

export type { PrismaClient };
