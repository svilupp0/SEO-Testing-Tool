# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Development Commands

```bash
# CLI — development (no build required)
npx tsx src/cli.ts <command>     # Run any CLI command directly
npm run dev:cli                  # Alias for the above

# CLI — after npm link
seo-tool <command>               # Run installed global binary

# Testing
npm test                         # Run all tests (vitest watch)
npx vitest run                   # Run once, no watch
npm run test:ui                  # Vitest browser UI
npm run test:coverage            # Coverage report
npm run test:e2e                 # E2E tests (requires npm run build first)
npm run smoke-test               # Verify DB connection only

# Build
npm run build                    # Compile TypeScript → dist/

# Database
npm run db:generate              # Generate new Drizzle migration
npm run db:push                  # Push schema directly (dev only)
npm run db:migrate               # Run pending migrations
npm run db:studio                # Open Drizzle Studio in browser

# Utilities
npm run demo                     # Generate demo data (requires git clone — not in npm package)
npm run lint                     # ESLint
npm run format                   # Prettier
```

## Architecture Overview

### What This Is

A CLI tool for statistical SEO testing. It connects to Google Search Console via OAuth2, collects daily click/impression metrics, and applies **Welch's t-test** to determine whether an SEO change had a statistically significant effect on performance.

### Project Structure

```
src/
├── cli.ts                           # Entry point: commander setup, migrateDB() on startup
├── cli/
│   ├── commands.ts                  # 7 commands: login, add, list, status, run, export, delete
│   └── formatters.ts                # chalk colors, cli-table3 tables, asciichart graphs
├── stats/
│   ├── StatisticalEngine.ts         # Welch's t-test + outlier detection + p-value
│   └── TDistribution.ts             # Self-contained t-distribution (Lanczos + Lentz)
├── database/
│   ├── db.ts                        # Lazy singleton Proxy, migrateDB(), closeDb()
│   ├── schema.ts                    # 5 tables: users, tests, metrics, oauthTokens, auditLogs
│   ├── DatabaseService.ts           # CRUD, aggregates, variance, pagination, cleanup
│   └── TimeSeriesService.ts         # Gap detection + gap_filled flag
├── auth/
│   ├── GoogleOAuthService.ts        # OAuth2 auth URL generation + code exchange
│   └── TokenManager.ts             # Token storage, refresh, expiry management
├── gsc/
│   ├── GSCDataFetcher.ts            # Google Search Console API calls
│   └── GSCPermissionService.ts      # Property permission checks
├── orchestrator/
│   └── SEOExperimentOrchestrator.ts # runExperiment() + syncAllActiveTests()
├── services/
│   └── ExportService.ts             # ExcelJS (2 sheets) + flat CSV export
├── notifications/
│   └── NotificationService.ts       # STUB — not yet implemented
├── config/
│   ├── AnalysisConfig.ts            # significanceLevel (0.05), minimumDataThreshold (10)
│   └── env.ts                       # OAuth2 env vars reader
├── index.ts                         # Cron job entry point (for Railway)
└── demo.ts                          # Demo data generator (SeededRng + Box-Muller, 70 days)

tests/
├── helpers/
│   ├── test-db.ts                   # createTestDb(), seedUser(), seedTest(), seedMetrics()
│   └── ...
├── auth/, cli/, database/, gsc/
├── integration/                     # full-oauth-flow.test.ts — 2 known failures (real API)
├── orchestrator/, services/, stats/

drizzle/                             # Auto-generated migrations (0000, 0001, 0002)
bin/
└── seo-tool.mjs                     # Dev wrapper: spawns tsx loader, no build needed
```

### Data Flow

```
seo-tool run
  → TokenManager (load saved OAuth tokens from DB)
  → SEOExperimentOrchestrator.syncAllActiveTests()
      → GSCDataFetcher (fetch metrics from Google Search Console API)
      → DatabaseService (save daily metrics)
      → StatisticalEngine.analyze() (Welch's t-test on before/after clicks)
      → DatabaseService (update test: status, p-value, improvement%)
      → NotificationService (STUB — does nothing yet)
```

### Database

- **ORM**: Drizzle ORM + better-sqlite3
- **Location**: `~/.seo-tool/data.db` (auto-created on first run via `mkdirSync`)
- **Auto-migrate**: `migrateDB()` runs at every CLI startup — no manual step needed
- **Dates**: stored as ISO text strings (`YYYY-MM-DD`) — convert with `new Date(str)` when needed
- **URLs**: stored as JSON text in `tests.urls`
- **Migrations**: in `drizzle/` — generate with `npm run db:generate`, never edit manually

## Conventions

1. **Package manager**: npm
2. **Module system**: ESM only — never use `require()` in source or test files
3. **Language**: TypeScript strict mode, ES2022 target
4. **UI language**: Italian — all user-facing messages, prompts, labels, and CLI output in Italian
5. **TDD methodology**: RED → GREEN → STOP — write the failing test first, then make it pass, then stop. Do not refactor speculatively.
6. **Test framework**: Vitest — use `generateNoisyData(mean, stdDev, n, seed)` for deterministic data; `toBeCloseTo(value, -1)` for noisy tolerance
7. **DB inserts**: use `.returning().get()` for single-row insert+return — never destructure `.returning()`
8. **Drizzle imports**: `eq`, `and`, `gte`, `lte`, `lt`, `like`, `desc`, `avg`, `count` from `drizzle-orm`
9. **Dependencies**: add runtime deps only if strictly necessary — prefer self-contained implementations (see `TDistribution.ts`)
10. **No build step in dev**: always use `npx tsx src/cli.ts` or `npm run dev:cli`
11. **Statistics**: use Welch's t-test (unequal variance), never Student's t-test

## Known Gotchas

- `better-sqlite3` is a native C++ module — on Windows requires Visual Studio Build Tools (python + make); fails silently without them
- `better-sqlite3` + vitest on Windows: segfault (exit 139) at process cleanup — tests still pass, this is a known upstream issue, ignore it
- `!isFinite(NaN)` returns `true` in JS — always check `isNaN()` **before** `!isFinite()` when validating numbers
- Arrays with constant values (zero variance) break Welch-Satterthwaite df — use single-sample df fallback
- `NotificationService.ts` is a stub — do not add logic there without first implementing the notification channel (see ROADMAP.md)
- 2 integration tests in `tests/integration/full-oauth-flow.test.ts` always fail — they require a real Google API connection, this is **expected and intentional**
- Dynamic imports (`await import(...)`) in orchestrator — check for them before deleting a referenced service

## Environment Variables

Required in `.env` before `seo-tool login` or `seo-tool run` will work:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
DATABASE_URL=~/.seo-tool/data.db   # optional — this is the default
```

Run `seo-tool setup` for an interactive wizard that opens Google Cloud Console and writes these variables to `.env` (supports JSON file upload or manual entry). `seo-tool login` now opens the browser automatically and captures the OAuth code via a local callback server on port 3000 — no copy-paste required. Falls back to manual code entry if port 3000 is busy.

## Pull Requests

- Base branch: always `main`
- Do NOT include "Generated with Claude Code" or any AI attribution in PR descriptions
- Do NOT add Co-Authored-By trailers to commit messages
