# 🧪 Guida Test con API Reali Google

**Guida step-by-step per eseguire test di integrazione con chiamate reali alle API Google OAuth2 e Google Search Console.**

---

## 📋 Prerequisiti

✅ File `.env` configurato con credenziali Google (già fatto)
✅ Progetto Google Cloud con OAuth2 abilitato
✅ Redirect URI `http://localhost` configurato in Google Cloud Console

---

## 🚀 Esecuzione Test

### STEP 1: Genera URL di Autorizzazione ✅ COMPLETATO

```bash
npm test -- full-oauth-flow --run
```

**Output:**

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=548098099543-1et8nm1hm466tf7hcmqntjd07mk81olq.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fwebmasters.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email&access_type=offline&state=789dr38q2tamlf2r0gt
```

---

### STEP 2: Autorizzazione Google (MANUALE)

1. **Apri l'URL generato in STEP 1 nel browser**

2. **Accedi con il tuo account Google** che ha accesso a Google Search Console

3. **Autorizza l'applicazione "seo-testing-tool-dev"**
   Permessi richiesti:
   - ✅ Visualizza dati Google Search Console (read-only)
   - ✅ Visualizza email account

4. **Google ti reindirizzerà a `http://localhost?code=...`**
   Il browser mostrerà un errore perché localhost non risponde, ma l'URL contiene il code

5. **Copia il parametro `code` dall'URL**
   Esempio:
   ```
   http://localhost?code=4/0AeanS0Z... ← copia tutto dopo "code="
   ```

⚠️ **IMPORTANTE:** Il code scade dopo 10 minuti e può essere usato una sola volta!

---

### STEP 3: Scambia CODE con TOKEN

1. **Apri il file** `tests/integration/full-oauth-flow.test.ts`

2. **Trova STEP 2** (linea ~58)

3. **Rimuovi `.skip` dalla linea 58:**

   ```typescript
   // PRIMA
   it.skip('STEP 2: Dovrebbe scambiare CODE con TOKEN...', async () => {

   // DOPO
   it('STEP 2: Dovrebbe scambiare CODE con TOKEN...', async () => {
   ```

4. **Incolla il CODE** ottenuto da STEP 2 (linea ~78):

   ```typescript
   // PRIMA
   const authorizationCode = 'PASTE_YOUR_AUTHORIZATION_CODE_HERE';

   // DOPO (esempio)
   const authorizationCode = '4/0AeanS0Z7Fj8kL...'; // il tuo code reale
   ```

5. **Esegui il test:**

   ```bash
   npm test -- full-oauth-flow --run
   ```

6. **Salva i token** mostrati nell'output:
   ```
   Access Token: ya29.a0AfH6SMBx...
   Refresh Token: 1//0gHcKp...
   ```

---

### STEP 4: Test Recupero Info Utente (TEST 1.1)

1. **Rimuovi `.skip` da STEP 3** (linea ~99)

2. **Incolla l'ACCESS TOKEN** da STEP 3 (linea ~120):

   ```typescript
   const accessToken = 'ya29.a0AfH6SMBx...'; // il tuo token reale
   ```

3. **Esegui il test:**

   ```bash
   npm test -- full-oauth-flow --run
   ```

4. **Verifica output:**
   ```
   ✅ INFORMAZIONI UTENTE RECUPERATE!
   Email: tuo-email@gmail.com
   Email Verificata: Sì ✅
   ```

**✅ TEST 1.1 (Login Google OAuth2) COMPLETATO!**

---

### STEP 5: Test Refresh Token (TEST 1.2)

1. **Rimuovi `.skip` da STEP 4** (linea ~150)

2. **Incolla il REFRESH TOKEN** da STEP 3 (linea ~170):

   ```typescript
   const refreshToken = '1//0gHcKp...'; // il tuo refresh token reale
   ```

3. **Esegui il test:**

   ```bash
   npm test -- full-oauth-flow --run
   ```

4. **Verifica output:**
   ```
   ✅ TOKEN RINNOVATI CON SUCCESSO!
   Nuovo Access Token: ya29.a0AfH6SMBx... (diverso dal precedente)
   ```

