/**
 * Test - Comando setup CLI
 *
 * Verifica il wizard interattivo per la configurazione OAuth2 Google:
 * - scrittura nuove credenziali in .env
 * - link a Google Cloud Console
 * - redirect URI di default
 * - preservazione variabili non-Google esistenti
 * - aggiornamento senza duplicati
 * - richiesta conferma se credenziali già presenti
 * - messaggio finale con prossimo step
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDB } from '../helpers/test-db';

// --- Mock fs/promises ---
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// --- Mock readline/promises (importato a livello di modulo in commands.ts) ---
vi.mock('readline/promises', () => ({
  createInterface: () => ({
    question: vi.fn().mockResolvedValue(''),
    close: vi.fn(),
  }),
}));

// --- Mock db ---
let testDb: TestDB;
vi.mock('../../src/database/db.js', () => ({
  get db() {
    return testDb;
  },
}));

// --- Mock chalk (passthrough) ---
vi.mock('chalk', () => ({
  default: new Proxy(
    {},
    {
      get: () => {
        const fn = (s: unknown) => String(s);
        return new Proxy(fn, { get: () => fn });
      },
    }
  ),
}));

// --- Mock formatters ---
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

// --- Mock open ---
const mockOpen = vi.fn().mockResolvedValue(undefined);
vi.mock('open', () => ({
  default: (...args: unknown[]) => mockOpen(...args),
}));

// --- Mock inquirer ---
const mockInquirerPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: { prompt: (...args: unknown[]) => mockInquirerPrompt(...args) },
}));

// --- Mock moduli non usati da setupCommand ---
vi.mock('../../src/auth/GoogleOAuthService.js', () => ({
  GoogleOAuthService: class {
    getAuthorizationUrl() {
      return '';
    }
    exchangeCodeForTokens() {
      return {};
    }
  },
}));
vi.mock('../../src/config/env.js', () => ({
  getGoogleOAuthConfig: vi.fn(),
}));
vi.mock('../../src/auth/TokenManager.js', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    saveTokens: vi.fn(),
    getValidAccessToken: vi.fn(),
  })),
}));

const { setupCommand } = await import('../../src/cli/commands.js');

describe('Comando setup', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // resetAllMocks azzera call history + implementazioni + coda once (clearAllMocks non basta)
    vi.resetAllMocks();

    mockOpen.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    testDb = createTestDb();

    // Nessuna variabile Google nell'ambiente
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];
    delete process.env['GOOGLE_REDIRECT_URI'];

    // Risposte di default: nessuna cred → pausa → manuale → credenziali
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'manual' })
      .mockResolvedValueOnce({
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];
    delete process.env['GOOGLE_REDIRECT_URI'];
  });

  it('dovrebbe scrivere le credenziali in un nuovo .env', async () => {
    await setupCommand();

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain('GOOGLE_CLIENT_ID=my-client-id');
    expect(content).toContain('GOOGLE_CLIENT_SECRET=my-client-secret');
    expect(content).toContain(
      'GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback'
    );
  });

  it('dovrebbe mostrare il link a Google Cloud Console', async () => {
    await setupCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('console.cloud.google.com');
  });

  it('dovrebbe usare il redirect URI di default se lasciato vuoto', async () => {
    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'manual' })
      .mockResolvedValueOnce({
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
        redirectUri: '',
      });

    await setupCommand();

    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain(
      'GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback'
    );
  });

  it('dovrebbe preservare le variabili non-Google in .env esistente', async () => {
    mockReadFile.mockResolvedValue('DATABASE_URL=sqlite.db\nSECRET=abc123');

    await setupCommand();

    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain('DATABASE_URL=sqlite.db');
    expect(content).toContain('SECRET=abc123');
    expect(content).toContain('GOOGLE_CLIENT_ID=my-client-id');
  });

  it('dovrebbe aggiornare GOOGLE_CLIENT_ID già presente nel .env senza duplicarlo', async () => {
    mockReadFile.mockResolvedValue(
      'GOOGLE_CLIENT_ID=old-id\nDATABASE_URL=sqlite.db'
    );

    await setupCommand();

    const content: string = mockWriteFile.mock.calls[0][1];
    const matches = content.match(/GOOGLE_CLIENT_ID=/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain('GOOGLE_CLIENT_ID=my-client-id');
    expect(content).not.toContain('GOOGLE_CLIENT_ID=old-id');
  });

  it('dovrebbe chiedere conferma e non scrivere se utente rifiuta sovrascrittura', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'existing-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'existing-secret';

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt.mockResolvedValueOnce({ overwrite: false });

    await setupCommand();

    expect(mockWriteFile).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('annullata');
  });

  it('dovrebbe sovrascrivere le credenziali se utente conferma', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'existing-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'existing-secret';

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ overwrite: true })
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'manual' })
      .mockResolvedValueOnce({
        clientId: 'new-client-id',
        clientSecret: 'new-client-secret',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

    await setupCommand();

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain('GOOGLE_CLIENT_ID=new-client-id');
  });

  it('dovrebbe mostrare "seo-tool login" come prossimo step', async () => {
    await setupCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('seo-tool login');
  });

  it('dovrebbe aprire il browser su Google Cloud Console', async () => {
    await setupCommand();

    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith(
      'https://console.cloud.google.com/apis/credentials'
    );
  });

  it('dovrebbe mostrare la guida numerata in 5 step', async () => {
    await setupCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('1.');
    expect(output).toContain('2.');
    expect(output).toContain('3.');
    expect(output).toContain('4.');
    expect(output).toContain('5.');
  });

  it('dovrebbe scrivere le credenziali leggendo un file JSON formato installed', async () => {
    const fakeJson = JSON.stringify({
      installed: {
        client_id: 'json-client-id',
        client_secret: 'json-client-secret',
        redirect_uris: ['http://localhost'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    });
    // Primo readFile: .env non esiste; secondo readFile: il file JSON
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(fakeJson);

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/client_secret.json' });

    await setupCommand();

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain('GOOGLE_CLIENT_ID=json-client-id');
    expect(content).toContain('GOOGLE_CLIENT_SECRET=json-client-secret');
  });

  it('dovrebbe scrivere le credenziali leggendo un file JSON formato web', async () => {
    const fakeJson = JSON.stringify({
      web: {
        client_id: 'web-client-id',
        client_secret: 'web-client-secret',
        redirect_uris: ['https://example.com/callback'],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    });
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(fakeJson);

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/client_secret_web.json' });

    await setupCommand();

    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain('GOOGLE_CLIENT_ID=web-client-id');
    expect(content).toContain('GOOGLE_CLIENT_SECRET=web-client-secret');
  });

  it('dovrebbe impostare GOOGLE_REDIRECT_URI a localhost:3000 indipendentemente dal file JSON', async () => {
    const fakeJson = JSON.stringify({
      installed: {
        client_id: 'json-id',
        client_secret: 'json-secret',
        redirect_uris: ['http://localhost'],
      },
    });
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(fakeJson);

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/client_secret.json' });

    await setupCommand();

    const content: string = mockWriteFile.mock.calls[0][1];
    expect(content).toContain(
      'GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback'
    );
    expect(content).not.toContain('GOOGLE_REDIRECT_URI=http://localhost\n');
  });

  it('dovrebbe mostrare errore se il file JSON non esiste', async () => {
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/non-esiste.json' });

    await setupCommand();

    expect(mockWriteFile).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('non trovato');
  });

  it('dovrebbe mostrare errore se il file JSON è sintatticamente invalido', async () => {
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce('{ questo non è JSON valido }');

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/broken.json' });

    await setupCommand();

    expect(mockWriteFile).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('non valido');
  });

  it('dovrebbe mostrare errore se il file JSON non ha il formato corretto (no installed/web)', async () => {
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(
        JSON.stringify({ type: 'service_account', project_id: 'test' })
      );

    mockInquirerPrompt.mockReset();
    mockInquirerPrompt
      .mockResolvedValueOnce({ _: '' })
      .mockResolvedValueOnce({ mode: 'json' })
      .mockResolvedValueOnce({ jsonPath: '/tmp/service-account.json' });

    await setupCommand();

    expect(mockWriteFile).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Formato file non riconosciuto');
  });

  it('dovrebbe continuare se il browser non può aprirsi (fallback URL in output)', async () => {
    mockOpen.mockRejectedValueOnce(new Error('spawn failed'));

    await setupCommand();

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('console.cloud.google.com');
  });
});
