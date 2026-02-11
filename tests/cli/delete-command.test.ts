/**
 * Test - Comando delete CLI
 *
 * Verifica: ID parziale, conferma interattiva, cascade metriche, audit log
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, type MockPrisma } from '../helpers/prisma-mock';

// Mock readline/promises
const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock('readline/promises', () => ({
  createInterface: () => ({ question: mockQuestion, close: mockClose }),
}));

// Mock prisma
let mockPrisma: MockPrisma;
vi.mock('../../src/database/prisma.js', () => ({
  get prisma() {
    return mockPrisma;
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

const { deleteCommand } = await import('../../src/cli/commands.js');

describe('Comando delete', () => {
  const fakeTest = {
    id: 'abcd1234-5678-9abc-def0-123456789abc',
    name: 'Test SEO Homepage',
    status: 'running',
    userId: 'user-1',
    siteUrl: 'sc-domain:example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
  });

  it('dovrebbe eliminare un test trovato per ID esatto con conferma "s"', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(5);
    mockQuestion.mockResolvedValue('s');
    mockPrisma.test.delete.mockResolvedValue(fakeTest);
    mockPrisma.auditLog.create.mockResolvedValue({});

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(fakeTest.id);

    expect(mockPrisma.test.delete).toHaveBeenCalledWith({ where: { id: fakeTest.id } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        testId: fakeTest.id,
        action: 'test_deleted',
        userId: 'user-1',
      },
    });

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('eliminato con successo');
    expect(output).toContain('5 metriche rimosse');

    logSpy.mockRestore();
  });

  it('dovrebbe trovare il test per ID parziale', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(null);
    mockPrisma.test.findMany.mockResolvedValue([fakeTest]);
    mockPrisma.metric.count.mockResolvedValue(0);
    mockQuestion.mockResolvedValue('s');
    mockPrisma.test.delete.mockResolvedValue(fakeTest);
    mockPrisma.auditLog.create.mockResolvedValue({});

    await deleteCommand('abcd');

    expect(mockPrisma.test.findMany).toHaveBeenCalledWith({
      where: { id: { startsWith: 'abcd' } },
    });
    expect(mockPrisma.test.delete).toHaveBeenCalledWith({ where: { id: fakeTest.id } });
  });

  it('dovrebbe mostrare ambiguità se più test corrispondono all\'ID parziale', async () => {
    const fakeTest2 = { ...fakeTest, id: 'abcd9999-aaaa-bbbb-cccc-dddddddddddd', name: 'Altro Test' };
    mockPrisma.test.findUnique.mockResolvedValue(null);
    mockPrisma.test.findMany.mockResolvedValue([fakeTest, fakeTest2]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand('abcd');

    expect(mockPrisma.test.delete).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Trovati 2 test');

    logSpy.mockRestore();
  });

  it('dovrebbe mostrare errore se il test non esiste', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(null);
    mockPrisma.test.findMany.mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand('zzzzz');

    expect(mockPrisma.test.delete).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('non trovato');

    logSpy.mockRestore();
  });

  it('dovrebbe annullare se l\'utente non conferma', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(3);
    mockQuestion.mockResolvedValue('n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(fakeTest.id);

    expect(mockPrisma.test.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('annullata');

    logSpy.mockRestore();
  });

  it('dovrebbe annullare se l\'utente preme Invio senza rispondere', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(0);
    mockQuestion.mockResolvedValue('');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(fakeTest.id);

    expect(mockPrisma.test.delete).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('dovrebbe accettare "si" come conferma', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(0);
    mockQuestion.mockResolvedValue('si');
    mockPrisma.test.delete.mockResolvedValue(fakeTest);
    mockPrisma.auditLog.create.mockResolvedValue({});

    await deleteCommand(fakeTest.id);

    expect(mockPrisma.test.delete).toHaveBeenCalled();
  });

  it('dovrebbe registrare audit log con action test_deleted', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(0);
    mockQuestion.mockResolvedValue('s');
    mockPrisma.test.delete.mockResolvedValue(fakeTest);
    mockPrisma.auditLog.create.mockResolvedValue({});

    await deleteCommand(fakeTest.id);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'test_deleted',
          testId: fakeTest.id,
          userId: fakeTest.userId,
        }),
      }),
    );
  });

  it('dovrebbe gestire errori del database', async () => {
    mockPrisma.test.findUnique.mockRejectedValue(new Error('DB connection lost'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deleteCommand(fakeTest.id);

    const output = errorSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('DB connection lost');

    errorSpy.mockRestore();
  });

  it('dovrebbe mostrare il nome del test prima della conferma', async () => {
    mockPrisma.test.findUnique.mockResolvedValue(fakeTest);
    mockPrisma.metric.count.mockResolvedValue(10);
    mockQuestion.mockResolvedValue('n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await deleteCommand(fakeTest.id);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Test SEO Homepage');
    expect(output).toContain('10 record');

    logSpy.mockRestore();
  });
});
