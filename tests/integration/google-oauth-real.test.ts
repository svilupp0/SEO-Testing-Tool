/**
 * Test di Integrazione con Google OAuth (credenziali reali)
 *
 * Questi test usano le credenziali reali dal file .env
 * Non eseguono chiamate API complete (richiederebbero browser per OAuth flow)
 * ma verificano che la configurazione sia corretta
 */

import { getTestCredentials } from '../../src/config/env';
import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';

describe('Google OAuth - Test Integrazione Reale', () => {
  it('dovrebbe caricare le credenziali dal file .env', () => {
    const config = getTestCredentials();

    expect(config.clientId).toBeDefined();
    expect(config.clientId).toContain('apps.googleusercontent.com');
    expect(config.clientSecret).toBeDefined();
    expect(config.clientSecret).toMatch(/^GOCSPX-/); // Google client secrets iniziano con GOCSPX-
    expect(config.redirectUri).toBeDefined();
  });

  it('dovrebbe generare URL di autenticazione valido con credenziali reali', () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    const authUrl = service.getAuthorizationUrl(config.scopes);

    // Verifica che l'URL contenga le credenziali reali
    expect(authUrl).toContain('accounts.google.com/o/oauth2');
    expect(authUrl).toContain(config.clientId);
    expect(authUrl).toContain('webmasters.readonly');
    expect(authUrl).toContain('userinfo.email');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
    expect(authUrl).toContain('access_type=offline'); // Per ottenere refresh_token

    console.log('\n✅ URL di autenticazione generato:');
    console.log(authUrl);
    console.log('\n📋 Per testare OAuth flow completo:');
    console.log('1. Visita questo URL nel browser');
    console.log('2. Autorizza l\'applicazione');
    console.log('3. Copia il "code" dal redirect URL');
    console.log('4. Usa il code nel test successivo (attualmente skipped)\n');
  });

  // ⚠️ QUESTO TEST RICHIEDE INTERAZIONE MANUALE
  // Per eseguirlo:
  // 1. Rimuovi .skip
  // 2. Visita l'authUrl generato dal test precedente
  // 3. Autorizza l'app
  // 4. Copia il "code" dal redirect e sostituiscilo sotto
  it.skip('dovrebbe scambiare authorization code con token (TEST MANUALE)', async () => {
    const config = getTestCredentials();
    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    // ⚠️ SOSTITUISCI CON UN CODE REALE OTTENUTO DA GOOGLE
    // Il code scade dopo pochi minuti, quindi deve essere fresco
    const authorizationCode = 'PASTE_YOUR_AUTHORIZATION_CODE_HERE';

    try {
      const tokens = await service.exchangeCodeForTokens(authorizationCode);

      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expires_in).toBeGreaterThan(0);

      console.log('\n✅ Token ottenuti con successo!');
      console.log('Access Token:', tokens.access_token.substring(0, 20) + '...');
      console.log('Refresh Token:', tokens.refresh_token ? 'Present' : 'Missing');
      console.log('Expires In:', tokens.expires_in, 'secondi\n');
    } catch (error) {
      console.error('\n❌ Errore durante lo scambio del code:');
      console.error(error);
      throw error;
    }
  }, 30000); // Timeout 30 secondi per chiamate API reali

  // ⚠️ QUESTO TEST RICHIEDE UN ACCESS TOKEN VALIDO
  it.skip('dovrebbe recuperare informazioni utente (TEST MANUALE)', async () => {
    const config = getTestCredentials();
    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    // ⚠️ SOSTITUISCI CON UN ACCESS TOKEN REALE
    const accessToken = 'PASTE_YOUR_ACCESS_TOKEN_HERE';

    try {
      const userInfo = await service.getUserInfo(accessToken);

      expect(userInfo.email).toBeDefined();
      expect(userInfo.email).toContain('@');

      console.log('\n✅ Informazioni utente recuperate:');
      console.log('Email:', userInfo.email);
      console.log('Email Verified:', userInfo.verified_email);
      console.log('Picture:', userInfo.picture ? 'Present' : 'N/A');
      console.log();
    } catch (error) {
      console.error('\n❌ Errore durante il recupero delle informazioni utente:');
      console.error(error);
      throw error;
    }
  }, 30000);
});

describe('Google OAuth - Verifica Configurazione', () => {
  it('dovrebbe avere tutti i parametri necessari per OAuth2', () => {
    const config = getTestCredentials();

    // Verifica formato client_id
    expect(config.clientId).toMatch(/^\d+-[\w]+\.apps\.googleusercontent\.com$/);

    // Verifica formato client_secret
    expect(config.clientSecret).toMatch(/^GOCSPX-[\w-]+$/);

    // Verifica redirect_uri
    expect(config.redirectUri).toBeTruthy();

    // Verifica URIs Google
    expect(config.authUri).toBe('https://accounts.google.com/o/oauth2/auth');
    expect(config.tokenUri).toBe('https://oauth2.googleapis.com/token');

    // Verifica scopes
    expect(config.scopes).toContain('https://www.googleapis.com/auth/webmasters.readonly');
    expect(config.scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
  });

  it('dovrebbe usare il project_id corretto', () => {
    const config = getTestCredentials();

    // Il client_id contiene il project number
    // Formato: {project-number}-{random}.apps.googleusercontent.com
    expect(config.clientId).toContain('548098099543'); // Project number from client_secret file
  });
});
