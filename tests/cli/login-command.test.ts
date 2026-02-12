/**
 * Test - Comando login CLI
 *
 * Verifica: generazione URL, scambio codice, salvataggio token,
 * gestione errori credenziali mancanti, upsert token esistenti
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, seedUser, type TestDB } from '../helpers/test-db';
import { oauthTokens, users, auditLogs } from '../../src/database/schema';

// Mock readline/promises
vi.mock('readline/promises', () => ({
  createInterface: () => ({ question: vi.fn(), close: vi.fn() }),
}));

// Mock db module
let testDb: TestDB;
vi.mock('../../src/database/db.js', () => ({
  get db() {
    return testDb;
  },
}));

// Mock chalk (passthrough)
vi.mock('chalk', () => ({
  default: new Proxy({}, {
    get: () => {
      const fn = (s: unknown) => String(s);
      return new Proxy(fn, { get: () => fn });
    },
  }),
}));

// Mock formatters
vi.mock('../../src/cli/formatters.js', () => ({
  colors: {
    header: (s: string) => s,
    muted: (s: string) => s,
    error: (s: string) => s,
    success: (s: string) => s,
    info: (s: string) => s,
    uncertain: (s: string) => s,
  },
  colorStatus: (s: string) => s,
  colorPValue: (p: number | null) => String(p),
  colorImprovement: (p: number | null) => String(p),
  formatTestTable: () => '',
  formatStatusDetail: () => '',
  renderClicksChart: () => '',
}));

// Mock GoogleOAuthService con vi.hoisted per evitare problemi di hoisting
const mockGetAuthorizationUrl = vi.fn();
const mockExchangeCodeForTokens = vi.fn();
vi.mock('../../src/auth/GoogleOAuthService.js', () => ({
  GoogleOAuthService: class {
    getAuthorizationUrl(...args: unknown[]) { return mockGetAuthorizationUrl(...args); }
    exchangeCodeForTokens(...args: unknown[]) { return mockExchangeCodeForTokens(...args); }
  },
}));

// Mock getGoogleOAuthConfig
const mockGetConfig = vi.fn();
vi.mock('../../src/config/env.js', () => ({
  getGoogleOAuthConfig: (...args: unknown[]) => mockGetConfig(...args),
}));

// Mock inquirer
const mockInquirerPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: {
    prompt: (...args: unknown[]) => mockInquirerPrompt(...args),
  },
}));

// Mock TokenManager (usato solo da runCommand, non da login)
vi.mock('../../src/auth/TokenManager.js', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    saveTokens: vi.fn(),
    getValidAccessToken: vi.fn(),
  })),
}));

const { loginCommand } = await import('../../src/cli/commands.js');

describe('Comando login', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDb = createTestDb();
    delete process.env['USER_ID'];

    // Reset mock implementations
    mockGetAuthorizationUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    mockExchangeCodeForTokens.mockResolvedValue({
      access_token: 'ya29.mock-access-token',
      refresh_token: '1//mock-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
    mockGetConfig.mockReturnValue({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/auth/callback',
      authUri: 'https://accounts.google.com/o/oauth2/auth',
      tokenUri: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    mockInquirerPrompt.mockResolvedValue({ code: '4/0mock-authorization-code' });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('dovrebbe generare l\'URL di autenticazione e mostrarlo', async () => {
    await loginCommand();

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    expect(output).toContain('Per collegare il tuo account Google');
  });

  it('dovrebbe scambiare il codice per i token e salvarli nel DB', async () => {
    await loginCommand();

    // Verifica che exchangeCodeForTokens sia stato chiamato con il codice
    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('4/0mock-authorization-code');

    // Verifica che il token sia stato salvato nel DB
    const token = testDb.select().from(oauthTokens).where(eq(oauthTokens.userId, 'default-user')).get();
    expect(token).toBeDefined();
    expect(token!.accessToken).toBe('ya29.mock-access-token');
    expect(token!.refreshToken).toBe('1//mock-refresh-token');
    expect(token!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('dovrebbe creare l\'utente default-user se non esiste', async () => {
    await loginCommand();

    const user = testDb.select().from(users).where(eq(users.id, 'default-user')).get();
    expect(user).toBeDefined();
    expect(user!.email).toBe('default-user@seo-tool.local');
  });

  it('dovrebbe usare USER_ID dall\'env se impostato', async () => {
    process.env['USER_ID'] = 'custom-user';
    seedUser(testDb, 'custom-user', 'custom@test.com');

    await loginCommand();

    const token = testDb.select().from(oauthTokens).where(eq(oauthTokens.userId, 'custom-user')).get();
    expect(token).toBeDefined();
    expect(token!.accessToken).toBe('ya29.mock-access-token');
  });

  it('dovrebbe mostrare messaggio di successo dopo il login', async () => {
    await loginCommand();

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Login effettuato');
    expect(output).toContain('seo-tool run');
  });

  it('dovrebbe registrare audit log con action user_login', async () => {
    await loginCommand();

    const logs = testDb.select().from(auditLogs).all();
    const loginLog = logs.find(l => l.action === 'user_login');
    expect(loginLog).toBeDefined();
    expect(loginLog!.userId).toBe('default-user');
  });

  it('dovrebbe aggiornare i token se l\'utente ha già fatto login', async () => {
    seedUser(testDb, 'default-user', 'default-user@seo-tool.local');

    // Inserisci token esistenti
    testDb.insert(oauthTokens).values({
      userId: 'default-user',
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: Date.now() - 3600000, // scaduto
    }).run();

    await loginCommand();

    // Verifica che il token sia stato aggiornato
    const token = testDb.select().from(oauthTokens).where(eq(oauthTokens.userId, 'default-user')).get();
    expect(token!.accessToken).toBe('ya29.mock-access-token');
    expect(token!.refreshToken).toBe('1//mock-refresh-token');
    expect(token!.expiresAt).toBeGreaterThan(Date.now());

    // Solo 1 record (upsert, non duplicato)
    const allTokens = testDb.select().from(oauthTokens).all();
    expect(allTokens).toHaveLength(1);
  });

  it('dovrebbe gestire errore di credenziali mancanti', async () => {
    mockGetConfig.mockImplementation(() => {
      throw new Error(
        'Google OAuth credentials not configured. ' +
        'Please create a .env file with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    });

    await loginCommand();

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Credenziali Google non configurate');
    expect(output).toContain('.env.example');
  });

  it('dovrebbe gestire errore di scambio codice', async () => {
    mockExchangeCodeForTokens.mockRejectedValueOnce(
      new Error('Impossibile connettersi a Google. Riprova.'),
    );

    await loginCommand();

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Impossibile connettersi a Google');

    // Nessun token salvato
    const allTokens = testDb.select().from(oauthTokens).all();
    expect(allTokens).toHaveLength(0);
  });

  it('dovrebbe trimmare il codice incollato dall\'utente', async () => {
    mockInquirerPrompt.mockResolvedValue({ code: '  4/0mock-code-with-spaces  ' });

    await loginCommand();

    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('4/0mock-code-with-spaces');
  });
});
