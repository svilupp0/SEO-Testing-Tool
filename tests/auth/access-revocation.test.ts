/**
 * Test 1.3 - Test Revoca Accesso
 *
 * Priorità: ALTA
 *
 * Obiettivo: Verificare che il sistema reagisca correttamente se l'utente
 * revoca l'accesso da Google
 *
 * Scenario: L'utente scollega l'app dalle impostazioni Google
 *
 * Risultato atteso: Il sistema smette di tentare il fetch, mostra:
 * "Accesso revocato. Riconnetti il tuo account Google."
 *
 * Comportamento su fallimento: Non deve continuare a fare richieste fallite
 * generando errori 401
 */

import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';
import { TokenManager } from '../../src/auth/TokenManager';

describe('Test 1.3 - Revoca Accesso', () => {
  let authService: GoogleOAuthService;
  let tokenManager: TokenManager;

  beforeEach(() => {
    // Setup: Creiamo le istanze dei servizi prima di ogni test
    authService = new GoogleOAuthService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/auth/callback',
    });

    tokenManager = new TokenManager(authService);
  });

  it('dovrebbe rilevare quando Google restituisce errore di token revocato', async () => {
    // Arrange: Simuliamo un token valido inizialmente
    const userId = 'user-123';
    const accessToken = 'revoked-access-token';
    const refreshToken = 'revoked-refresh-token';

    // Salviamo i token
    await tokenManager.saveTokens(userId, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Mock di una risposta di Google che indica token revocato
    // Google restituisce errore 400 con "invalid_grant" quando il token è revocato
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
        { status: 400 }
      )
    );

    // Act & Assert: Tentativo di refresh dovrebbe rilevare la revoca
    await expect(tokenManager.refreshAccessToken(userId)).rejects.toThrow(
      'Accesso revocato. Riconnetti il tuo account Google.'
    );
  });

  it('dovrebbe rilevare errore 401 Unauthorized come segnale di revoca', async () => {
    // Arrange: Simuliamo una chiamata API con token revocato
    const userId = 'user-456';
    const accessToken = 'unauthorized-token';

    await tokenManager.saveTokens(userId, {
      access_token: accessToken,
      refresh_token: 'some-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Mock di una risposta 401 Unauthorized da Google API
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 401,
            message: 'Request had invalid authentication credentials.',
          },
        }),
        { status: 401 }
      )
    );

    // Act & Assert: Verifichiamo che il sistema rilevi la revoca
    const result = await tokenManager.validateAccessToken(accessToken);

    expect(result.isValid).toBe(false);
    expect(result.isRevoked).toBe(true);
    expect(result.errorMessage).toBe(
      'Accesso revocato. Riconnetti il tuo account Google.'
    );
  });

  it('dovrebbe marcare i token come revocati nel database dopo rilevamento', async () => {
    // Arrange: Utente con token revocato
    const userId = 'user-789';

    await tokenManager.saveTokens(userId, {
      access_token: 'revoked-token',
      refresh_token: 'revoked-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Simuliamo errore di revoca
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    );

    // Act: Tentiamo il refresh che fallisce per revoca
    try {
      await tokenManager.refreshAccessToken(userId);
    } catch (error) {
      // Expected error
    }

    // Assert: I token devono essere marcati come revocati
    const tokenStatus = await tokenManager.getTokenStatus(userId);

    expect(tokenStatus.isRevoked).toBe(true);
    expect(tokenStatus.revokedAt).toBeDefined();
    expect(tokenStatus.revokedAt).toBeInstanceOf(Date);
  });

  it('NON dovrebbe continuare a fare richieste dopo aver rilevato la revoca', async () => {
    // Arrange: Utente con token revocato
    const userId = 'user-multi-request';

    await tokenManager.saveTokens(userId, {
      access_token: 'revoked-token',
      refresh_token: 'revoked-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Mock che conta le chiamate
    const fetchSpy = vi.spyOn(global, 'fetch');

    // Prima chiamata: rileva la revoca
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    );

    // Act: Prima richiesta rileva la revoca
    try {
      await tokenManager.refreshAccessToken(userId);
    } catch (error) {
      // Expected
    }

    // Resettiamo il mock per contare le nuove chiamate
    fetchSpy.mockClear();

    // Act: Seconda richiesta NON deve chiamare Google
    try {
      await tokenManager.refreshAccessToken(userId);
    } catch (error) {
      // Expected
    }

    // Assert: Nessuna nuova chiamata HTTP deve essere fatta
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dovrebbe permettere la riconnessione dopo la revoca', async () => {
    // Arrange: Utente con accesso precedentemente revocato
    const userId = 'user-reconnect';

    // Simuliamo token revocato
    await tokenManager.saveTokens(userId, {
      access_token: 'old-revoked-token',
      refresh_token: 'old-revoked-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await tokenManager.markAsRevoked(userId);

    // Verifichiamo che sia effettivamente revocato
    let status = await tokenManager.getTokenStatus(userId);
    expect(status.isRevoked).toBe(true);

    // Act: L'utente si riconnette con nuovi token
    await tokenManager.saveTokens(userId, {
      access_token: 'new-valid-token',
      refresh_token: 'new-valid-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Assert: Lo status dovrebbe essere ripristinato
    status = await tokenManager.getTokenStatus(userId);
    expect(status.isRevoked).toBe(false);
    expect(status.revokedAt).toBeNull();
  });

  it('dovrebbe fornire un metodo per verificare lo stato di revoca', async () => {
    // Arrange: Due utenti, uno revocato e uno attivo
    const revokedUserId = 'user-revoked';
    const activeUserId = 'user-active';

    await tokenManager.saveTokens(revokedUserId, {
      access_token: 'token1',
      refresh_token: 'refresh1',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await tokenManager.saveTokens(activeUserId, {
      access_token: 'token2',
      refresh_token: 'refresh2',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await tokenManager.markAsRevoked(revokedUserId);

    // Act: Verifichiamo lo stato
    const revokedStatus = await tokenManager.isAccessRevoked(revokedUserId);
    const activeStatus = await tokenManager.isAccessRevoked(activeUserId);

    // Assert
    expect(revokedStatus).toBe(true);
    expect(activeStatus).toBe(false);
  });

  it('dovrebbe restituire un messaggio chiaro quando si tenta di usare token revocati', async () => {
    // Arrange: Utente con token revocato
    const userId = 'user-clear-message';

    await tokenManager.saveTokens(userId, {
      access_token: 'revoked-token',
      refresh_token: 'revoked-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await tokenManager.markAsRevoked(userId);

    // Act: Tentiamo di ottenere un token valido
    const result = await tokenManager.getValidAccessToken(userId);

    // Assert: Deve restituire errore chiaro
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Accesso revocato. Riconnetti il tuo account Google.'
    );
    expect(result.token).toBeNull();
  });

  it('dovrebbe distinguere tra revoca e altri errori API', async () => {
    // Arrange: Setup per testare diversi tipi di errore
    const userId = 'user-error-types';

    await tokenManager.saveTokens(userId, {
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    // Test 1: Errore di rete (non è revoca)
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(
      new Error('Network timeout')
    );

    await expect(tokenManager.refreshAccessToken(userId)).rejects.toThrow(
      'Errore di rete'
    );

    // Verifichiamo che NON sia stato marcato come revocato
    let status = await tokenManager.getTokenStatus(userId);
    expect(status.isRevoked).toBe(false);

    // Test 2: Errore 500 server (non è revoca)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    await expect(tokenManager.refreshAccessToken(userId)).rejects.toThrow(
      'Errore del server Google'
    );

    status = await tokenManager.getTokenStatus(userId);
    expect(status.isRevoked).toBe(false);

    // Test 3: Errore invalid_grant (È REVOCA!)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    );

    await expect(tokenManager.refreshAccessToken(userId)).rejects.toThrow(
      'Accesso revocato. Riconnetti il tuo account Google.'
    );

    status = await tokenManager.getTokenStatus(userId);
    expect(status.isRevoked).toBe(true);
  });
});
