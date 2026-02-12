import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { homedir } from 'os';
import { join } from 'path';

const defaultDbPath = join(homedir(), '.seo-tool', 'data.db');

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env['DATABASE_URL'] || defaultDbPath,
  },
});
