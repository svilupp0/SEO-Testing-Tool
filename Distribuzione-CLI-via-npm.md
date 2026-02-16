# Distribuzione CLI via npm

## 0. Stato audit (2026-02-16)

**Readiness: ~80% — quasi pronti, mancano pochi passi.**

### Completato
- [x] 1.1 — tsx e @types/inquirer spostati in devDependencies
- [x] 1.2 — `"files": ["dist/", "drizzle/"]` aggiunto in package.json
- [x] 1.3 — Righe drizzle rimossi da .gitignore
- [x] 1.4 — Versione dinamica in cli.ts via `createRequire(import.meta.url)`
- [x] 1.5 — require() in env.ts convertiti a import ESM statici
- [x] 1.6 — LICENSE file creato (MIT, 2026)
- [x] 1.7 — `"prebuild": "rimraf dist"` + rimraf come devDep
- [x] 2 — Bin diretto: `"bin": { "seo-tool": "./dist/cli.js" }` (Opzione A)
- [x] 3 — Pure ESM confermato, campo `exports` aggiunto
- [x] 4 — Struttura dist/ corretta, path migrazioni verificato
- [x] 5 — Dependencies runtime corrette (9 pacchetti), `engines` aggiunto
- [x] 6 — Test E2E scritti: 7 test CLI + 1 tarball test in `tests/e2e/cli-e2e.test.ts`
- [x] 7 — Scripts lifecycle: prebuild, build, postbuild, prepack, prepublishOnly, test:e2e
- [x] Import `.js` extensions corretti su tutti i file sorgente
- [x] Shebang `#!/usr/bin/env node` preservato in dist/cli.js

### Da fare prima di pubblicare (bloccanti)
- [ ] **Committare tutte le modifiche** — git status mostra ~10 file modificati + untracked (tests/e2e/, LICENSE, drizzle/0002, ecc.)
- [ ] **`.gitignore`: aggiungere `*.db-shm` e `*.db-wal`** — WAL files SQLite non coperti dai pattern attuali
- [ ] **Eliminare file spuri**: `nul` (artefatto Windows), `seo-testing-tool-1.0.0.tgz` (vecchio pack test)
- [ ] **Eseguire test suite completa**: `npm test` + `npm run test:e2e` — verificare che tutto passi

### Da fare prima di pubblicare (raccomandati)
- [ ] **README**: aggiungere sezione installazione da npm (`npm install -g seo-testing-tool`) — attualmente mostra solo `git clone`
- [ ] **`author`** vuoto in package.json — compilare (es. `"author": "Francesca"`)
- [ ] **`repository`** mancante in package.json — aggiungere URL GitHub (raccomandato da npm per la pagina del pacchetto)
- [ ] **Verificare disponibilita' nome** `seo-testing-tool` su npmjs.com — se occupato, valutare scoped name `@francesca/seo-tool`
- [ ] **`npm pack --dry-run`** — verificare che il tarball contenga solo dist/, drizzle/, package.json, README.md, LICENSE

---

## Contesto

La CLI seo-testing-tool funziona perfettamente in locale (clone + npx tsx), ma non e' pronta per npm publish. Il bin wrapper attuale dipende da tsx a runtime, non c'e' un campo files, le migrazioni Drizzle sono gitignorate, e diverse dipendenze sono nel posto sbagliato. Questo piano trasforma il progetto in un pacchetto npm installabile con npm install -g seo-testing-tool.

## 1. Audit: problemi da correggere

### 1.1 Dipendenze nel posto sbagliato ✅ FATTO
tsx in dependencies — serve solo in dev, non dopo la compilazione
@types/inquirer in dependencies — sono type declarations, non servono a runtime
~~Azione: spostare entrambi in devDependencies.~~

### 1.2 Nessun campo files in package.json ✅ FATTO
~~Senza files e senza .npmignore, npm usa .gitignore come fallback. Ma .gitignore esclude dist/ e drizzle/ — cioe' esattamente le due cose necessarie a runtime. Il pacchetto pubblicato sarebbe rotto.~~

~~Azione: aggiungere "files": ["dist/", "drizzle/"] in package.json.~~

