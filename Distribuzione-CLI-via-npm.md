# Distribuzione CLI via npm

## 0. Stato audit (2026-02-16)

**Readiness: 100% — PRONTO per `npm publish`.**

Ultima verifica (2026-02-16):

- Build: OK (`tsc` → `dist/cli.js --version` → `1.0.0`)
- Test unitari: 182 passati, 7 skipped (OAuth noti)
- Test E2E: 8/8 passati (incluso tarball test)
- Tarball: 94 file, 69.4 kB — contiene solo dist/, drizzle/, package.json, README.md, LICENSE
- Nome `seo-testing-tool` disponibile su npmjs.com

### Tutto completato

- [x] 1.1 — tsx e @types/inquirer spostati in devDependencies
- [x] 1.2 — `"files": ["dist/", "drizzle/"]` aggiunto in package.json
- [x] 1.3 — Righe drizzle rimossi da .gitignore, migrazioni committate (tutte e 3)
- [x] 1.4 — Versione dinamica in cli.ts via `createRequire(import.meta.url)`
- [x] 1.5 — require() in env.ts convertiti a import ESM statici
- [x] 1.6 — LICENSE file creato (MIT, 2026)
- [x] 1.7 — `"prebuild": "rimraf dist"` + rimraf come devDep
- [x] 2 — Bin diretto: `"bin": { "seo-tool": "./dist/cli.js" }` (Opzione A)
- [x] 3 — Pure ESM confermato, campo `exports` aggiunto
- [x] 4 — Struttura dist/ corretta, path migrazioni verificato
- [x] 5 — Dependencies runtime corrette (9 pacchetti), `engines` aggiunto
- [x] 6 — Test E2E: 7 test CLI + 1 tarball in `tests/e2e/cli-e2e.test.ts`
- [x] 7 — Scripts lifecycle: prebuild, build, postbuild, prepack, prepublishOnly, test:e2e
- [x] Import `.js` extensions corretti su tutti i file sorgente
- [x] Shebang `#!/usr/bin/env node` preservato in dist/cli.js
- [x] `.gitignore`: aggiunto `*.db-shm`, `*.db-wal`, `*.tgz`, `nul`
- [x] File spuri rimossi dal repo (`dev.db-shm`, `dev.db-wal`, `.tgz`)
- [x] README: sezione `npm install -g seo-testing-tool` + Quick Start aggiornato
- [x] `author`: `"Francesca <francesca@example.com>"`
- [x] `repository`: `github.com/svilupp0/SEO-Testing-Tool`
- [x] `bugs` e `homepage` aggiunti in package.json
- [x] `npm pack --dry-run` verificato (94 file, 69.4 kB)
- [x] Config E2E dedicata: `vitest.e2e.config.ts` (separa E2E dalla suite principale)
- [x] Fix tarball test Windows (estrazione .tgz name dall'ultima riga di npm pack)

---

## Contesto

La CLI seo-testing-tool funzionava perfettamente in locale (clone + npx tsx), ma non era pronta per npm publish. Il bin wrapper dipendeva da tsx a runtime, non c'era un campo files, le migrazioni Drizzle erano gitignorate, e diverse dipendenze erano nel posto sbagliato. Questo piano ha trasformato il progetto in un pacchetto npm installabile con `npm install -g seo-testing-tool`.

## 1. Audit: problemi corretti

### 1.1 Dipendenze nel posto sbagliato ✅

tsx e @types/inquirer spostati in devDependencies.

### 1.2 Campo files in package.json ✅

`"files": ["dist/", "drizzle/"]` — whitelist esplicita.

### 1.3 Migrazioni Drizzle ✅

Righe di esclusione rimosse da .gitignore. Tutte e 3 le migrazioni (0000, 0001, 0002) committate.

### 1.4 Versione dinamica ✅

`createRequire(import.meta.url)` + `require('../package.json')` in cli.ts. ESM valido: `createRequire` e' API standard Node.js, `package.json` e' sempre incluso nei tarball npm, il path `../package.json` da `dist/cli.js` risolve alla root del pacchetto.

### 1.5 ESM puro in env.ts ✅

require() convertiti a import statici ESM.

### 1.6 LICENSE ✅

File MIT creato nella root.

### 1.7 Pulizia dist/ ✅

`"prebuild": "rimraf dist"` elimina artefatti stale prima di ogni build.

## 2. Bin diretto ✅

Opzione A implementata — bin diretto a `dist/cli.js`:

```json
"bin": { "seo-tool": "./dist/cli.js" }
```

`bin/seo-tool.mjs` mantenuto per dev locale, escluso da `files`. Script `"dev:cli": "tsx src/cli.ts"` per sviluppo.

## 3. Pure ESM ✅

Nessun cambiamento necessario:

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

## 4. Struttura tarball ✅

```
seo-testing-tool-1.0.0.tgz  (69.4 kB, 94 file)
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

Escluso: src/, tests/, bin/, \*.config.ts, .env, .gitignore.

**Path migrazioni:** `db.ts` usa `join(__dirname, '..', '..', 'drizzle')` — da `dist/database/db.js` risale 2 livelli alla root. Funziona sia in sviluppo che dopo npm install.

## 5. Dependencies runtime ✅

| Pacchetto      | Perche'                |
| -------------- | ---------------------- |
| better-sqlite3 | DB engine (nativo C++) |
| drizzle-orm    | ORM                    |
| commander      | CLI parsing            |
| chalk          | Colori terminale       |
| cli-table3     | Tabelle terminale      |
| asciichart     | Grafici ASCII          |
| inquirer       | Prompt interattivi     |
| exceljs        | Export Excel           |
| dotenv         | Env vars               |

`"engines": { "node": ">=18.0.0" }`

**Nota su better-sqlite3:** addon nativo C++. Su piattaforme comuni (Linux x64, macOS arm64, Windows x64) i binari precompilati si installano automaticamente.

## 6. Test E2E ✅

File: `tests/e2e/cli-e2e.test.ts`
Config: `vitest.e2e.config.ts` (config dedicata, separata dalla suite principale)
Script: `"test:e2e": "npm run build && vitest run --config vitest.e2e.config.ts"`

Test implementati (8/8 passano):

- [x] `--version` → exit 0, stampa versione da package.json
- [x] `--help` → exit 0, elenca tutti i comandi
- [x] `list` → exit 0, "Nessun test" su DB vuoto
- [x] `status <id-inesistente>` → gestisce gracefully
- [x] `delete <id-inesistente>` → gestisce gracefully
- [x] `export <id-inesistente>` → gestisce gracefully
- [x] `<comando-sconosciuto>` → exit non-zero
- [x] Tarball: `npm pack` → install in temp dir → `--version` funziona

## 7. Strategia di release ✅

Scripts npm lifecycle:

```json
"prebuild": "rimraf dist",
"build": "tsc",
"postbuild": "node dist/cli.js --version",
"prepack": "npm run build",
"prepublishOnly": "vitest run && npm run test:e2e"
```

### Workflow release

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

### GitHub Actions (futuro)

File `.github/workflows/release.yml` triggerato su tag push `v*`:
npm ci → npm test → npm run build → npm run test:e2e → npm publish
Richiede secret NPM_TOKEN.

## 8. Estensibilita' futura (plugin system)

Prematura a v1.0. Il codebase ha buona separation of concerns (DI via OrchestratorDeps). Punti di estensione naturali per futuro: data source custom, export format custom, notifiche custom, test statistici custom.

## 9. Sequenza implementazione — COMPLETATA

### Fase 1 — Fix fondazioni ✅

- [x] Spostare tsx e @types/inquirer in devDependencies
- [x] Aggiungere `"files": ["dist/", "drizzle/"]`
- [x] Cambiare `"bin"` a `{ "seo-tool": "./dist/cli.js" }`
- [x] Aggiungere `"prebuild": "rimraf dist"` + rimraf devDep
- [x] Rimuovere drizzle/meta/ e drizzle/\*.sql da .gitignore
- [x] Committare tutte le migrazioni Drizzle (0000, 0001, 0002)
- [x] Convertire require() in env.ts a import ESM statici
- [x] Versione dinamica in cli.ts via createRequire
- [x] Creare file LICENSE (MIT)

### Fase 2 — Test E2E ✅

- [x] Scrivere test E2E per --version
- [x] Build + fix fino a GREEN
- [x] Aggiungere test per ogni comando (7 test)
- [x] Test tarball (npm pack → install → verify)
- [x] Config vitest dedicata per E2E (`vitest.e2e.config.ts`)
- [x] Fix parsing output npm pack su Windows

### Fase 3 — Release pipeline ✅

- [x] Aggiungere prepack, prepublishOnly, postbuild
- [x] `npm pack --dry-run` verificato (94 file, 69.4 kB)
- [x] Test installazione da tarball in directory isolata (via E2E)

### Fase 4 — Polish ✅

- [x] README: sezione `npm install -g seo-testing-tool` + Quick Start con `seo-tool`
- [x] Rimossa sezione "Installazione come comando globale" (ridondante)
- [x] `author`: `"Francesca <francesca@example.com>"`
- [x] `repository`, `bugs`, `homepage` in package.json
- [x] `.gitignore`: `*.db-shm`, `*.db-wal`, `*.tgz`, `nul`
- [x] File spuri rimossi dal repo
- [x] Nome `seo-testing-tool` verificato disponibile su npmjs.com
- [x] Tutto committato

## 10. Pubblicazione

```bash
npm publish
```
