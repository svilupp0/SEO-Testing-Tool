/**
 * Test Integrazione Completa - OAuth2 Flow Reale
 *
 * ⚠️ ATTENZIONE: Questi test fanno chiamate REALI alle API Google
 *
 * Prerequisiti:
 * 1. File .env configurato con credenziali Google valide
 * 2. Progetto Google Cloud con OAuth2 abilitato
 * 3. Redirect URI configurato in Google Cloud Console
 *
 * Come eseguire:
 * npm test -- full-oauth-flow --run
 */

import { getTestCredentials } from '../../src/config/env';
import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';
import { TokenManager } from '../../src/auth/TokenManager';

describe('🔐 Test 1.1 & 1.2 - OAuth2 Flow Completo (REALE)', () => {

  it('STEP 1: Dovrebbe generare URL di autorizzazione REALE', () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    const authUrl = service.getAuthorizationUrl(config.scopes);

    console.log('\n' + '='.repeat(80));
    console.log('🔐 OAUTH2 FLOW - STEP 1: AUTORIZZAZIONE');
    console.log('='.repeat(80));
    console.log('\n✅ URL di autenticazione generato con successo!\n');
    console.log('📋 ISTRUZIONI:');
    console.log('1. Copia questo URL e aprilo nel browser:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Accedi con il tuo account Google');
    console.log('3. Autorizza l\'applicazione "seo-testing-tool-dev"');
    console.log('4. Google ti reindirizzerà a: ' + config.redirectUri);
    console.log('5. Copia il parametro "code" dall\'URL di redirect');
    console.log('   Esempio: http://localhost?code=4/0A... ← copia la parte dopo "code="');
    console.log('\n' + '='.repeat(80));
    console.log('⏭️  DOPO aver ottenuto il CODE, esegui il test successivo (STEP 2)');
    console.log('='.repeat(80) + '\n');

    // Verifica che l'URL sia valido
    expect(authUrl).toContain('accounts.google.com/o/oauth2');
    expect(authUrl).toContain(config.clientId);
    expect(authUrl).toContain('webmasters.readonly');
    expect(authUrl).toContain('access_type=offline');
  });

  // ✅ AUTHORIZATION CODE OTTENUTO DA STEP 1
  it('STEP 2: Dovrebbe scambiare CODE con TOKEN (inserisci code da STEP 1)', async () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    console.log('\n' + '='.repeat(80));
    console.log('🔐 OAUTH2 FLOW - STEP 2: SCAMBIO CODE → TOKEN');
    console.log('='.repeat(80) + '\n');

    // ✅ CODE OTTENUTO DA GOOGLE (STEP 1)
    const authorizationCode = '4/0ASc3gC2aNAmMgIuVN0ie5iS0OY8yjbXEowr6VD_XYHAkXiVKEbLylL1zcSWJlyo-J30jWw';

    if (authorizationCode === 'PASTE_YOUR_AUTHORIZATION_CODE_HERE') {
      console.log('❌ ERRORE: Devi sostituire "PASTE_YOUR_AUTHORIZATION_CODE_HERE"');
      console.log('   con il code reale ottenuto da Google in STEP 1!\n');
      throw new Error('Authorization code non configurato');
    }

    console.log('📡 Chiamata REALE a Google OAuth API...\n');

    try {
      // ✅ CHIAMATA REALE ALL'API GOOGLE
      const tokens = await service.exchangeCodeForTokens(authorizationCode);

      console.log('✅ TOKEN OTTENUTI CON SUCCESSO!\n');
      console.log('📊 Dettagli Token:');
      console.log('   Access Token: ' + tokens.access_token.substring(0, 30) + '...');
      console.log('   Refresh Token: ' + (tokens.refresh_token ? 'Presente ✅' : 'Assente ❌'));
      console.log('   Scade tra: ' + tokens.expires_in + ' secondi (' + (tokens.expires_in / 60) + ' minuti)');
      console.log('   Token Type: ' + tokens.token_type);

      // Verifica struttura token
      expect(tokens.access_token).toBeDefined();
      expect(tokens.access_token).toMatch(/^ya29\./); // Google access tokens iniziano con ya29.
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expires_in).toBeGreaterThan(0);
      expect(tokens.token_type).toBe('Bearer');

      console.log('\n' + '='.repeat(80));
      console.log('⏭️  SALVA questi token per usarli in STEP 3 (User Info) e STEP 4 (GSC)');
      console.log('='.repeat(80));
      console.log('\n💾 Access Token (copia per STEP 3):');
      console.log(tokens.access_token);
      console.log('\n💾 Refresh Token (copia per STEP 4):');
      console.log(tokens.refresh_token);
      console.log('\n' + '='.repeat(80) + '\n');

    } catch (error: any) {
      console.error('\n❌ ERRORE durante lo scambio del code:');
      console.error('   ' + error.message);

      if (error.message.includes('invalid_grant')) {
        console.error('\n💡 POSSIBILI CAUSE:');
        console.error('   - Il code è scaduto (max 10 minuti di validità)');
        console.error('   - Il code è già stato usato (può essere usato una sola volta)');
        console.error('   - Il redirect_uri non corrisponde a quello configurato in Google Cloud');
        console.error('\n🔄 SOLUZIONE: Ripeti STEP 1 per ottenere un nuovo code\n');
      }

      throw error;
    }
  }, 30000);

  // ✅ ACCESS TOKEN OTTENUTO DA STEP 2
  it('STEP 3: Dovrebbe recuperare info utente (inserisci access token da STEP 2)', async () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    console.log('\n' + '='.repeat(80));
    console.log('👤 TEST 1.1 - RECUPERO INFORMAZIONI UTENTE (REALE)');
    console.log('='.repeat(80) + '\n');

    // ✅ ACCESS TOKEN OTTENUTO DA STEP 2
    const accessToken = 'ya29.a0AUMWg_LYlkDUtaMWjlvxw_uO3NWM0ibe9jqaLnVCx_6_Q75xvQOzd6RcIXFh8jIkleCH7zn9GzkqW4fdPug_gFlN4KfLEREy15vj2EC6EBNiDXfGbLt-Vw7fsINbVEU0V1l4nJ4xd_YVjxl5qdNvJ3-PQYyFCmkQZVxstCRdwypoUXFLGsmeNn0UkpUbHQEDxDwNoAYaCgYKAdwSARASFQHGX2MigL499xlOI73lHqLhNpZaWQ0206';

    if (accessToken === 'PASTE_YOUR_ACCESS_TOKEN_HERE') {
      console.log('❌ ERRORE: Devi sostituire "PASTE_YOUR_ACCESS_TOKEN_HERE"');
      console.log('   con l\'access token reale ottenuto in STEP 2!\n');
      throw new Error('Access token non configurato');
    }

    console.log('📡 Chiamata REALE a Google UserInfo API...\n');

    try {
      // ✅ CHIAMATA REALE ALL'API GOOGLE
      const userInfo = await service.getUserInfo(accessToken);

      console.log('✅ INFORMAZIONI UTENTE RECUPERATE!\n');
      console.log('📊 Dettagli Utente:');
      console.log('   Email: ' + userInfo.email);
      console.log('   Email Verificata: ' + (userInfo.verified_email ? 'Sì ✅' : 'No ❌'));
      console.log('   User ID: ' + userInfo.id);

      // Verifica dati utente
      expect(userInfo.email).toBeDefined();
      expect(userInfo.email).toContain('@');
      expect(userInfo.verified_email).toBe(true);
      expect(userInfo.id).toBeDefined();

      console.log('\n✅ TEST 1.1 COMPLETATO CON SUCCESSO!\n');
      console.log('='.repeat(80) + '\n');

    } catch (error: any) {
      console.error('\n❌ ERRORE durante il recupero info utente:');
      console.error('   ' + error.message);

      if (error.message.includes('unauthorized') || error.message.includes('401')) {
        console.error('\n💡 POSSIBILI CAUSE:');
        console.error('   - Il token è scaduto (validità 1 ora)');
        console.error('   - Il token non è valido');
        console.error('\n🔄 SOLUZIONE: Ripeti STEP 1 e STEP 2 per ottenere un nuovo token\n');
      }

      throw error;
    }
  }, 30000);

  // ✅ REFRESH TOKEN OTTENUTO DA STEP 2
  it('STEP 4: Dovrebbe rinnovare token con refresh token (TEST 1.2)', async () => {
    const config = getTestCredentials();

    const tokenManager = new TokenManager({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    console.log('\n' + '='.repeat(80));
    console.log('🔄 TEST 1.2 - REFRESH TOKEN (REALE)');
    console.log('='.repeat(80) + '\n');

    // ✅ REFRESH TOKEN OTTENUTO DA STEP 2
    const refreshToken = '1//03GJv1csMUPliCgYIARAAGAMSNwF-L9Irk119kuntq9Au6Sbc9CPqXCFafvpxkMxCl_IIEAapEBhrzbkVc_oIyJLYYmuw2VOAUXE';

    if (refreshToken === 'PASTE_YOUR_REFRESH_TOKEN_HERE') {
      console.log('❌ ERRORE: Devi sostituire "PASTE_YOUR_REFRESH_TOKEN_HERE"');
      console.log('   con il refresh token reale ottenuto in STEP 2!\n');
      throw new Error('Refresh token non configurato');
    }

    console.log('📡 Chiamata REALE a Google Token Refresh API...\n');

    try {
      // ✅ CHIAMATA REALE ALL'API GOOGLE
      const newTokens = await tokenManager.refreshAccessToken(refreshToken);

      console.log('✅ TOKEN RINNOVATI CON SUCCESSO!\n');
      console.log('📊 Nuovi Token:');
      console.log('   Nuovo Access Token: ' + newTokens.access_token.substring(0, 30) + '...');
      console.log('   Scade tra: ' + newTokens.expires_in + ' secondi');
      console.log('   Nuovo Refresh Token: ' + (newTokens.refresh_token ? 'Presente ✅' : 'Mantenuto precedente ✅'));

      // Verifica nuovi token
      expect(newTokens.access_token).toBeDefined();
      expect(newTokens.access_token).toMatch(/^ya29\./);
      expect(newTokens.expires_in).toBeGreaterThan(0);
      expect(newTokens.token_type).toBe('Bearer');

      console.log('\n✅ TEST 1.2 COMPLETATO CON SUCCESSO!');
      console.log('   Il sistema è in grado di rinnovare automaticamente i token scaduti!\n');
      console.log('='.repeat(80) + '\n');

    } catch (error: any) {
      console.error('\n❌ ERRORE durante il refresh del token:');
      console.error('   ' + error.message);

      if (error.message.includes('invalid_grant')) {
        console.error('\n💡 POSSIBILI CAUSE:');
        console.error('   - Il refresh token è stato revocato');
        console.error('   - Il refresh token non è valido');
        console.error('\n🔄 SOLUZIONE: Ripeti STEP 1 e STEP 2 per ottenere nuovi token\n');
      }

      throw error;
    }
  }, 30000);
});