### 1.3 Migrazioni Drizzle gitignorate ✅ FATTO
~~.gitignore righe 54-55 escludono drizzle/meta/ e drizzle/*.sql.~~

~~Azione: rimuovere quelle righe da .gitignore, committare i file di migrazione.~~

**Nota:** La migrazione 0002 (`drizzle/0002_faulty_the_watchers.sql` e `drizzle/meta/0002_snapshot.json`) e' ancora untracked — va committata.

### 1.4 Versione hardcoded in src/cli.ts ✅ FATTO
~~Riga .version('1.0.0') — va fuori sync con package.json ad ogni bump.~~

Implementato con `createRequire(import.meta.url)` + `require('../package.json')`. Questo e' ESM valido: `createRequire` e' API standard Node.js, e `package.json` e' sempre incluso nei tarball npm. Il path `../package.json` da `dist/cli.js` risolve correttamente alla root del pacchetto.

### 1.5 require() in src/config/env.ts ✅ FATTO
~~3 chiamate require() (righe 61, 94, 95) violano la purezza ESM del progetto.~~

~~Azione: convertire in import { readFileSync } from 'fs' e import path from 'path' statici.~~

### 1.6 Nessun file LICENSE ✅ FATTO
~~Azione: creare LICENSE con testo MIT.~~

### 1.7 dist/ contiene artefatti stale ✅ FATTO
~~Azione: aggiungere script "prebuild": "rimraf dist" + rimraf come devDep.~~

## 2. Bin diretto vs wrapper ✅ FATTO

Implementata Opzione A — bin diretto a `dist/cli.js`.

package.json:
```json
"bin": { "seo-tool": "./dist/cli.js" }
```

`bin/seo-tool.mjs` mantenuto per dev locale, escluso da `files`. Script `"dev:cli": "tsx src/cli.ts"` aggiunto.

## 3. ESM vs CJS ✅ FATTO — Pure ESM

Nessun cambiamento necessario. Il progetto e' gia' full ESM con:
- `"type": "module"` in package.json
- chalk v5 (ESM-only)
- Tutti gli import relativi con estensione `.js`
- Node 18+ supporto nativo ESM

Campo `exports` aggiunto:
```json
"exports": {
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
}
```

## 4. Struttura src/ e dist/ ✅ VERIFICATA

Cosa viene pubblicato su npm (whitelist via files):

```
seo-testing-tool/        (npm tarball)
  dist/                  compilato JS + .d.ts + .map
    cli.js               entry point bin (con shebang)
    index.js             entry point cron
    auth/  cli/  config/  database/  gsc/  notifications/  orchestrator/  services/  stats/
  drizzle/               migrazioni SQL
    0000_*.sql  0001_*.sql  0002_*.sql
    meta/_journal.json + snapshots
  package.json           auto-incluso
  README.md              auto-incluso
  LICENSE                auto-incluso
```

Escluso automaticamente: src/, tests/, bin/, *.config.ts, .env, .gitignore, ecc.

**Path migrazioni verificato:** `db.ts` usa `join(__dirname, '..', '..', 'drizzle')` — da `dist/database/db.js` risale 2 livelli alla root del pacchetto. Funziona sia in sviluppo che dopo npm install.

## 5. Evitare che l'utente installi devDependencies ✅ FATTO

Dependencies runtime attuali (verificate in package.json):

| Pacchetto | Perche' |
|-----------|---------|
| better-sqlite3 | DB engine (nativo C++) |
| drizzle-orm | ORM |
| commander | CLI parsing |
| chalk | Colori terminale |
| cli-table3 | Tabelle terminale |
| asciichart | Grafici ASCII |
| inquirer | Prompt interattivi |
| exceljs | Export Excel |
| dotenv | Env vars |

Campo `engines` aggiunto: `"node": ">=18.0.0"`

**Nota su better-sqlite3:** addon nativo C++ — richiede compilazione o prebuilt binaries. Su piattaforme comuni (Linux x64, macOS arm64, Windows x64) i binari precompilati si installano automaticamente. Documentare nel README.

## 6. Test E2E per la CLI pubblicata ✅ FATTO

File: `tests/e2e/cli-e2e.test.ts`

Helper `runCli(args[], env?)`:
- Spawna `node dist/cli.js` con args e env custom
- DATABASE_URL puntato a SQLite temporaneo per isolamento
- Cleanup automatico della temp dir

Test implementati (7 + 1 tarball):
- [x] `seo-tool --version` → exit 0, stampa versione da package.json
- [x] `seo-tool --help` → exit 0, elenca tutti i comandi (login, add, list, status, run, export, delete)
- [x] `seo-tool list` → exit 0, "Nessun test" su DB vuoto
- [x] `seo-tool status <id-inesistente>` → gestisce gracefully "non trovato"
- [x] `seo-tool delete <id-inesistente>` → gestisce gracefully
- [x] `seo-tool export <id-inesistente>` → gestisce gracefully
- [x] `seo-tool <comando-sconosciuto>` → exit non-zero
- [x] Tarball test: `npm pack` → install in temp dir → `--version` funziona

Script: `"test:e2e": "npm run build && vitest run tests/e2e"`

## 7. Strategia di release ✅ SCRIPTS PRONTI

Scripts npm lifecycle (tutti configurati in package.json):

```json
"prebuild": "rimraf dist",
"build": "tsc",
"postbuild": "node dist/cli.js --version",
"prepack": "npm run build",
"prepublishOnly": "vitest run && npm run test:e2e"
```

### Workflow release manuale (v1.x)

```bash
# 1. Assicurarsi che tutto passi
npm test && npm run test:e2e

# 2. Bump versione (crea tag git automaticamente)
npm version patch|minor|major

# 3. Push
git push && git push --tags

# 4. Publish
npm publish
```

### Verifica pre-publish

```bash
npm pack --dry-run    # verifica contenuto tarball
```

Controllare che ci siano dist/, drizzle/, package.json, README.md, LICENSE — e che NON ci siano src/, tests/, .env, bin/.

### GitHub Actions (futuro)

File `.github/workflows/release.yml` triggerato su tag push `v*`:
npm ci → npm test → npm run build → npm run test:e2e → npm publish
Richiede secret NPM_TOKEN.

## 8. Estensibilita' futura (plugin system)

Valutazione: prematura a v1.0. Non ci sono utenti che chiedono plugin. Il codebase ha gia' buona separation of concerns (DI via OrchestratorDeps, interfacce per i servizi).

Punti di estensione naturali (per futuro):
- Data source custom (oltre GSC): Bing, Adobe Analytics
- Export format custom (oltre Excel/CSV): PDF, Google Sheets
- Notifiche custom: Slack, Telegram
- Test statistici custom: oltre Welch's t-test

Ora: non implementare nulla. Concentrarsi sulla distribuzione npm.

## 9. Sequenza implementazione — stato aggiornato

### Fase 1 — Fix fondazioni ✅ COMPLETATA
- [x] Spostare tsx e @types/inquirer in devDependencies
- [x] Aggiungere `"files": ["dist/", "drizzle/"]`
- [x] Cambiare `"bin"` a `{ "seo-tool": "./dist/cli.js" }`
- [x] Aggiungere `"prebuild": "rimraf dist"` + rimraf devDep
- [x] Rimuovere drizzle/meta/ e drizzle/*.sql da .gitignore
- [x] Committare file migrazioni Drizzle (0000, 0001 — **0002 ancora da committare**)
- [x] Convertire require() in env.ts a import ESM statici
- [x] Versione dinamica in cli.ts via createRequire
- [x] Creare file LICENSE (MIT)

### Fase 2 — Test E2E ✅ COMPLETATA
- [x] Scrivere test E2E per --version
- [x] Build + fix fino a GREEN
- [x] Aggiungere test per ogni comando (7 test)
- [x] Test tarball (npm pack → install → verify)

### Fase 3 — Release pipeline ✅ COMPLETATA
- [x] Aggiungere prepack, prepublishOnly, postbuild
- [ ] `npm pack --dry-run` → verificare contenuto
- [ ] Test installazione da tarball in directory isolata

### Fase 4 — Polish ⬜ DA FARE
- [ ] Aggiornare README con istruzioni `npm install -g seo-testing-tool`
- [ ] Compilare campo `author` in package.json
- [ ] Aggiungere campo `repository` in package.json
- [ ] Aggiungere `*.db-shm` e `*.db-wal` a .gitignore
- [ ] Eliminare file spuri (`nul`, vecchio `.tgz`)
- [ ] Committare tutto
- [ ] Verificare disponibilita' nome su npmjs.com
- [ ] (Opzionale) Aggiornare Dockerfile per usare dist/ invece di src/ + tsx

## 10. Pre-flight checklist (da eseguire prima di `npm publish`)

```bash
# 1. Pulizia
rm nul seo-testing-tool-1.0.0.tgz    # file spuri

# 2. Build pulita
npm run build

# 3. Test unitari (devono passare tutti tranne i 2 OAuth noti)
npx vitest run

# 4. Test E2E
npm run test:e2e

# 5. Verifica tarball
npm pack --dry-run
# Deve contenere: dist/, drizzle/, package.json, README.md, LICENSE
# NON deve contenere: src/, tests/, bin/, .env, node_modules/

# 6. Test installazione reale
npm pack
mkdir test-install && cd test-install
npm init -y && npm install ../seo-testing-tool-*.tgz
npx seo-tool --version
npx seo-tool list
cd .. && rm -rf test-install

# 7. Publish
npm publish
```
