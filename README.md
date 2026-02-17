# SEO Testing Tool v1.0.0

Strumento CLI per esperimenti SEO con analisi statistica (Welch's t-test), integrazione Google Search Console. Database SQLite locale (zero configurazione).

## Visione

Rispondere in modo affidabile alla domanda:
**"Questa modifica SEO ha probabilmente migliorato o peggiorato le performance su Google?"**

Il tool non promette certezze, ma supporta decisioni informate attraverso analisi statistica rigorosa.

## Installazione

```bash
npm install -g seo-testing-tool
```

Richiede Node.js >= 18. Su alcune piattaforme `better-sqlite3` potrebbe richiedere build tools (python, make).

> Il database SQLite viene creato automaticamente in `~/.seo-tool/data.db` al primo avvio. Non serve configurare nulla.

## Quick Start

```bash
# 1. Collega il tuo account Google Search Console
seo-tool login

# 2. Crea un nuovo test SEO (prompt interattivi)
seo-tool add

# 3. Recupera dati da GSC e analizza
seo-tool run

# 4. Visualizza risultati con grafico ASCII
seo-tool status <id>
```

## Comandi CLI

| Comando | Descrizione |
|---------|-------------|
| `seo-tool login` | Collega account Google (OAuth2 per Search Console) |
| `seo-tool add` | Crea un nuovo test SEO (prompt interattivi) |
| `seo-tool list` | Mostra tabella con tutti i test |
| `seo-tool status <id>` | Dettaglio test con analisi statistica e grafico ASCII |
| `seo-tool run` | Sincronizza tutti i test attivi (fetch GSC + analisi) |
| `seo-tool export <id>` | Esporta metriche in Excel o CSV |
| `seo-tool delete <id>` | Elimina un test (con conferma interattiva) |

Tutti i comandi che accettano `<id>` supportano **ID parziali** (es. `seo-tool status abcd`).

### Esempi

```bash
# Collega Google Search Console
seo-tool login

# Crea un nuovo test
seo-tool add

# Elenca tutti i test
seo-tool list

# Visualizza dettaglio con grafico ASCII
seo-tool status abcd1234

# Sincronizza dati da GSC
seo-tool run

# Esporta in Excel
seo-tool export abcd1234 --format xlsx

# Esporta in CSV
seo-tool export abcd1234 --format csv

# Esporta (prompt interattivo per scegliere formato)
seo-tool export abcd1234

# Elimina un test (chiede conferma)
seo-tool delete abcd1234
```

## Demo Mode (da sorgente)

Vuoi provare il tool senza configurare Google Search Console? La modalita' demo genera due esperimenti con **70 giorni di metriche simulate** (rumore statistico realistico via Box-Muller):

- **Esperimento Positivo** — incremento click del +46% nel periodo post (p-value < 0.01)
- **Esperimento Neutro** — nessuna differenza significativa tra pre e post

> Richiede il clone del repository (non disponibile via `npm install -g`).

```bash
git clone https://github.com/svilupp0/SEO-Testing-Tool.git
cd SEO-Testing-Tool
npm install
npm run demo
```

Una volta completato, esplora i risultati:

```bash
seo-tool list
seo-tool status <ID>
seo-tool export <ID>
```

> L'ID viene mostrato al termine di `npm run demo`. Puoi usare anche solo i primi 8 caratteri.

## Sviluppo (da sorgente)

```bash
git clone https://github.com/svilupp0/SEO-Testing-Tool.git
cd SEO-Testing-Tool
npm install
cp .env.example .env
```

### Variabili d'ambiente (.env)

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Opzionale: default ~/.seo-tool/data.db
# DATABASE_URL=file:/percorso/personalizzato/data.db
```

### Comandi sviluppo

```bash
# Esegui comandi senza build
npx tsx src/cli.ts <comando>

# Lancia test
npm test

# Test con UI
npm run test:ui

# Test con coverage
npm run test:coverage

# Setup database manuale (normalmente auto-migra)
npm run db:push

# Verifica connessione DB
npm run smoke-test

# Lint
npm run lint

# Format
npm run format
```

## Deploy su Railway (opzionale)

Il progetto include configurazione per Railway con cron job notturno e database SQLite embedded.

### Setup Railway

1. Crea un nuovo progetto su [Railway](https://railway.app)
2. Collega il repository Git
3. Railway rilevera' automaticamente `railway.json` e `Dockerfile`
4. Configura le variabili d'ambiente nel pannello Railway (credenziali Google, ecc.)

### Cron Job

Il cron job (`railway.json`) esegue `npm run cli:run` ogni notte alle **03:00 UTC**:
- Recupera nuovi dati da Google Search Console
- Esegue analisi statistica (Welch's t-test)
- Invia notifiche se i risultati sono statisticamente significativi

### Build manuale Docker

```bash
npm run build
docker build -t seo-testing-tool .
docker run --env-file .env seo-testing-tool
```

## Architettura

```
src/
  cli.ts                          Entry point CLI (commander)
  cli/commands.ts                 Comandi: login, add, list, status, run, export, delete
  cli/formatters.ts               Colori, tabelle, grafici ASCII
  demo.ts                         Script per generazione dati demo
  index.ts                        Entry point cron job
  stats/
    StatisticalEngine.ts          Welch's t-test, outlier detection
    TDistribution.ts              Distribuzione t (calcolo p-value)
  config/
    AnalysisConfig.ts             Soglie configurabili
    env.ts                        Config OAuth2
  database/
    db.ts                         Connessione Drizzle + SQLite
    schema.ts                     Schema database (Drizzle ORM)
    DatabaseService.ts            CRUD, transazioni, aggregati, paginazione
    TimeSeriesService.ts          Gap detection, recovery
  orchestrator/
    SEOExperimentOrchestrator.ts  GSC -> Analisi -> Risultati
  services/
    ExportService.ts              Export Excel/CSV
drizzle/                          Migrazioni e meta-dati SQL
railway.json                      Config deploy Railway (cron 03:00 UTC)
Dockerfile                        Build container Node.js 18+
```

## Limiti dichiarati (by design)

- Non funziona su siti piccoli (traffico insufficiente per significativita' statistica)
- Non e' realtime (richiede tempo per raccogliere dati)
- Non garantisce risultati (fornisce probabilita', non certezze)

Questi limiti aumentano la fiducia nel tool.

## Documentazione

- **[PROGRESS.md](./PROGRESS.md)** — Progresso implementazione
- **[blueprint.md](./blueprint.md)** — Specifica tecnica completa

## Licenza

MIT

---

**Versione:** 1.0.0 Stable
**Last Updated:** 2026-02-17