**✅ TEST 1.2 (Scadenza Token) COMPLETATO!**

---

### STEP 6: Test Ingestione Dati GSC (TEST 2.1-2.4)

⚠️ **Prerequisito:** Devi avere almeno una proprietà verificata in Google Search Console

1. **Rimuovi `.skip` da STEP 5** (linea ~195)

2. **Incolla un ACCESS TOKEN valido** (da STEP 3 o STEP 5):

   ```typescript
   const accessToken = 'ya29.a0AfH6SMBx...';
   ```

3. **Inserisci l'URL della tua proprietà GSC:**

   ```typescript
   // Per un sito web
   const propertyUrl = 'https://www.tuosito.com/';

   // Per un dominio
   const propertyUrl = 'sc-domain:tuosito.com';
   ```

4. **Esegui il test:**
   ```bash
   npm test -- full-oauth-flow --run
   ```

**✅ TEST 2.x (Ingestione Dati) IN CORSO...**

---

## 📊 Riepilogo Test Eseguibili

| Test       | Sezione           | Richiede                    | Chiamate API Reali             |
| ---------- | ----------------- | --------------------------- | ------------------------------ |
| **STEP 1** | Setup             | Niente                      | ❌ No (solo genera URL)        |
| **STEP 2** | Setup             | Authorization Code          | ✅ POST /token                 |
| **STEP 3** | 1.1 Login         | Access Token                | ✅ GET /userinfo               |
| **STEP 4** | 1.2 Token Refresh | Refresh Token               | ✅ POST /token                 |
| **STEP 5** | 2.x Ingestione    | Access Token + GSC Property | ✅ POST /searchanalytics/query |

---

## ⚠️ Troubleshooting

### Errore: "invalid_grant" durante STEP 3

**Causa:** Il code è scaduto (max 10 minuti) o già usato

**Soluzione:**

1. Ripeti STEP 1 per generare un nuovo URL
2. Ripeti STEP 2 per ottenere un nuovo code
3. Procedi velocemente a STEP 3 (entro 10 minuti)

---

### Errore: "unauthorized" durante STEP 4

**Causa:** L'access token è scaduto (validità 1 ora)

**Soluzione:**

1. Usa STEP 5 (refresh token) per ottenere un nuovo access token
2. Oppure ripeti da STEP 1

---

### Errore: "Redirect URI mismatch"

**Causa:** Il redirect_uri nel codice non corrisponde a quello in Google Cloud Console

**Soluzione:**

1. Vai su Google Cloud Console
2. APIs & Services → Credentials
3. Modifica il tuo OAuth 2.0 Client
4. Aggiungi `http://localhost` agli "Authorized redirect URIs"

---

### Errore: "Access blocked: seo-testing-tool-dev has not completed the Google verification process"

**Causa:** L'app è in modalità testing e il tuo account non è nella lista degli utenti di test

**Soluzione:**

1. Vai su Google Cloud Console
2. APIs & Services → OAuth consent screen
3. Aggiungi il tuo account Google nella sezione "Test users"

---

## 🎯 Coverage Test Reali

Eseguendo tutti gli step, verrai a testare:

### ✅ Sezione 1: Autenticazione e Accesso

- [x] 1.1 Login Google OAuth2 (STEP 3)
- [x] 1.2 Scadenza Token (STEP 4)
- [ ] 1.3 Revoca Accesso (manuale - revoca da Google Account)
- [ ] 1.4 Multi-tenancy (richiede setup multi-utente)
- [ ] 1.5 Permessi GSC (testato in STEP 5)

### ✅ Sezione 2: Ingestione Dati

- [ ] 2.1 Rate Limit (STEP 5 - se fai molte richieste)
- [ ] 2.2 Dati Mancanti (STEP 5 - verifica gap temporali)
- [ ] 2.3 Fuso Orario (STEP 5 - verifica allineamento date)
- [ ] 2.4 Proprietà Giganti (STEP 5 - se hai sito con milioni URL)

---

## 📚 Risorse

- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Search Console API](https://developers.google.com/webmaster-tools/search-console-api-original)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Ultima modifica:** 9 Febbraio 2026 - 12:15
