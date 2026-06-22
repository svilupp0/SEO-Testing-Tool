# SEO Testing Tool v1.3.0

Did your SEO change actually work — or was it just random fluctuation?

**seo-testing-tool** connects to Google Search Console, compares traffic before and after your change, and tells you whether the difference is statistically significant. Local SQLite database, zero configuration.

## Vision

Reliably answer the question:
**"Did this SEO change likely improve or hurt performance on Google?"**

The tool does not promise certainty, but supports informed decisions through rigorous statistical analysis.

## Installation

```bash
npm install -g seo-testing-tool
```

Requires Node.js >= 18.

> **Build tools required on some platforms** (`better-sqlite3` is a native module):
> - **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
> - **Linux**: `sudo apt install python3 make g++` (Debian/Ubuntu) or equivalent
> - **macOS**: Xcode Command Line Tools — `xcode-select --install`

> The SQLite database is automatically created at `~/.seo-tool/data.db` on first run. No configuration needed.

## Getting Started

> **Prerequisite**: You need a Google Cloud project with the **Google Search Console API** enabled.
> Enable it at [console.cloud.google.com/apis/library/searchconsole.googleapis.com](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) before running `seo-tool setup`. Without this step, `seo-tool run` will fail with a 403 error.

```bash
# 1. Configure Google OAuth2 credentials (interactive wizard)
seo-tool setup

# 2. Connect your Google Search Console account
seo-tool login

# 3. Create a new SEO test (interactive prompts)
seo-tool add

# 4. Fetch data from GSC and analyze
seo-tool run
```

## Quick Start (Demo)

Want to try the tool without configuring Google Search Console?

```bash
seo-tool demo
```

Generates two experiments with **70 days of simulated metrics** (realistic statistical noise via Box-Muller):

- **Positive Experiment** — +46% click increase in the post period (p-value < 0.01)
- **Neutral Experiment** — no significant difference between pre and post

Then explore the results:

```bash
seo-tool list
seo-tool status <ID>
seo-tool export <ID>
```

> The ID is shown at the end of `seo-tool demo`. You can use just the first 8 characters.

## CLI Commands

| Command                | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `seo-tool setup`       | Interactive wizard to configure Google OAuth2 credentials                        |
| `seo-tool demo`        | Generate demo data (2 experiments, 70 simulated days — no Google account needed) |
| `seo-tool login`       | Connect Google account (OAuth2 for Search Console)                               |
| `seo-tool add`         | Create a new SEO test (interactive prompts)                                      |
| `seo-tool list`        | Show table of all tests                                                          |
| `seo-tool status <id>` | Test detail with statistical analysis and ASCII chart                            |
| `seo-tool run`         | Sync all active tests (fetch GSC + analyze)                                      |
| `seo-tool export <id>` | Export metrics to Excel or CSV                                                   |
| `seo-tool delete <id>` | Delete a test (with interactive confirmation)                                    |

All commands that accept `<id>` support **partial IDs** (e.g. `seo-tool status abcd`). If multiple tests share the same prefix, the tool lists all matches and asks you to be more specific.

### Examples

```bash
# Configure credentials
seo-tool setup

# Connect Google Search Console
seo-tool login

# Create a new test
seo-tool add

# List all tests
seo-tool list

# View detail with ASCII chart
seo-tool status abcd1234

# Sync data from GSC
seo-tool run

# Export to Excel
seo-tool export abcd1234 --format xlsx

# Export to CSV
seo-tool export abcd1234 --format csv

# Export (interactive prompt to choose format)
seo-tool export abcd1234

# Delete a test (asks for confirmation)
seo-tool delete abcd1234
```

## Example Output

After running `seo-tool demo`, here is what the main commands look like:

**`seo-tool list`**
```
  2 test trovati

  ID        Nome                  Stato      p-Value   Migliora.   Ultimo Sync
  ──────────────────────────────────────────────────────────────────────────────
  a1b2c3d4  Esperimento Positivo  completed  0.0010    +46.6%      22/6/2026
  e5f6g7h8  Esperimento Neutro    running    0.7200    +1.2%       22/6/2026
```

