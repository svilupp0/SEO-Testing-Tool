/**
 * Test Integrazione Completa - OAuth2 Flow Reale
 *
 * ATTENZIONE: Questi test fanno chiamate REALI alle API Google
 *
 * Prerequisiti:
 * 1. File .env configurato con credenziali Google valide
 * 2. Progetto Google Cloud con OAuth2 abilitato
 * 3. Redirect URI configurato in Google Cloud Console
 *
 * Come eseguire i test manuali (STEP 2-4):
 * 1. Esegui STEP 1 per generare l'URL di autorizzazione
 * 2. Imposta le variabili d'ambiente con i token ottenuti:
 *    GOOGLE_AUTH_CODE=4/0A...    (da STEP 1)
 *    GOOGLE_ACCESS_TOKEN=ya29... (da STEP 2)
 *    GOOGLE_REFRESH_TOKEN=1//... (da STEP 2)
 * 3. Esegui: npm test -- full-oauth-flow --run
 *
 * MAI inserire token/code direttamente nel codice sorgente!
 */

import { getTestCredentials } from '../../src/config/env';
import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';
import { TokenManager } from '../../src/auth/TokenManager';

// Token reali da variabili d'ambiente (MAI hardcoded nel codice)
const GOOGLE_AUTH_CODE = process.env.GOOGLE_AUTH_CODE || '';
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';

