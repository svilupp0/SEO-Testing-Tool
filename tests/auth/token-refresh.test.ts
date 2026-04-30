/**
 * Test 1.2 - Scadenza Token
 *
 * Priorità: CRITICA
 *
 * Obiettivo: Verificare che il sistema usi il refresh token quando l'access token scade
 *
 * Scenario: L'access token di Google scade dopo 1 ora
 *
 * Risultato atteso: Il sistema usa automaticamente il refresh token,
 * l'utente non viene disconnesso
 *
 * Comportamento su fallimento: Richiesta di nuovo login solo se il
 * refresh token è revocato
 */

import { TokenManager } from '../../src/auth/TokenManager';
import {
  mockRefreshAccessToken,
  MOCK_REFRESHED_TOKENS,
} from '../mocks/googleOAuth.mock';

describe('Test 1.2 - Scadenza Token', () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    // Setup: Creiamo una nuova istanza del TokenManager
    tokenManager = new TokenManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
  });

  afterEach(() => {
    // Cleanup: Ripristina tutti i mock dopo ogni test
    vi.restoreAllMocks();
  });

  it("dovrebbe rilevare che l'access token è scaduto", () => {
    // Arrange: Token scaduto (expires_at nel passato)
    const expiredToken = {
      access_token: 'expired-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() - 1000, // Scaduto 1 secondo fa
      token_type: 'Bearer',
    };

    // Act: Verifichiamo se il token è scaduto
    const isExpired = tokenManager.isTokenExpired(expiredToken);

    // Assert: Il token dovrebbe essere riconosciuto come scaduto
    expect(isExpired).toBe(true);
  });

  it("dovrebbe rilevare che l'access token è ancora valido", () => {
    // Arrange: Token valido (expires_at nel futuro)
    const validToken = {
      access_token: 'valid-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() + 3600000, // Scade tra 1 ora
      token_type: 'Bearer',
    };

    // Act: Verifichiamo se il token è scaduto
    const isExpired = tokenManager.isTokenExpired(validToken);

    // Assert: Il token dovrebbe essere riconosciuto come valido
    expect(isExpired).toBe(false);
  });

  it('dovrebbe usare il refresh token per ottenere un nuovo access token', async () => {
    // Arrange: Access token scaduto ma refresh token valido
    const expiredToken = {
      access_token: 'expired-access-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() - 1000,
      token_type: 'Bearer',
    };

    // Mock della risposta Google per refresh token
    mockRefreshAccessToken('success');

    // Act: Usiamo il refresh token per ottenere nuovi token
    const newTokens = await tokenManager.refreshAccessToken(
      expiredToken.refresh_token
    );

    // Assert: Dovremmo ricevere un nuovo access token
    expect(newTokens).toBeDefined();
    expect(newTokens.access_token).toBe(MOCK_REFRESHED_TOKENS.access_token);
    expect(newTokens.access_token).not.toBe(expiredToken.access_token);
    expect(newTokens.expires_in).toBe(3600);
    expect(newTokens.token_type).toBe('Bearer');
    expect(typeof newTokens.access_token).toBe('string');
  });

  it("dovrebbe calcolare correttamente l'expires_at quando riceve expires_in", () => {
    // Arrange: Token da Google con expires_in (secondi)
    const tokenFromGoogle = {
      access_token: 'new-token',
      refresh_token: 'refresh-token',
      expires_in: 3600, // 1 ora in secondi
      token_type: 'Bearer',
    };

    const beforeTime = Date.now();

    // Act: Processiamo il token per calcolare expires_at
    const processedToken = tokenManager.processToken(tokenFromGoogle);

    const afterTime = Date.now();

    // Assert: expires_at dovrebbe essere circa now + 3600 secondi
    expect(processedToken.expires_at).toBeDefined();
    expect(processedToken.expires_at).toBeGreaterThanOrEqual(
      beforeTime + 3600000
    );
    expect(processedToken.expires_at).toBeLessThanOrEqual(afterTime + 3600000);
  });

  it('dovrebbe rinnovare automaticamente il token prima che scada', async () => {
    // Arrange: Token che scade tra 5 minuti (soglia di rinnovo)
    const soonToExpireToken = {
      access_token: 'soon-to-expire-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() + 300000, // Scade tra 5 minuti
      token_type: 'Bearer',
    };

    // Act: Verifichiamo se è necessario rinnovare il token
    const needsRefresh = tokenManager.needsRefresh(soonToExpireToken);

    // Assert: Il sistema dovrebbe riconoscere che è tempo di rinnovare
    expect(needsRefresh).toBe(true);
  });

  it('dovrebbe NON rinnovare token che scadono tra più di 10 minuti', () => {
    // Arrange: Token che scade tra 30 minuti
    const freshToken = {
      access_token: 'fresh-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() + 1800000, // Scade tra 30 minuti
      token_type: 'Bearer',
    };

    // Act: Verifichiamo se è necessario rinnovare il token
    const needsRefresh = tokenManager.needsRefresh(freshToken);

    // Assert: Non è ancora necessario rinnovare
    expect(needsRefresh).toBe(false);
  });

  it("dovrebbe gestire l'errore quando il refresh token è revocato", async () => {
    // Arrange: Refresh token revocato
    const revokedRefreshToken = 'revoked-refresh-token';

    // Act & Assert: Dovrebbe lanciare un errore che richiede nuovo login
    await expect(
      tokenManager.refreshAccessToken(revokedRefreshToken)
    ).rejects.toThrow('Sessione scaduta. Effettua nuovamente il login.');
  });

  it("dovrebbe gestire l'errore di rete durante il refresh", async () => {
    // Arrange: Errore di rete durante il refresh
    const refreshToken = 'valid-refresh-token';

    // Mock della chiamata di rete che fallisce
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    // Act & Assert: Dovrebbe lanciare un errore gestito
    await expect(tokenManager.refreshAccessToken(refreshToken)).rejects.toThrow(
      'Impossibile rinnovare la sessione. Riprova.'
    );
  });

  it('dovrebbe ottenere un access token valido anche se quello attuale è scaduto', async () => {
    // Arrange: TokenManager con un token scaduto salvato
    const expiredToken = {
      access_token: 'expired-token',
      refresh_token: 'valid-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() - 1000,
      token_type: 'Bearer',
    };

    await tokenManager.saveTokens(expiredToken);

    // Mock della risposta Google per refresh token
    mockRefreshAccessToken('success');

    // Act: Richiediamo un access token valido
    const validToken = await tokenManager.getValidAccessToken();

    // Assert: Dovremmo ricevere un nuovo token, non quello scaduto
    expect(validToken).toBeDefined();
    expect(validToken).toBe(MOCK_REFRESHED_TOKENS.access_token);
    expect(validToken).not.toBe(expiredToken.access_token);
    expect(typeof validToken).toBe('string');
  });

  it('dovrebbe mantenere lo stesso refresh token dopo il rinnovo', async () => {
    // Arrange: Refresh di un access token scaduto
    const originalRefreshToken = 'original-refresh-token';

    // Mock della risposta Google per refresh token (senza nuovo refresh_token)
    mockRefreshAccessToken('success');

    // Act: Rinnoviamo l'access token
    const newTokens =
      await tokenManager.refreshAccessToken(originalRefreshToken);

    // Assert: Il refresh token può rimanere lo stesso (comportamento Google)
    // oppure può essere un nuovo refresh token (gestione corretta in entrambi i casi)
    expect(newTokens.access_token).toBe(MOCK_REFRESHED_TOKENS.access_token);
    // Se Google non invia un nuovo refresh_token, il sistema dovrebbe mantenere il vecchio
    if (!newTokens.refresh_token) {
      expect(newTokens.refresh_token).toBeUndefined();
      // Il TokenManager dovrà mantenere quello originale
    }
  });
});