**`seo-tool status a1b2c3d4`**
```
  Esperimento Positivo
  ────────────────────────────────────────

  ID:          a1b2c3d4-...
  Sito:        sc-domain:example.com
  Stato:       completed
  Inizio:      1/1/2024
  Split Date:  1/3/2024

  Analisi Statistica
  ────────────────────────────────────────
  Risultato:   SIGNIFICATIVO
  p-Value:     0.0010
  Variazione:  ↑ +46.6%
  t-Statistic: 3.4567
  Gradi lib.:  68.0

  Dati
  ────────────────────────────────────────
  Before:      1500.0 media clicks  (35 giorni)
  After:       2200.0 media clicks  (35 giorni)

  Trend Clicks
  ────────────────────────────────────────
  2200 ┤                         ╭────────
  1850 ┤              ╭──────────╯
  1500 ┼──────────────╯
       ──────────────▲──────────────────
                  Split Date
```

**`seo-tool run`**
```
  Sincronizzazione Test Attivi
  ────────────────────────────────────────

  Avvio sincronizzazione...

  ✔ a1b2c3d4  +46.6%  p=0.0010
  ○ e5f6g7h8  +1.2%   p=0.7200

  ────────────────────────────────────────
  2 completati · 0 errori
```

> **Note on data latency**: Google Search Console data typically has a 2–4 day delay.
> If `seo-tool run` shows no new data after a recent change, this is expected — try again in a few days.

## Development (from source)

```bash
git clone https://github.com/svilupp0/SEO-Testing-Tool.git
cd SEO-Testing-Tool
npm install
cp .env.example .env
```

### Environment Variables (.env)

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Optional: default ~/.seo-tool/data.db
# DATABASE_URL=file:/custom/path/data.db

# Optional: webhook for notifications (coming soon — not yet active)
# NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

### Development Commands

```bash
# Run commands without build
npx tsx src/cli.ts <command>

# Run tests
npm test

# Tests with UI
npm run test:ui

# Tests with coverage
npm run test:coverage

# Manual database setup (normally auto-migrates)
npm run db:push

# Verify DB connection
npm run smoke-test

# Lint
npm run lint

# Format
npm run format
```

## Deploy on Railway (optional)

Use Railway if you want `seo-tool run` to sync automatically every night without keeping your machine on. For local or CI use, skip this section.

The project includes configuration for Railway with a nightly cron job and embedded SQLite database.

### Railway Setup

1. Create a new project on [Railway](https://railway.app)
2. Connect the Git repository
3. Railway will automatically detect `railway.json` and `Dockerfile`
4. Configure environment variables in the Railway panel (Google credentials, etc.)

### Cron Job

The cron job (`railway.json`) runs `npm run cli:run` every night at **03:00 UTC**:

- Fetches new data from Google Search Console
- Runs statistical analysis (Welch's t-test)
- Updates test results in the local database

### Manual Docker Build

```bash
npm run build
docker build -t seo-testing-tool .
docker run --env-file .env seo-testing-tool
```

## Architecture

```
src/
  cli.ts                          CLI entry point (commander)
  cli/commands.ts                 Commands: setup, demo, login, add, list, status, run, export, delete
  cli/formatters.ts               Colors, tables, ASCII charts
  demo.ts                         Demo data generator
  index.ts                        Cron job entry point
  stats/
    StatisticalEngine.ts          Welch's t-test, outlier detection
    TDistribution.ts              t-distribution (p-value calculation)
  config/
    AnalysisConfig.ts             Configurable thresholds
    env.ts                        OAuth2 config
  database/
    db.ts                         Drizzle + SQLite connection
    schema.ts                     Database schema (Drizzle ORM)
    DatabaseService.ts            CRUD, transactions, aggregates, pagination
    TimeSeriesService.ts          Gap detection, recovery
  orchestrator/
    SEOExperimentOrchestrator.ts  GSC -> Analysis -> Results
  services/
    ExportService.ts              Excel/CSV export
drizzle/                          SQL migrations and metadata
railway.json                      Railway deploy config (cron 03:00 UTC)
Dockerfile                        Node.js 18+ container build
```

## Minimum Traffic Requirements

The Welch's t-test needs enough data to detect real changes. As a guideline:

- **~50 click/day** minimum (averaged over the monitoring period)
- **7+ days** of data in both the "before" and "after" periods
- Sites with fewer than ~1,500 clicks/month are unlikely to produce significant results

The tool will warn you if data is insufficient, but won't prevent you from running the test.

## Declared Limits (by design)

- Does not work on small sites (insufficient traffic for statistical significance)
- Not realtime (requires time to collect data)
- Does not guarantee results (provides probabilities, not certainties)

These limits increase trust in the tool.

## License

MIT

---

**Version:** 1.3.0
**Last Updated:** 2026-06-22
