/**
 * CLI E2E Tests
 *
 * Spawna `node dist/cli.js` come processo esterno per verificare
 * il comportamento end-to-end della CLI compilata.
 *
 * Prerequisito: `npm run build` (lo script test:e2e lo fa automaticamente).
 * Se dist/cli.js non esiste, i test vengono skippati.
 */

import { describe, it, expect } from 'vitest';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CLI = join(ROOT, 'dist', 'cli.js');
const NODE = process.execPath;
const CLI_EXISTS = existsSync(CLI);
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf-8'),
).version;

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawna `node dist/cli.js <args>` con un DB SQLite temporaneo isolato.
 * Restituisce stdout, stderr e exit code.
 */
async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<CliResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'seo-e2e-'));
  const dbPath = join(tmpDir, 'test.db');

  try {
    const { stdout, stderr } = await execFileAsync(NODE, [CLI, ...args], {
      env: {
        ...process.env,
        DATABASE_URL: dbPath,
        NO_COLOR: '1',
        ...(env || {}),
      },
      timeout: 15_000,
      cwd: ROOT,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite — skippata se dist/cli.js non esiste (build non eseguita)
// ---------------------------------------------------------------------------

describe.skipIf(!CLI_EXISTS)('CLI E2E', () => {
  it('seo-tool --version → exit 0, stampa la versione da package.json', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    // dotenv puo' stampare un log su stdout — prendiamo l'ultima riga
    const lastLine = result.stdout.trim().split(/\r?\n/).pop()!.trim();
    expect(lastLine).toBe(PKG_VERSION);
  });

  it('seo-tool --help → exit 0, elenca tutti i comandi', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('seo-tool');
    for (const cmd of ['login', 'add', 'list', 'status', 'run', 'export', 'delete']) {
      expect(result.stdout).toContain(cmd);
    }
  });

  it('seo-tool list → exit 0, "Nessun test" su DB vuoto', async () => {
    const result = await runCli(['list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nessun test');
  });

  it('seo-tool status <id-inesistente> → gestisce gracefully "non trovato"', async () => {
    const result = await runCli(['status', 'nonexistent-id-12345']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('non trovato');
  });

  it('seo-tool delete <id-inesistente> → gestisce gracefully "non trovato"', async () => {
    const result = await runCli(['delete', 'nonexistent-id-12345']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('non trovato');
  });

  it('seo-tool export <id-inesistente> → gestisce gracefully "non trovato"', async () => {
    const result = await runCli(['export', 'nonexistent-id-12345']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('non trovato');
  });

  it('seo-tool <comando-sconosciuto> → exit non-zero', async () => {
    const result = await runCli(['comandoinesistente']);
    expect(result.exitCode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tarball test — verifica che il pacchetto funzioni dopo npm pack + install
// ---------------------------------------------------------------------------

describe.skipIf(!CLI_EXISTS)('Tarball install', () => {
  it(
    'npm pack → install in dir temporanea → --version funziona',
    async () => {
      // 1. Crea tarball
      const tgzName = execSync('npm pack', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const tgzPath = join(ROOT, tgzName);
      const tmpDir = mkdtempSync(join(tmpdir(), 'seo-tarball-'));

      try {
        // 2. Inizializza progetto temporaneo e installa il tarball
        execSync('npm init -y', { cwd: tmpDir, stdio: 'pipe' });
        execSync(`npm install "${tgzPath}"`, {
          cwd: tmpDir,
          stdio: 'pipe',
          timeout: 120_000,
        });

        // 3. Verifica che dist/cli.js esista nel pacchetto installato
        const installedCli = join(
          tmpDir,
          'node_modules',
          'seo-testing-tool',
          'dist',
          'cli.js',
        );
        expect(existsSync(installedCli)).toBe(true);

        // 4. Verifica che drizzle/ (migrazioni) sia incluso
        const installedDrizzle = join(
          tmpDir,
          'node_modules',
          'seo-testing-tool',
          'drizzle',
        );
        expect(existsSync(installedDrizzle)).toBe(true);

        // 5. Esegui --version dal pacchetto installato
        const dbPath = join(tmpDir, 'test.db');
        const { stdout } = await execFileAsync(
          NODE,
          [installedCli, '--version'],
          {
            env: { ...process.env, DATABASE_URL: dbPath, NO_COLOR: '1' },
            timeout: 15_000,
            cwd: tmpDir,
          },
        );
        const lastLine = stdout.trim().split(/\r?\n/).pop()!.trim();
        expect(lastLine).toBe(PKG_VERSION);
      } finally {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* */
        }
        try {
          rmSync(tgzPath, { force: true });
        } catch {
          /* */
        }
      }
    },
    120_000,
  );
});
