# 🔍 Analisi Test Falliti - Autenticazione

**Data analisi:** 9 Febbraio 2026
**Test totali:** 73
**Test falliti:** 12
**Test legati ad autenticazione:** 5

---

## 📊 Riepilogo Test Falliti

### Categoria 1: API Mock Mancanti (5 test) 🔴 PRIORITÀ ALTA

#### 1.1 `google-oauth2.test.ts` (2 test)

**File:** [tests/auth/google-oauth2.test.ts](tests/auth/google-oauth2.test.ts:53-84)

**Test che falliscono:**

1. **"dovrebbe scambiare il codice di autorizzazione con i token di accesso"** (linea 53)

   ```typescript
   const tokens = await authService.exchangeCodeForTokens(authorizationCode);
   // ❌ Fa chiamata reale a https://oauth2.googleapis.com/token
   // ❌ Errore: "Impossibile connettersi a Google. Riprova."
   ```

2. **"dovrebbe recuperare le informazioni dell'utente autenticato"** (linea 70)
   ```typescript
   const userInfo = await authService.getUserInfo(accessToken);
   // ❌ Fa chiamata reale a https://www.googleapis.com/oauth2/v2/userinfo
   // ❌ Errore: "Impossibile connettersi a Google. Riprova."
   ```

**Causa:** Nessun mock per `fetch` verso Google OAuth endpoints

**Soluzione:** Mock `fetch` per restituire risposte fake realistiche

---

#### 1.2 `token-refresh.test.ts` (3 test)

**File:** [tests/auth/token-refresh.test.ts](tests/auth/token-refresh.test.ts:65-211)

**Test che falliscono:**

1. **"dovrebbe usare il refresh token per ottenere un nuovo access token"** (linea 65)

   ```typescript
   const newTokens = await tokenManager.refreshAccessToken(refreshToken);
   // ❌ Fa chiamata reale a https://oauth2.googleapis.com/token
   // ❌ Errore: "Sessione scaduta. Effettua nuovamente il login."
   ```

2. **"dovrebbe ottenere un access token valido anche se quello attuale è scaduto"** (linea 172)

   ```typescript
   const validToken = await tokenManager.getValidAccessToken(expiredToken);
   // ❌ Chiama refreshAccessToken che fa chiamata reale
   // ❌ Errore: "Sessione scaduta. Effettua nuovamente il login."
   ```

3. **"dovrebbe mantenere lo stesso refresh token dopo il rinnovo"** (linea 185)
   ```typescript
   const newTokens = await tokenManager.refreshAccessToken(refreshToken);
   // ❌ Stessa chiamata reale API
   // ❌ Errore: "Sessione scaduta. Effettua nuovamente il login."
   ```

**Causa:** TokenManager fa chiamate reali a Google per refresh token

**Soluzione:** Mock endpoint `/token` con risposta che simula token refresh

---

### Categoria 2: Implementazione Mancante (3 test) 🟡 PRIORITÀ MEDIA

#### 2.1 `gsc-permissions.test.ts` (3 test)

**File:** [tests/auth/gsc-permissions.test.ts](tests/auth/gsc-permissions.test.ts)

**Errore comune:**

```
AssertionError: expected [Function] to throw error including
'Non hai accesso a questa proprietà su…' but got 'makeRequest non implementato'
```

**Test che falliscono:**

1. "dovrebbe rifiutare l'accesso quando l'utente non ha permessi sulla proprietà"
2. "dovrebbe verificare i permessi prima di ogni fetch di dati"
3. "dovrebbe gestire la rimozione dell'accesso durante l'uso dell'app"

**Causa:** Metodo `makeRequest()` in `GSCPermissionService` non implementato

**Soluzione:** Implementare metodo `makeRequest` in [src/gsc/GSCPermissionService.ts](src/gsc/GSCPermissionService.ts)

---

### Categoria 3: Feature Non Implementate (4 test) 🟢 PRIORITÀ BASSA

