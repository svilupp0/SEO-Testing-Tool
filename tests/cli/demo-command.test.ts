/**
 * Test - Comando demo CLI
 *
 * Verifica che demoCommand() chiami la funzione demo esportata da demo.ts.
 * Mock completo di demo.ts per evitare accesso al DB e process.exit().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/demo.js', () => ({ demo: vi.fn() }));

describe('demoCommand', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('chiama la funzione demo', async () => {
    const { demo } = await import('../../src/demo.js');
    const { demoCommand } = await import('../../src/cli/commands.js');
    await demoCommand();
    expect(demo).toHaveBeenCalledOnce();
  });
});
