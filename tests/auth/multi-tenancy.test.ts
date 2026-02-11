/**
 * Test 1.4 - Test Multi-tenancy (Cruciale)
 * 
 * Priorità: CRITICA
 * 
 * Obiettivo: Verificare che l'utente A non possa accedere ai dati dell'utente B
 * 
 * Scenario: L'utente A modifica l'URL per puntare a un test dell'utente B
 * 
 * Risultato atteso: Errore 403 Forbidden: 
 * "Non hai i permessi per visualizzare questa risorsa."
 * 
 * Comportamento su fallimento: Questo è un bug di sicurezza CRITICO. 
 * I dati SEO sono confidenziali.
 */

import { AuthorizationService } from '../../src/auth/AuthorizationService';
import { TestRepository } from '../../src/tests/TestRepository';

describe('Test 1.4 - Multi-tenancy (Cruciale)', () => {
  let authService: AuthorizationService;
  let testRepository: TestRepository;

  beforeEach(() => {
    // Setup: Creiamo le istanze dei servizi con repository condiviso
    testRepository = new TestRepository();
    authService = new AuthorizationService(testRepository);
  });

  it('dovrebbe impedire all\'utente A di accedere ai test dell\'utente B', async () => {
    // Arrange: Creiamo due utenti distinti
    const userA = {
      id: 'user-a-123',
      email: 'usera@example.com',
    };

    const userB = {
      id: 'user-b-456',
      email: 'userb@example.com',
    };

    // L'utente B crea un test
    const testOfUserB = await testRepository.createTest({
      userId: userB.id,
      name: 'Test SEO di User B',
      urls: ['https://example.com/page1'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: L'utente A tenta di accedere al test di B
    await expect(
      authService.checkTestAccess(userA.id, testOfUserB.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe permettere all\'utente di accedere ai propri test', async () => {
    // Arrange: Un utente con il proprio test
    const user = {
      id: 'user-owner-789',
      email: 'owner@example.com',
    };

    const ownTest = await testRepository.createTest({
      userId: user.id,
      name: 'Mio Test SEO',
      urls: ['https://example.com/my-page'],
      startDate: new Date('2024-01-01'),
    });

    // Act: L'utente accede al proprio test
    const hasAccess = await authService.checkTestAccess(user.id, ownTest.id);

    // Assert: Deve avere accesso
    expect(hasAccess).toBe(true);
  });

  it('dovrebbe restituire 403 quando si tenta di modificare il test di un altro utente', async () => {
    // Arrange: Due utenti
    const attacker = { id: 'attacker-001', email: 'attacker@example.com' };
    const victim = { id: 'victim-002', email: 'victim@example.com' };

    const victimTest = await testRepository.createTest({
      userId: victim.id,
      name: 'Test Privato',
      urls: ['https://secret.com/page'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: L'attaccante tenta di modificare il test della vittima
    await expect(
      testRepository.updateTest(attacker.id, victimTest.id, {
        name: 'Test Hackerato!',
      })
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe restituire 403 quando si tenta di eliminare il test di un altro utente', async () => {
    // Arrange
    const userA = { id: 'user-delete-a', email: 'a@example.com' };
    const userB = { id: 'user-delete-b', email: 'b@example.com' };

    const testB = await testRepository.createTest({
      userId: userB.id,
      name: 'Test di B',
      urls: ['https://example.com/b'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: UserA tenta di eliminare il test di UserB
    await expect(
      testRepository.deleteTest(userA.id, testB.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe impedire l\'accesso ai risultati del test di un altro utente', async () => {
    // Arrange
    const owner = { id: 'owner-results', email: 'owner@example.com' };
    const intruder = { id: 'intruder-results', email: 'intruder@example.com' };

    const ownerTest = await testRepository.createTest({
      userId: owner.id,
      name: 'Test con Dati Sensibili',
      urls: ['https://confidential.com/data'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: L'intruso tenta di leggere i risultati
    await expect(
      testRepository.getTestResults(intruder.id, ownerTest.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe verificare i permessi per ogni operazione sul test', async () => {
    // Arrange: Due utenti
    const authenticated = { id: 'auth-user', email: 'auth@example.com' };
    const unauthorized = { id: 'unauth-user', email: 'unauth@example.com' };

    const test = await testRepository.createTest({
      userId: authenticated.id,
      name: 'Test Protetto',
      urls: ['https://protected.com'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: Verifichiamo diverse operazioni
    
    // GET test details
    await expect(
      testRepository.getTest(unauthorized.id, test.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');

    // UPDATE test
    await expect(
      testRepository.updateTest(unauthorized.id, test.id, { name: 'Hack' })
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');

    // DELETE test
    await expect(
      testRepository.deleteTest(unauthorized.id, test.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');

    // GET results
    await expect(
      testRepository.getTestResults(unauthorized.id, test.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe filtrare la lista dei test per mostrare solo quelli dell\'utente autenticato', async () => {
    // Arrange: Creiamo test per diversi utenti
    const user1 = { id: 'list-user-1', email: 'user1@example.com' };
    const user2 = { id: 'list-user-2', email: 'user2@example.com' };

    await testRepository.createTest({
      userId: user1.id,
      name: 'Test User 1 - A',
      urls: ['https://example.com/1a'],
      startDate: new Date('2024-01-01'),
    });

    await testRepository.createTest({
      userId: user1.id,
      name: 'Test User 1 - B',
      urls: ['https://example.com/1b'],
      startDate: new Date('2024-01-02'),
    });

    await testRepository.createTest({
      userId: user2.id,
      name: 'Test User 2 - A',
      urls: ['https://example.com/2a'],
      startDate: new Date('2024-01-03'),
    });

    // Act: User1 richiede la lista dei suoi test
    const user1Tests = await testRepository.listTests(user1.id);

    // Assert: Deve vedere solo i propri test (2)
    expect(user1Tests).toHaveLength(2);
    expect(user1Tests.every(test => test.userId === user1.id)).toBe(true);
    expect(user1Tests.some(test => test.userId === user2.id)).toBe(false);
  });

  it('dovrebbe gestire correttamente i test condivisi se implementata la feature', async () => {
    // Arrange: Test di un utente con condivisione
    const owner = { id: 'shared-owner', email: 'owner@example.com' };
    const collaborator = { id: 'shared-collab', email: 'collab@example.com' };

    const sharedTest = await testRepository.createTest({
      userId: owner.id,
      name: 'Test Condiviso',
      urls: ['https://shared.com'],
      startDate: new Date('2024-01-01'),
      sharedWith: [collaborator.id], // Feature di condivisione
    });

    // Act & Assert: Deve avere accesso se la feature è implementata
    // Altrimenti deve fallire con 403
    if (authService.supportsSharing) {
      const hasAccess = await authService.checkTestAccess(
        collaborator.id,
        sharedTest.id
      );
      expect(hasAccess).toBe(true);
    } else {
      await expect(
        authService.checkTestAccess(collaborator.id, sharedTest.id)
      ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
    }
  });

  it('dovrebbe prevenire SQL injection nei controlli di autorizzazione', async () => {
    // Arrange: Utente malintenzionato
    const maliciousUser = {
      id: "1' OR '1'='1",
      email: 'hacker@example.com',
    };

    const legitimateUser = {
      id: 'legit-user-123',
      email: 'legit@example.com',
    };

    const legitimateTest = await testRepository.createTest({
      userId: legitimateUser.id,
      name: 'Test Legittimo',
      urls: ['https://example.com'],
      startDate: new Date('2024-01-01'),
    });

    // Act & Assert: Tentativo di SQL injection deve fallire
    await expect(
      authService.checkTestAccess(maliciousUser.id, legitimateTest.id)
    ).rejects.toThrow('Non hai i permessi per visualizzare questa risorsa.');
  });

  it('dovrebbe loggare i tentativi di accesso non autorizzato per audit', async () => {
    // Arrange
    const attacker = { id: 'audit-attacker', email: 'attacker@evil.com' };
    const victim = { id: 'audit-victim', email: 'victim@example.com' };

    const victimTest = await testRepository.createTest({
      userId: victim.id,
      name: 'Dati Sensibili',
      urls: ['https://confidential.com'],
      startDate: new Date('2024-01-01'),
    });

    // Act: Tentativo di accesso non autorizzato
    try {
      await authService.checkTestAccess(attacker.id, victimTest.id);
    } catch (error) {
      // Expected
    }

    // Assert: Deve esistere un log dell'evento di sicurezza
    const securityLogs = await authService.getSecurityLogs({
      userId: attacker.id,
      eventType: 'unauthorized_access_attempt',
    });

    expect(securityLogs.length).toBeGreaterThan(0);
    expect(securityLogs[0].userId).toBe(attacker.id);
    expect(securityLogs[0].resourceId).toBe(victimTest.id);
    expect(securityLogs[0].action).toBe('read_test');
    expect(securityLogs[0].result).toBe('denied');
  });
});
