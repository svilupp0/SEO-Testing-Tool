/**
 * Test 1.1 - Login Google OAuth2
 *
 * Priorità: CRITICA
 *
 * Obiettivo: Verificare che l'utente riesca a collegarsi tramite OAuth2
 *
 * Scenario: L'utente clicca su "Login con Google"
 *
 * Risultato atteso: L'utente viene reindirizzato a Google, autorizza l'app,
 * e torna autenticato
 *
 * Comportamento su fallimento: Messaggio di errore chiaro:
 * "Impossibile connettersi a Google. Riprova."
 */

import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';
import {
  mockExchangeCodeForTokens,
  mockGetUserInfo,
  MOCK_TOKENS,
  MOCK_USER_INFO,
} from '../mocks/googleOAuth.mock';

describe('Test 1.1 - Login Google OAuth2', () => {
  let authService: GoogleOAuthService;

  beforeEach(() => {
    // Setup: Creiamo una nuova istanza del servizio OAuth prima di ogni test
    authService = new GoogleOAuthService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/auth/callback',
    });
  });

  afterEach(() => {
    // Cleanup: Ripristina tutti i mock dopo ogni test
    vi.restoreAllMocks();
  });

  it('dovrebbe generare un URL di autenticazione Google valido', () => {
    // Arrange: Prepariamo i parametri necessari
    const scopes = [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    // Act: Generiamo l'URL di autenticazione
    const authUrl = authService.getAuthorizationUrl(scopes);

    // Assert: Verifichiamo che l'URL contenga i parametri OAuth2 corretti
    expect(authUrl).toBeDefined();
    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('client_id=test-client-id');
    expect(authUrl).toContain('redirect_uri=');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('scope=');
    expect(authUrl).toContain('access_type=offline');
    expect(authUrl).toContain('state='); // CSRF protection
  });

  it('dovrebbe scambiare il codice di autorizzazione con i token di accesso', async () => {
    // Arrange: Simuliamo il codice ricevuto da Google dopo l'autorizzazione
    const authorizationCode = 'test-authorization-code-from-google';

    // Mock della risposta Google
    mockExchangeCodeForTokens('success');

    // Act: Scambiamo il codice con i token
    const tokens = await authService.exchangeCodeForTokens(authorizationCode);

    // Assert: Verifichiamo che riceviamo access_token e refresh_token
    expect(tokens).toBeDefined();
    expect(tokens.access_token).toBe(MOCK_TOKENS.access_token);
    expect(tokens.refresh_token).toBe(MOCK_TOKENS.refresh_token);
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.token_type).toBe('Bearer');
    expect(typeof tokens.access_token).toBe('string');
    expect(typeof tokens.refresh_token).toBe('string');
  });

  it("dovrebbe recuperare le informazioni dell'utente autenticato", async () => {
    // Arrange: Simuliamo un utente autenticato con un access_token
    const accessToken = 'valid-access-token';

    // Mock della risposta Google
    mockGetUserInfo('success');

    // Act: Recuperiamo le informazioni dell'utente
    const userInfo = await authService.getUserInfo(accessToken);

    // Assert: Verifichiamo che riceviamo i dati dell'utente
    expect(userInfo).toBeDefined();
    expect(userInfo.email).toBe(MOCK_USER_INFO.email);
    expect(userInfo.verified_email).toBe(true);
    expect(userInfo.id).toBeDefined();
    expect(typeof userInfo.email).toBe('string');
    expect(userInfo.email).toContain('@');
  });

  it('dovrebbe gestire errori durante lo scambio del codice', async () => {
    // Arrange: Codice di autorizzazione non valido
    const invalidCode = 'invalid-code';

    // Act & Assert: Verifichiamo che venga lanciato un errore con messaggio chiaro
    await expect(
      authService.exchangeCodeForTokens(invalidCode)
    ).rejects.toThrow('Impossibile connettersi a Google. Riprova.');
  });

  it("dovrebbe gestire errori di rete durante l'autenticazione", async () => {
    // Arrange: Simuliamo un errore di rete
    const authorizationCode = 'test-code';

    // Mock della chiamata di rete che fallisce
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    // Act & Assert: Verifichiamo che l'errore venga gestito correttamente
    await expect(
      authService.exchangeCodeForTokens(authorizationCode)
    ).rejects.toThrow('Impossibile connettersi a Google. Riprova.');
  });

  it('dovrebbe includere un parametro state per protezione CSRF', () => {
    // Arrange
    const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];

    // Act: Generiamo due URL in momenti diversi
    const authUrl1 = authService.getAuthorizationUrl(scopes);
    const authUrl2 = authService.getAuthorizationUrl(scopes);

    // Assert: Ogni URL deve avere un parametro state unico
    const state1 = new URL(authUrl1).searchParams.get('state');
    const state2 = new URL(authUrl2).searchParams.get('state');

    expect(state1).toBeDefined();
    expect(state2).toBeDefined();
    expect(state1).not.toBe(state2); // I valori devono essere diversi
    expect(state1?.length).toBeGreaterThan(10); // Deve essere sufficientemente lungo
  });

  it('dovrebbe validare il parametro state nel callback', async () => {
    // Arrange: Generiamo un URL con state
    const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];
    const authUrl = authService.getAuthorizationUrl(scopes);
    const expectedState = new URL(authUrl).searchParams.get('state');

    // Act & Assert: State corretto dovrebbe essere accettato
    expect(() => {
      authService.validateState(expectedState!);
    }).not.toThrow();

    // Assert: State errato dovrebbe essere rifiutato
    expect(() => {
      authService.validateState('wrong-state-value');
    }).toThrow('Impossibile connettersi a Google. Riprova.');
  });
});