#### 3.1 `multi-tenancy.test.ts` (1 test)

**Test:** "dovrebbe gestire correttamente i test condivisi se implementata la feature"

**Errore:** Feature test condivisi non implementata (flag `isShared`)

**Priorità:** BASSA - Feature collaborativa avanzata

---

#### 3.2 `test-deletion.test.ts` (1 test)

**Test:** "DEVE eliminare il test mantenendo i dati storici GSC"

**Errore:** Logica conferma eliminazione inconsistente

**Priorità:** BASSA - Edge case nella UX

---

#### 3.3 `gsc-data-fetcher.test.ts` (2 test)

**Test:** Batch processing per proprietà giganti (Test 2.4)

**Errore:** Logica batch processing incompleta

**Priorità:** MEDIA - Importante per siti enterprise

---

## 🎯 Piano di Fix per Test Autenticazione

### Fix 1: Mock Google OAuth Endpoints (5 test)

**Priorità:** 🔴 ALTA (blocca test automatizzati)

**File da creare:** `tests/mocks/googleOAuth.mock.ts`

**Cosa mockare:**

1. **POST `https://oauth2.googleapis.com/token`** (exchange code + refresh)

   ```typescript
   // Mock risposta success per exchangeCodeForTokens
   {
     access_token: "ya29.a0AfH6SMBx...",
     refresh_token: "1//0gHcKp...",
     expires_in: 3600,
     token_type: "Bearer"
   }

   // Mock risposta error per token revocato
   {
     error: "invalid_grant",
     error_description: "Token has been expired or revoked"
   }
   ```

2. **GET `https://www.googleapis.com/oauth2/v2/userinfo`**
   ```typescript
   // Mock risposta success per getUserInfo
   {
     email: "test@example.com",
     verified_email: true,
     id: "1234567890"
   }
   ```

**Approccio:**

- Usare `vi.spyOn(global, 'fetch')` con `mockResolvedValue`
- Creare helper function per setup/teardown mock
- Rendere i mock riutilizzabili in tutti i test

---

### Fix 2: Implementare makeRequest in GSCPermissionService (3 test)

**Priorità:** 🟡 MEDIA

**File:** [src/gsc/GSCPermissionService.ts](src/gsc/GSCPermissionService.ts)

**Metodo da implementare:**

```typescript
async makeRequest(url: string, accessToken: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  // Gestione 403 Forbidden
  if (response.status === 403) {
    throw new Error('Non hai accesso a questa proprietà su Google Search Console.');
  }

  return response;
}
```

---

## 📈 Impatto Atteso

**Dopo Fix 1 (Mock OAuth):**

- ✅ 5 test passeranno
- ✅ Test suite completamente offline
- ✅ Test deterministici e veloci
- **Success Rate:** 66/73 = **90.4%** (da 83.6%)

**Dopo Fix 2 (makeRequest):**

- ✅ 3 test aggiuntivi passeranno
- **Success Rate:** 69/73 = **94.5%**

**Dopo Fix 3 (Batch Processing):**

- ✅ 2 test aggiuntivi passeranno
- **Success Rate:** 71/73 = **97.3%**

**Dopo Fix 4 (Feature minori):**

- ✅ 2 test aggiuntivi passeranno
- **Success Rate:** 73/73 = **100%** 🎯

---

## 🚀 Ordine di Implementazione Consigliato

1. **Fix 1: Mock OAuth** (HIGH IMPACT, 1 ora)
   - Sblocca test automatizzati
   - Permette TDD completo
   - 5 test passano

2. **Fix 2: makeRequest** (MEDIUM IMPACT, 30 min)
   - Completa GSCPermissionService
   - 3 test passano

3. **Fix 3: Batch Processing** (LOW IMPACT, 2 ore)
   - Feature enterprise
   - 2 test passano

4. **Fix 4: Feature minori** (OPTIONAL)
   - Test condivisi + delete logic
   - 2 test passano

---

**Ultima modifica:** 9 Febbraio 2026
