# SEO Testing Tool v1.0.0

Strumento CLI per esperimenti SEO con analisi statistica (Welch's t-test), integrazione Google Search Console. Database SQLite locale (zero configurazione).

## Visione

Rispondere in modo affidabile alla domanda:
**"Questa modifica SEO ha probabilmente migliorato o peggiorato le performance su Google?"**

Il tool non promette certezze, ma supporta decisioni informate attraverso analisi statistica rigorosa.

## Prerequisiti

- Node.js >= 18
- Credenziali OAuth2 Google (per integrazione GSC)

> Il database SQLite viene creato automaticamente in `~/.seo-tool/data.db` al primo avvio. Non serve installare nulla.

## Installazione

```bash
# Clona il repository
git clone <repo-url>
cd seo-testing-tool

# Installa dipendenze
npm install

# Configura variabili d'ambiente
cp .env.example .env
# Modifica .env con le tue credenziali
```

### Variabili d'ambiente (.env)

```env
# Opzionale: default ~/.seo-tool/data.db
# DATABASE_URL=file:/percorso/personalizzato/data.db
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
USER_ID=default-user
```

### Setup database

```bash
# Genera Prisma Client
npm run db:generate

# Crea le tabelle nel database SQLite
npm run db:push
```

### Verifica connessione DB

```bash
npm run smoke-test
```

## Installazione come comando globale

```bash
# Registra il comando globale (non serve compilare)
npm link

# Ora puoi usare il tool da qualsiasi directory
seo-tool --help
```

Per rimuovere il comando globale:

```bash
npm unlink -g seo-testing-tool
```

## Comandi CLI

| Comando | Descrizione |
|---------|-------------|
| `seo-tool add` | Crea un nuovo test SEO (prompt interattivi) |
| `seo-tool list` | Mostra tabella con tutti i test |
| `seo-tool status <id>` | Dettaglio test con analisi statistica e grafico ASCII |
| `seo-tool run` | Sincronizza tutti i test attivi (fetch GSC + analisi) |
| `seo-tool export <id>` | Esporta metriche in CSV |
| `seo-tool delete <id>` | Elimina un test (con conferma interattiva) |

Tutti i comandi che accettano `<id>` supportano **ID parziali** (es. `seo-tool status abcd`).

### Esempi

```bash
# Crea un nuovo test
seo-tool add

# Elenca tutti i test
seo-tool list

# Visualizza dettaglio con grafico ASCII
seo-tool status abcd1234

# Sincronizza dati da GSC
seo-tool run

# Esporta in CSV
seo-tool export abcd1234

# Elimina un test (chiede conferma)
seo-tool delete abcd1234
```

## Sviluppo

```bash
# Esegui comandi senza build (sviluppo)
npx tsx src/cli.ts <comando>

# Lancia test
npm test

# Test con UI
npm run test:ui

# Test con coverage
npm run test:coverage

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
3. Railway rileverà automaticamente `railway.json` e `Dockerfile`
4. Configura le variabili d'ambiente nel pannello Railway (credenziali Google, ecc.)

### Cron Job

Il cron job (`railway.json`) esegue `npm run cli:run` ogni notte alle **03:00 UTC**:
- Recupera nuovi dati da Google Search Console
- Esegue analisi statistica (Welch's t-test)
- Invia notifiche se i risultati sono statisticamente significativi

### Build manuale Docker

```bash
# Compila TypeScript
npm run build

# Build immagine
docker build -t seo-testing-tool .

# Run
docker run --env-file .env seo-testing-tool
```

## Architettura

```
src/
  cli.ts                          Entry point CLI (commander)
  cli/commands.ts                 6 comandi: add, list, status, run, export, delete
  cli/formatters.ts               Colori, tabelle, grafici ASCII
  index.ts                        Entry point cron job
  smoke-test.ts                   Verifica connessione DB
  stats/
    StatisticalEngine.ts          Welch's t-test, outlier detection, stagionalita'
    TDistribution.ts              Distribuzione t (Lanczos + Lentz)
  config/
    AnalysisConfig.ts             Soglie configurabili
    env.ts                        Config OAuth2
  database/
    prisma.ts                     Singleton lazy Prisma (SQLite)
    DatabaseService.ts            CRUD, transazioni, aggregati, paginazione
    TimeSeriesService.ts          Gap detection, recovery
  orchestrator/
    SEOExperimentOrchestrator.ts  Orchestratore centrale (GSC -> analisi -> notifiche)
  notifications/                  Alert, report settimanali
  monitoring/                     URL redirect, domain migration, traffic detection
  ui/                             Loading indicators, responsive, export
prisma/
  schema.prisma                   4 modelli: User, Test, Metric, AuditLog
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
**Last Updated:** 2026-02-10
