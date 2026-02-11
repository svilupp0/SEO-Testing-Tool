import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Crea PrismaClient con driver adapter pg (richiesto da Prisma v7 prisma-client provider).
 */
function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

/**
 * Lazy singleton: PrismaClient viene creato solo al primo accesso,
 * evitando crash durante i test che iniettano un mock nel constructor.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Mantenuto per backward-compatibility come proxy lazy
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});

export type { PrismaClient };
