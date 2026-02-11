# 🔐 Setup Credenziali Google OAuth2

Guida completa per configurare le credenziali Google OAuth2 in modo sicuro.

---

## ✅ Cosa abbiamo fatto

1. **Protetto le credenziali** aggiungendo `client_secret_*.json` al `.gitignore`
2. **Creato file `.env`** per variabili d'ambiente sicure
3. **Installato `dotenv`** per caricare le credenziali
4. **Configurato Vitest** per caricare `.env` prima dei test
5. **Creato helper** in `src/config/env.ts` per accedere alle credenziali

---

## 📋 File Creati

```
seo-testing-tool/
├── .env                    ← Credenziali reali (GIT IGNORATO!)
├── .env.example            ← Template per altri sviluppatori
├── src/config/env.ts       ← Helper per caricare credenziali
└── tests/setup.ts          ← Setup Vitest (carica .env)
```

---

## 🔒 Sicurezza

### ⚠️ File da NON committare MAI:
- ❌ `client_secret_*.json` - Contiene client_secret
- ❌ `.env` - Contiene credenziali reali
- ❌ `token.json` - Contiene token di accesso

### ✅ File da committare:
- ✅ `.env.example` - Template senza credenziali reali
- ✅ `.gitignore` - Protegge i file sensibili
- ✅ `src/config/env.ts` - Codice per caricare credenziali

---

## 🚀 Come Usare le Credenziali

### Opzione 1: Variabili d'ambiente (CONSIGLIATO)

Il file `.env` è già configurato con le tue credenziali:

```env
GOOGLE_CLIENT_ID=548098099543-1et8nm1hm466tf7hcmqntjd07mk81olq.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=http://localhost
```

**Nei test:**
```typescript
import { getGoogleOAuthConfig } from '../src/config/env';

describe('Test con credenziali reali', () => {
  it('dovrebbe autenticarsi con Google', async () => {
    const config = getGoogleOAuthConfig();

    const service = new GoogleOAuthService(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    // Test con API reale
    const authUrl = service.generateAuthUrl();
    expect(authUrl).toContain(config.clientId);
  });
});
```

### Opzione 2: File client_secret.json (Fallback)

Se `.env` non è configurato, il sistema cerca automaticamente il file `client_secret_*.json`:

```typescript
import { getTestCredentials } from '../src/config/env';

const config = getTestCredentials(); // Carica da .env O da client_secret file
```

---

## 🧪 Esempio: Test di Integrazione

Crea `tests/integration/google-oauth-real.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getTestCredentials } from '../../src/config/env';
import { GoogleOAuthService } from '../../src/auth/GoogleOAuthService';

describe('Google OAuth - Test Integrazione Reale', () => {
  it('dovrebbe generare URL di autenticazione valido', () => {
    const config = getTestCredentials();

    const service = new GoogleOAuthService(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    const authUrl = service.generateAuthUrl();

    expect(authUrl).toContain('accounts.google.com');
    expect(authUrl).toContain(config.clientId);
    expect(authUrl).toContain('webmasters.readonly');
  });

  // ⚠️ Questo test richiede un authorization code valido
  // Puoi ottenerlo visitando authUrl e copiando il code dal redirect
  it.skip('dovrebbe scambiare code con token (manuale)', async () => {
    const config = getTestCredentials();
    const service = new GoogleOAuthService(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    // Sostituisci con un code reale ottenuto da Google
    const authCode = 'PASTE_YOUR_AUTH_CODE_HERE';

    const tokens = await service.exchangeCodeForTokens(authCode);

    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
  });
});
```

---

## 🔄 Workflow Test

### Test Unit (con Mock) - Default
```bash
npm test
```
- Usa mock delle API Google
- Veloce, offline, deterministico
- Per sviluppo TDD quotidiano

### Test Integrazione (con credenziali reali) - Manuale
```bash
npm test -- integration
```
- Usa credenziali reali da `.env`
- Richiede connessione internet
- Per verificare integrazione con Google

---

## 🛠️ Setup per Altri Sviluppatori

Se condividi il progetto con altri sviluppatori:

1. **Loro creano** il proprio progetto su Google Cloud Console
2. **Scaricano** il loro `client_secret_*.json`
3. **Copiano** `.env.example` in `.env`
4. **Inseriscono** le loro credenziali nel `.env`

```bash
cp .env.example .env
# Poi modificano .env con le loro credenziali
```

---

## 🔐 Revoca Credenziali Compromesse

Se per errore hai committato le credenziali in git:

1. **Vai su Google Cloud Console**
2. **Ruota il Client Secret** (genera uno nuovo)
3. **Aggiorna `.env`** con il nuovo secret
4. **Rimuovi** le credenziali dalla history git:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch client_secret_*.json" \
     --prune-empty --tag-name-filter cat -- --all
   ```

---

## 📚 Risorse

- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Search Console API](https://developers.google.com/webmaster-tools)
- [dotenv Documentation](https://github.com/motdotla/dotenv)

---

**Ultima modifica:** 9 Febbraio 2026
