# ROADMAP.md

Miglioramenti identificati tramite analisi della documentazione e del codice (2026-02-27).
Ordinati per priorità.

---

## 1. Aggiornamento README

**Priorità**: Alta
**Stato**: Non iniziato

`README.md` è rimasto a `v1.0.0` mentre il progetto è cresciuto significativamente. Mancano: versione corretta, documentazione dei comandi `demo` e `setup`, guida rapida per nuovi utenti.

**File da modificare**:

- `README.md` — riga 1: aggiornare `v1.0.0` → `v1.1.0`
- `README.md` — aggiungere sezione comandi: `seo-tool demo` e `seo-tool setup`
- `README.md` — aggiungere sezione "Per iniziare" con il flusso `setup → login → add → run`

**Criterio di completamento**: un utente che legge solo il README sa qual è la versione corrente, conosce tutti i comandi disponibili e può completare il primo setup senza cercare altra documentazione.

---

## 2. Demo accessibile via npm (`seo-tool demo`)

**Priorità**: Alta
**Stato**: Completato (2026-03-01)

`src/demo.ts` esiste e genera 70 giorni di dati simulati (2 esperimenti) senza richiedere un account Google. Ma non è incluso nel pacchetto npm (`files` in `package.json` pubblica solo `dist/` e `drizzle/`). L'utente che installa via `npm install -g` non può usarlo.

**Interventi effettuati**:

- Aggiunto `export` alla funzione `demo()` in `src/demo.ts` + guard ESM (`fileURLToPath`) per preservare l'auto-esecuzione diretta
- Aggiunto `demoCommand()` in `src/cli/commands.ts` (import dinamico)
- Registrato `seo-tool demo` in `src/cli.ts`
- Aggiornati i messaggi del riepilogo: `seo-tool <cmd>` invece di `npx tsx src/cli.ts <cmd>`

**Criterio di completamento**: `npx seo-testing-tool demo` funziona senza clonare il repository. ✓

---

## 3. Wizard configurazione OAuth2 (`seo-tool setup`)

**Priorità**: Alta
**Stato**: Completato (2026-03-01)

Il comando `seo-tool login` presuppone che `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` siano già nel file `.env`. Non esiste nessuna guida interattiva. `CREDENTIALS-SETUP.md` esiste nel repository ma non viene incluso nel pacchetto npm.

**Interventi effettuati**:

- Aggiunto `updateEnvVars()` helper (private) in `src/cli/commands.ts` — preserva le var non-Google, aggiorna senza duplicati
- Aggiunto `setupCommand()` in `src/cli/commands.ts` con wizard interattivo completo
- Registrato `seo-tool setup` in `src/cli.ts`
- 8 test in `tests/cli/setup-command.test.ts` (tutti verdi)

**Criterio di completamento**: un utente senza `.env` può eseguire `seo-tool setup` e arrivare a `seo-tool login` senza leggere documentazione esterna. ✓

---

## 4. Soglia minima di traffico documentata

**Priorità**: Media
**Stato**: Non iniziato

`AnalysisConfig.ts` definisce `minimumDataThreshold: 10` (giorni minimi di dati per periodo). Il README avverte che il tool "non funziona su siti piccoli" ma non fornisce nessuna cifra orientativa in termini di click/mese.

**Interventi necessari**:

- Calcolare (o stimare) il numero minimo di click mensili affinché il Welch's t-test raggiunga potenza statistica accettabile (es. con α=0.05, potenza=0.80)
- Documentare la soglia nel README e nell'output di `seo-tool add` (avviso se il sito sembra sotto soglia)
- Considerare di esporre `minimumClicksPerPeriod` come parametro in `AnalysisConfig.ts`

**Criterio di completamento**: l'utente può determinare se il suo sito è adatto prima di installare il tool.

---

## 5. Installazione guidata (verifica dipendenze native)

**Priorità**: Media
**Stato**: Non iniziato

`better-sqlite3` è un modulo nativo C++. Su Windows richiede Visual Studio Build Tools; su Linux/macOS richiede `python` e `make`. L'assenza di questi strumenti causa un errore di build oscuro durante `npm install`.

**Interventi necessari**:

- Aggiungere script `preinstall` in `package.json` che verifichi la presenza degli strumenti necessari
- In alternativa: aggiungere una sezione "Prerequisiti" nel README con istruzioni per Windows, macOS e Linux
- Mostrare un messaggio chiaro se `better-sqlite3` non riesce a compilarsi

**Criterio di completamento**: un utente non tecnico su Windows riceve istruzioni comprensibili in caso di errore durante `npm install`.

---

## 6. Notifiche implementate e configurabili

**Priorità**: Media
**Stato**: Non iniziato

`src/notifications/NotificationService.ts` è uno stub — il metodo `notify()` non fa nulla. L'orchestratore lo chiama ma non viene inviata nessuna notifica. Non è documentato nessun canale.

**Interventi necessari**:

- Scegliere e implementare almeno un canale: email (nodemailer), webhook HTTP, o Slack (incoming webhook)
- Rendere il canale configurabile via variabili d'ambiente (es. `NOTIFICATION_WEBHOOK_URL`, `NOTIFICATION_EMAIL`)
- Documentare la configurazione nel README
- Aggiungere sezione notifiche nel wizard `seo-tool setup` (issue #3 ora completato — si può procedere)

**Criterio di completamento**: dopo `seo-tool run`, l'utente riceve una notifica reale se i risultati sono statisticamente significativi.

---

## 7. Output grafico esportabile (`--export-chart`)

**Priorità**: Bassa
**Stato**: Non iniziato

`seo-tool status <id>` mostra un grafico ASCII via `asciichart`. I grafici ASCII sono difficili da leggere e non condivisibili.

**Interventi necessari**:

- Valutare una libreria di rendering grafico server-side (es. `chartjs-node-canvas` o SVG inline)
- Aggiungere flag `--export-chart` al comando `status` per salvare il grafico come file immagine (PNG o SVG)
- In alternativa: includere un grafico nel report Excel esistente (ExcelJS supporta i grafici)

**Criterio di completamento**: `seo-tool status <id> --export-chart` produce un file immagine leggibile fuori dal terminale.
