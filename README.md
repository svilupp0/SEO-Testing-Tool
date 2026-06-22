# SEO Testing Tool v1.2.1

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

Requires Node.js >= 18. On some platforms `better-sqlite3` may require build tools (python, make).

> The SQLite database is automatically created at `~/.seo-tool/data.db` on first run. No configuration needed.

## Getting Started

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

All commands that accept `<id>` support **partial IDs** (e.g. `seo-tool status abcd`).

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

# Optional: webhook for notifications (Slack, Discord, n8n, Zapier, etc.)
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
- Sends notifications if results are statistically significant

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

## Documentation

- **[PROGRESS.md](./PROGRESS.md)** — Implementation progress
- **[blueprint.md](./blueprint.md)** — Full technical specification

## License

MIT

---

**Version:** 1.1.0
**Last Updated:** 2026-04-30
