/**
 * Test 4.3 - Test Cancellazione
 * 
 * Obiettivo: Verificare la politica di conservazione dati dopo cancellazione test.
 * 
 * Scenario: L'utente cancella un test completato.
 * 
 * Risultato atteso (opzione 1): I dati storici GSC rimangono nel database 
 * (non serve riscaricali), solo il test viene eliminato.
 * 
 * Risultato atteso (opzione 2): Eliminazione completa per privacy (GDPR compliance).
 * 
 * Priorità: MEDIA
 */

import { TestRepository } from '../../src/tests/TestRepository';

describe('Test 4.3 - Test Cancellazione', () => {
  let repository: TestRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repository = new TestRepository();
  });

  it('DEVE eliminare il test mantenendo i dati storici GSC (opzione 1 - efficienza)', async () => {
    // Arrange: Creo un test e raccolgo dati
    const test = await repository.createTest({
      userId,
      name: 'Test da Cancellare',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Raccolgo dati GSC
    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Cancello il test (confirm: true per mantenere i dati storici senza blocco)
    await repository.deleteTest(userId, test.id, { confirm: true });

    // Assert: Il test non esiste più
    await expect(repository.getTest(userId, test.id)).rejects.toThrow('Test not found');

    // Assert: I dati GSC storici sono ancora disponibili per riuso futuro
    const historicalData = await repository.getHistoricalGSCData(
      userId,
      'https://example.com/pagina-1',
      new Date('2026-01-10')
    );
    expect(historicalData).toBeDefined();
    expect(historicalData.clicks).toBe(100);
  });

  it('DEVE eliminare completamente tutti i dati se richiesto (opzione 2 - GDPR)', async () => {
    // Arrange: Creo un test e raccolgo dati
    const test = await repository.createTest({
      userId,
      name: 'Test da Cancellare Completamente',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Cancello il test con eliminazione completa dei dati
    await repository.deleteTest(userId, test.id, { deleteHistoricalData: true });

    // Assert: Il test non esiste più
    await expect(repository.getTest(userId, test.id)).rejects.toThrow('Test not found');

    // Assert: Anche i dati storici sono stati eliminati
    const historicalData = await repository.getHistoricalGSCData(
      userId,
      'https://example.com/pagina-1',
      new Date('2026-01-10')
    );
    expect(historicalData).toBeNull();
  });

  it('DEVE richiedere conferma prima di eliminare un test con dati', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test con Dati Importanti',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Raccolgo molti dati
    for (let i = 1; i <= 90; i++) {
      await repository.recordMetrics(test.id, {
        date: new Date(`2026-01-${String(i % 30 + 1).padStart(2, '0')}`),
        clicks: 100 * i,
        impressions: 1000 * i,
      });
    }

    // Act & Assert: Tento di cancellare senza conferma
    await expect(repository.deleteTest(userId, test.id)).rejects.toThrow(
      'Questo test contiene 90 giorni di dati. Confermi l\'eliminazione?'
    );
  });

  it('DEVE permettere eliminazione con conferma esplicita', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test da Eliminare',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Cancello con conferma
    await repository.deleteTest(userId, test.id, { confirm: true });

    // Assert: Il test è stato eliminato
    await expect(repository.getTest(userId, test.id)).rejects.toThrow('Test not found');
  });

  it('DEVE permettere eliminazione immediata di test senza dati', async () => {
    // Arrange: Test nuovo senza dati raccolti
    const test = await repository.createTest({
      userId,
      name: 'Test Vuoto',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Cancello senza conferma (non ci sono dati)
    await repository.deleteTest(userId, test.id);

    // Assert: Il test è stato eliminato senza richiedere conferma
    await expect(repository.getTest(userId, test.id)).rejects.toThrow('Test not found');
  });

  it('DEVE mantenere altri test dello stesso utente quando uno viene cancellato', async () => {
    // Arrange: Creo due test
    const test1 = await repository.createTest({
      userId,
      name: 'Test 1',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    const test2 = await repository.createTest({
      userId,
      name: 'Test 2',
      urls: ['https://example.com/pagina-2'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Cancello solo il primo test
    await repository.deleteTest(userId, test1.id, { confirm: true });

    // Assert: Il test 1 non esiste più
    await expect(repository.getTest(userId, test1.id)).rejects.toThrow('Test not found');

    // Assert: Il test 2 esiste ancora
    const remainingTest = await repository.getTest(userId, test2.id);
    expect(remainingTest).toBeDefined();
    expect(remainingTest.name).toBe('Test 2');
  });

  it('DEVE registrare la cancellazione per audit log (compliance)', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test da Tracciare',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    // Act: Cancello il test
    await repository.deleteTest(userId, test.id, { confirm: true });

    // Assert: L'evento di cancellazione è registrato nell'audit log
    const auditLog = await repository.getAuditLog(userId, test.id);
    expect(auditLog).toBeDefined();
    expect(auditLog.action).toBe('test_deleted');
    expect(auditLog.timestamp).toBeDefined();
    expect(auditLog.deletedBy).toBe(userId);
  });

  it('DEVE impedire accesso ai risultati dopo la cancellazione del test', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Cancello il test
    await repository.deleteTest(userId, test.id, { confirm: true });

    // Assert: Non posso più accedere ai risultati del test cancellato
    await expect(repository.getTestResults(userId, test.id)).rejects.toThrow('Test not found');
  });

  it('DEVE offrire opzione di esportazione prima della cancellazione definitiva', async () => {
    // Arrange
    const test = await repository.createTest({
      userId,
      name: 'Test con Dati Preziosi',
      urls: ['https://example.com/pagina-1'],
      startDate: new Date('2026-01-01'),
    });

    await repository.recordMetrics(test.id, {
      date: new Date('2026-01-10'),
      clicks: 100,
      impressions: 1000,
    });

    // Act: Tento di cancellare
    try {
      await repository.deleteTest(userId, test.id);
      expect.fail('Dovrebbe richiedere conferma');
    } catch (error) {
      // Assert: Il messaggio suggerisce l'esportazione
      expect((error as Error).message).toContain('Confermi l\'eliminazione?');
    }

    // Act: Esporto i dati prima di cancellare
    const exportedData = await repository.exportTestData(userId, test.id);
    expect(exportedData).toBeDefined();
    expect(exportedData.testName).toBe('Test con Dati Preziosi');
    expect(exportedData.metrics).toHaveLength(1);

    // Act: Ora posso cancellare tranquillamente
    await repository.deleteTest(userId, test.id, { confirm: true });

    // Assert: Test cancellato
    await expect(repository.getTest(userId, test.id)).rejects.toThrow('Test not found');
  });
});
