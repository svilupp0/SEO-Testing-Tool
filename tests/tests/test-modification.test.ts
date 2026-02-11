/**
 * Test 4.2 - Test Modifica in Corso
 * 
 * Obiettivo: Verificare la gestione della modifica della data di inizio su test attivo.
 * 
 * Scenario: L'utente cambia la data di inizio da "1 gennaio" a "15 gennaio" 
 * dopo aver già raccolto dati.
 * 
 * Risultato atteso: Il sistema ricalcola baseline e post-modifica con le nuove date. 
 * Messaggio di conferma: "La modifica della data cancellerà i dati raccolti. Confermi?"
 * 
 * Priorità: MEDIA
 */

import { TestRepository } from '../../src/tests/TestRepository';

describe('Test 4.2 - Test Modifica in Corso', () => {
  let repository: TestRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repository = new TestRepository();
  });

  it('DEVE richiedere conferma quando si modifica la data di inizio di un test attivo', async () => {
    // Arrange: Creo un test con data di inizio
    const test = await repository.createTest({
      userId,
      name: 'Test SEO Meta Description',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Act & Assert: Tento di modificare la data di inizio senza conferma
    await expect(
      repository.updateTest(userId, test.id, {
        startDate: new Date('2026-01-15'),
      })
    ).rejects.toThrow('La modifica della data cancellerà i dati raccolti. Confermi?');
  });

  it('DEVE permettere la modifica della data con conferma esplicita', async () => {
    // Arrange: Creo un test
    const test = await repository.createTest({
      userId,
      name: 'Test SEO',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Modifico la data con conferma
    const updatedTest = await repository.updateTest(
      userId,
      test.id,
      {
        startDate: new Date('2026-01-15'),
      },
      { confirmDataLoss: true }
    );

    // Assert: La modifica viene applicata
    expect(updatedTest.startDate).toEqual(new Date('2026-01-15'));
  });

  it('DEVE ricalcolare i dati raccolti quando la data viene modificata', async () => {
    // Arrange: Creo un test con dati raccolti
    const test = await repository.createTest({
      userId,
      name: 'Test SEO',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Simulo raccolta dati (questo metodo dovrebbe esistere)
    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Modifico la data con conferma
    await repository.updateTest(
      userId,
      test.id,
      {
        startDate: new Date('2026-01-15'),
      },
      { confirmDataLoss: true }
    );

    // Assert: I dati registrati prima della nuova data non devono essere contati
    const results = await repository.getTestResults(userId, test.id);
    expect(results.dataPoints).toHaveLength(0); // Nessun dato prima del 15 gennaio
  });

  it('DEVE permettere modifiche al nome senza richiedere conferma', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test Originale',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Modifico solo il nome (non la data)
    const updatedTest = await repository.updateTest(userId, test.id, {
      name: 'Test Rinominato',
    });

    // Assert: La modifica viene applicata senza conferma
    expect(updatedTest.name).toBe('Test Rinominato');
  });

  it('DEVE impedire la modifica di URL su test attivo per evitare inconsistenze', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test SEO',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Simulo che il test è attivo (ha dati)
    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act & Assert: Tento di modificare gli URL
    await expect(
      repository.updateTest(userId, test.id, {
        urls: ['https://example.com/pagina-2'],
      })
    ).rejects.toThrow(
      'Non è possibile modificare gli URL di un test con dati raccolti. Crea un nuovo test.'
    );
  });

  it('DEVE notificare l\'utente se ci sono dati che verranno persi', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test SEO',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Raccolgo 30 giorni di dati
    for (let i = 1; i <= 30; i++) {
      await repository.recordMetrics(test.id, {
        date: new Date(`2026-01-${String(i).padStart(2, '0')}`),
        clicks: 100 * i,
        impressions: 1000 * i,
      });
    }

    // Act & Assert: L'errore deve specificare quanti dati verranno persi
    try {
      await repository.updateTest(userId, test.id, {
        startDate: new Date('2026-01-15'),
      });
      expect.fail('Dovrebbe aver sollevato un errore di conferma');
    } catch (error) {
      expect((error as Error).message).toContain('30 giorni di dati');
      expect((error as Error).message).toContain('Confermi?');
    }
  });
});