describe('📊 Test 2.x - Ingestione Dati GSC (REALE)', () => {

  it.skip('STEP 5: Dovrebbe recuperare dati GSC reali (TEST 2.1-2.4)', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST 2 - INGESTIONE DATI DA GOOGLE SEARCH CONSOLE (REALE)');
    console.log('='.repeat(80) + '\n');

    // ⚠️ INCOLLA QUI L'ACCESS TOKEN OTTENUTO DA STEP 2 o STEP 4
    const accessToken = 'PASTE_YOUR_ACCESS_TOKEN_HERE';

    // ⚠️ INSERISCI QUI L'URL DELLA TUA PROPRIETÀ GSC
    // Esempio: 'https://www.example.com/' oppure 'sc-domain:example.com'
    const propertyUrl = 'PASTE_YOUR_GSC_PROPERTY_URL_HERE';

    if (accessToken === 'PASTE_YOUR_ACCESS_TOKEN_HERE' ||
        propertyUrl === 'PASTE_YOUR_GSC_PROPERTY_URL_HERE') {
      console.log('❌ ERRORE: Devi configurare:');
      console.log('   1. accessToken (da STEP 2 o STEP 4)');
      console.log('   2. propertyUrl (URL della tua proprietà GSC)\n');
      throw new Error('Access token o property URL non configurati');
    }

    console.log('📡 Chiamata REALE a Google Search Console API...');
    console.log('   Proprietà: ' + propertyUrl);
    console.log('   Periodo: ultimi 7 giorni\n');

    // Qui implementeremo le chiamate GSC quando avremo i servizi pronti
    console.log('⚠️  Implementazione GSC data fetcher in arrivo...\n');
    console.log('='.repeat(80) + '\n');
  }, 60000);
});
