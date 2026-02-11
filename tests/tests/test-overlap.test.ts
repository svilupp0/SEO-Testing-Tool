/**
 * Test 4.1 - Test Sovrapposizione
 * 
 * Obiettivo: Verificare che non si possano lanciare test simultanei sulla stessa pagina.
 * 
 * Scenario: L'utente tenta di creare un secondo test su una pagina già in test attivo.
 * 
 * Risultato atteso: Errore: "Questa pagina è già inclusa nel test 'Nome Test'. 
 * Completa o cancella quel test prima di crearne uno nuovo."
 * 
 * Priorità: ALTA
 */

import { TestRepository } from '../../src/tests/TestRepository';

describe('Test 4.1 - Test Sovrapposizione', () => {
  let repository: TestRepository;
  const userId = 'user-123';
  const overlappingUrl = 'https://example.com/pagina-test';

  beforeEach(() => {
    repository = new TestRepository();
  });

  it('DEVE impedire la creazione di un secondo test sulla stessa pagina già in test attivo', async () => {
    // Arrange: Creo il primo test con una pagina specifica
    const primoTest = await repository.createTest({
      userId,
      name: 'Test Originale - Ottimizzazione Titolo',
      urls: [overlappingUrl, 'https://example.com/altra-pagina'],
      startDate: new Date('2026-01-01'),
    });

    // Act & Assert: Tento di creare un secondo test che include la stessa pagina
    await expect(
      repository.createTest({
        userId,
        name: 'Nuovo Test - Ottimizzazione Meta Description',
        urls: [overlappingUrl, 'https://example.com/pagina-diversa'],
        startDate: new Date('2026-02-01'),
      })
    ).rejects.toThrow(
      `Questa pagina è già inclusa nel test '${primoTest.name}'. Completa o cancella quel test prima di crearne uno nuovo.`
    );
  });

  it('DEVE permettere la creazione di test su pagine diverse (nessuna sovrapposizione)', async () => {
    // Arrange: Creo il primo test
    await repository.createTest({
      userId,
      name: 'Test A',
      urls: ['https://example.com/pagina-1', 'https://example.com/pagina-2'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Creo un secondo test su pagine completamente diverse
    const secondoTest = await repository.createTest({
      userId,
      name: 'Test B',
      urls: ['https://example.com/pagina-3', 'https://example.com/pagina-4'],
      startDate: new Date('2026-02-01'),
    });

    // Assert: Il secondo test viene creato senza errori
    expect(secondoTest).toBeDefined();
    expect(secondoTest.name).toBe('Test B');
  });

  it('DEVE rilevare sovrapposizione anche quando l\'URL sovrapposto non è il primo della lista', async () => {
    // Arrange: Creo il primo test
    await repository.createTest({
      userId,
      name: 'Test Iniziale',
      urls: ['https://example.com/pagina-a', overlappingUrl, 'https://example.com/pagina-b'],
      startDate: new Date('2026-01-01'),
    });

    // Act & Assert: Tento di creare un test dove l'URL sovrapposto è in mezzo alla lista
    await expect(
      repository.createTest({
        userId,
        name: 'Test Sovrapposto',
        urls: ['https://example.com/pagina-c', overlappingUrl],
        startDate: new Date('2026-02-01'),
      })
    ).rejects.toThrow(/Questa pagina è già inclusa nel test/);
  });

  it('DEVE permettere la creazione di un nuovo test sullo stesso URL dopo che il primo test è stato cancellato', async () => {
    // Arrange: Creo un test
    const primoTest = await repository.createTest({
      userId,
      name: 'Test Da Cancellare',
      urls: [overlappingUrl],
      startDate: new Date('2026-01-01'),
    });

    // Cancello il primo test
    await repository.deleteTest(userId, primoTest.id);

    // Act: Creo un nuovo test sulla stessa URL (ora libera)
    const nuovoTest = await repository.createTest({
      userId,
      name: 'Nuovo Test Sulla Stessa Pagina',
      urls: [overlappingUrl],
      startDate: new Date('2026-02-01'),
    });

    // Assert: Il nuovo test viene creato senza errori
    expect(nuovoTest).toBeDefined();
    expect(nuovoTest.urls).toContain(overlappingUrl);
  });

  it('DEVE rilevare sovrapposizione solo per test dello stesso utente (multi-tenancy)', async () => {
    // Arrange: User A crea un test
    const userA = 'user-a';
    const userB = 'user-b';

    await repository.createTest({
      userId: userA,
      name: 'Test User A',
      urls: [overlappingUrl],
      startDate: new Date('2026-01-01'),
    });

    // Act: User B crea un test sulla stessa URL (deve essere permesso)
    const testUserB = await repository.createTest({
      userId: userB,
      name: 'Test User B',
      urls: [overlappingUrl],
      startDate: new Date('2026-02-01'),
    });

    // Assert: Il test di User B viene creato senza errori (isolation tra utenti)
    expect(testUserB).toBeDefined();
    expect(testUserB.userId).toBe(userB);
  });

  it('DEVE fornire informazioni chiare su quale test sta bloccando la creazione', async () => {
    // Arrange
    const primoTest = await repository.createTest({
      userId,
      name: 'Test Con Nome Molto Specifico',
      urls: [overlappingUrl],
      startDate: new Date('2026-01-01'),
    });

    // Act & Assert: Verifico che il messaggio di errore menzioni esplicitamente il nome del test
    try {
      await repository.createTest({
        userId,
        name: 'Tentativo Sovrapposizione',
        urls: [overlappingUrl],
        startDate: new Date('2026-02-01'),
      });
      
      // Se arriviamo qui, il test ha fallito
      expect.fail('Dovrebbe aver sollevato un errore di sovrapposizione');
    } catch (error) {
      expect(error).toBeDefined();
      expect((error as Error).message).toContain(primoTest.name);
      expect((error as Error).message).toContain('Questa pagina è già inclusa nel test');
    }
  });
});