describe('Test 1.1 & 1.2 - OAuth2 Flow Completo (REALE)', () => {
  it('STEP 1: Dovrebbe generare URL di autorizzazione REALE', () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });

    const authUrl = service.getAuthorizationUrl(config.scopes);

    console.log('\n' + '='.repeat(80));
    console.log('OAUTH2 FLOW - STEP 1: AUTORIZZAZIONE');
    console.log('='.repeat(80));
    console.log('\nURL di autenticazione generato con successo!\n');
    console.log('ISTRUZIONI:');
    console.log('1. Copia questo URL e aprilo nel browser:');
    console.log('\n' + authUrl + '\n');
    console.log('2. Accedi con il tuo account Google');
    console.log('3. Autorizza l\'applicazione "seo-testing-tool-dev"');
    console.log('4. Google ti reindirizzerà a: ' + config.redirectUri);
    console.log('5. Copia il parametro "code" dall\'URL di redirect');
    console.log(
      '   Esempio: http://localhost?code=4/0A... <- copia la parte dopo "code="'
    );
    console.log('\n6. Imposta: GOOGLE_AUTH_CODE=<il-tuo-code> nel .env');
    console.log('='.repeat(80) + '\n');

    // Verifica che l'URL sia valido
    expect(authUrl).toContain('accounts.google.com/o/oauth2');
    expect(authUrl).toContain(config.clientId);
    expect(authUrl).toContain('webmasters.readonly');
    expect(authUrl).toContain('access_type=offline');
  });

  it.skipIf(!GOOGLE_AUTH_CODE)(
    'STEP 2: Dovrebbe scambiare CODE con TOKEN',
    async () => {
      const config = getTestCredentials();

      const service = new GoogleOAuthService({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
      });

      console.log('\n' + '='.repeat(80));
      console.log('OAUTH2 FLOW - STEP 2: SCAMBIO CODE -> TOKEN');
      console.log('='.repeat(80) + '\n');
      console.log('Chiamata REALE a Google OAuth API...\n');

      try {
        const tokens = await service.exchangeCodeForTokens(GOOGLE_AUTH_CODE);

        console.log('TOKEN OTTENUTI CON SUCCESSO!\n');
        console.log('Dettagli Token:');
        console.log(
          '   Access Token: ' + tokens.access_token.substring(0, 30) + '...'
        );
        console.log(
          '   Refresh Token: ' + (tokens.refresh_token ? 'Presente' : 'Assente')
        );
        console.log(
          '   Scade tra: ' +
            tokens.expires_in +
            ' secondi (' +
            tokens.expires_in / 60 +
            ' minuti)'
        );
        console.log('   Token Type: ' + tokens.token_type);

        expect(tokens.access_token).toBeDefined();
        expect(tokens.access_token).toMatch(/^ya29\./);
        expect(tokens.refresh_token).toBeDefined();
        expect(tokens.expires_in).toBeGreaterThan(0);
        expect(tokens.token_type).toBe('Bearer');

        console.log('\nSALVA questi token nel .env:');
        console.log('   GOOGLE_ACCESS_TOKEN=' + tokens.access_token);
        console.log('   GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('='.repeat(80) + '\n');
      } catch (error: any) {
        console.error('\nERRORE durante lo scambio del code:');
        console.error('   ' + error.message);

        if (error.message.includes('invalid_grant')) {
          console.error('\nPOSSIBILI CAUSE:');
          console.error('   - Il code e scaduto (max 10 minuti di validita)');
          console.error('   - Il code e gia stato usato (monouso)');
          console.error('   - Il redirect_uri non corrisponde');
          console.error(
            '\nSOLUZIONE: Ripeti STEP 1 per ottenere un nuovo code\n'
          );
        }

        throw error;
      }
    },
    30000
  );

  it.skipIf(!GOOGLE_ACCESS_TOKEN)(
    'STEP 3: Dovrebbe recuperare info utente',
    async () => {
      const config = getTestCredentials();

      const service = new GoogleOAuthService({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
      });

      console.log('\n' + '='.repeat(80));
      console.log('TEST 1.1 - RECUPERO INFORMAZIONI UTENTE (REALE)');
      console.log('='.repeat(80) + '\n');
      console.log('Chiamata REALE a Google UserInfo API...\n');

      try {
        const userInfo = await service.getUserInfo(GOOGLE_ACCESS_TOKEN);

        console.log('INFORMAZIONI UTENTE RECUPERATE!\n');
        console.log('Dettagli Utente:');
        console.log('   Email: ' + userInfo.email);
        console.log(
          '   Email Verificata: ' + (userInfo.verified_email ? 'Si' : 'No')
        );
        console.log('   User ID: ' + userInfo.id);

        expect(userInfo.email).toBeDefined();
        expect(userInfo.email).toContain('@');
        expect(userInfo.verified_email).toBe(true);
        expect(userInfo.id).toBeDefined();

        console.log('\nTEST 1.1 COMPLETATO CON SUCCESSO!\n');
        console.log('='.repeat(80) + '\n');
      } catch (error: any) {
        console.error('\nERRORE durante il recupero info utente:');
        console.error('   ' + error.message);

        if (
          error.message.includes('unauthorized') ||
          error.message.includes('401')
        ) {
          console.error('\nPOSSIBILI CAUSE:');
          console.error('   - Il token e scaduto (validita 1 ora)');
          console.error('   - Il token non e valido');
          console.error(
            '\nSOLUZIONE: Ripeti STEP 1 e STEP 2 per ottenere un nuovo token\n'
          );
        }

        throw error;
      }
    },
    30000
  );

  it.skipIf(!GOOGLE_REFRESH_TOKEN)(
    'STEP 4: Dovrebbe rinnovare token con refresh token (TEST 1.2)',
    async () => {
      const config = getTestCredentials();

      const tokenManager = new TokenManager({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      });

      console.log('\n' + '='.repeat(80));
      console.log('TEST 1.2 - REFRESH TOKEN (REALE)');
      console.log('='.repeat(80) + '\n');
      console.log('Chiamata REALE a Google Token Refresh API...\n');

      try {
        const newTokens =
          await tokenManager.refreshAccessToken(GOOGLE_REFRESH_TOKEN);

        console.log('TOKEN RINNOVATI CON SUCCESSO!\n');
        console.log('Nuovi Token:');
        console.log(
          '   Nuovo Access Token: ' +
            newTokens.access_token.substring(0, 30) +
            '...'
        );
        console.log('   Scade tra: ' + newTokens.expires_in + ' secondi');
        console.log(
          '   Nuovo Refresh Token: ' +
            (newTokens.refresh_token ? 'Presente' : 'Mantenuto precedente')
        );

        expect(newTokens.access_token).toBeDefined();
        expect(newTokens.access_token).toMatch(/^ya29\./);
        expect(newTokens.expires_in).toBeGreaterThan(0);
        expect(newTokens.token_type).toBe('Bearer');

        console.log('\nTEST 1.2 COMPLETATO CON SUCCESSO!');
        console.log('   Il sistema rinnova automaticamente i token scaduti!\n');
        console.log('='.repeat(80) + '\n');
      } catch (error: any) {
        console.error('\nERRORE durante il refresh del token:');
        console.error('   ' + error.message);

        if (error.message.includes('invalid_grant')) {
          console.error('\nPOSSIBILI CAUSE:');
          console.error('   - Il refresh token e stato revocato');
          console.error('   - Il refresh token non e valido');
          console.error(
            '\nSOLUZIONE: Ripeti STEP 1 e STEP 2 per ottenere nuovi token\n'
          );
        }

        throw error;
      }
    },
    30000
  );
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

    if (
      accessToken === 'PASTE_YOUR_ACCESS_TOKEN_HERE' ||
      propertyUrl === 'PASTE_YOUR_GSC_PROPERTY_URL_HERE'
    ) {
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
