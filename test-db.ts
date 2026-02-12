import { config } from 'dotenv';
config();

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from './src/generated/prisma/client.js';

async function main() {
  const url = process.env['DATABASE_URL'] || 'file:./dev.db';
  console.log('URL:', url);

  const client = createClient({ url });
  const adapter = new PrismaLibSql(client);

  // Test: prisma-client-js con adapter
  console.log('\n--- Test: prisma-client-js + adapter ---');
  try {
    const prisma = new PrismaClient({ adapter } as any);
    const users = await prisma.user.findMany();
    console.log('OK! Users:', users.length);
  } catch (e: any) {
    console.log('FAIL:', e.message.substring(0, 200));
  }

  process.exit(0);
}

main();
