/**
 * DEPRECATO — Migrato a Drizzle ORM.
 * Usa createTestDb() da tests/helpers/test-db.ts al suo posto.
 *
 * Questo file è mantenuto solo per evitare errori di import residui.
 */
export {
  createTestDb as createMockPrisma,
  type TestDB as MockPrisma,
} from './test-db';
