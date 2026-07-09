# CLAUDE.md — GHOST Project Contract

## Startup ritual (read this first, every session)

1. Read `PROGRESS.md` — if it doesn't exist, create it from the template below
2. Read `PHASES.md` current state section
3. `git status` + `git log --oneline -5`
4. If `AGENT_STOP` exists in the project root, stop immediately
5. Proceed

## Stop ritual

1. Update `PROGRESS.md`
2. Push any `feat/` branch with uncommitted work

## What GHOST is

A fork of VELOCITY (night-ninjas-shadow-trackerv2). Same training-science brain, completely different shell.

**Goal**: One React bundle that runs as a web PWA, iPhone home-screen app, Android app, and native Windows/macOS desktop — with zero backend except one Cloudflare Worker for the Strava OAuth token swap.

**Stack**:
- **Framework**: Vite 6 + React 19 + React Router 7
- **Database**: wa-sqlite (SQLite in browser via WASM)
- **Storage**: AccessHandlePoolVFS (OPFS) — persistent; falls back to MemoryVFS if OPFS unavailable
- **Styling**: Tailwind CSS 4 (Vite plugin)
- **PWA**: vite-plugin-pwa + Workbox service worker
- **Desktop**: Tauri 2 (~5 MB installer, unsigned)
- **OAuth proxy**: Cloudflare Worker (30 lines — the only server code)
- **Tests**: Vitest — 597+ tests covering pure analysis engines, sync, and UI smoke tests
- **Hosting**: Cloudflare Pages (free) + GitHub Releases for desktop installers

## Architecture

```
src/
  main.tsx          Entry point — BrowserRouter + DbProvider + App
  App.tsx           React Router routes (14 screens + /setup)
  index.css         Tailwind 4 @theme tokens (VELOCITY design system)
  db/
    worker.ts       wa-sqlite Web Worker (OPFS VFS + MemoryVFS fallback)
    client.ts       Main-thread async bridge to the worker
    DbContext.tsx   React context — ready state + storage label
    migrations.ts   Ordered SQL migrations (0001, 0002, 0003)
  routes/           One folder per screen (all 14 implemented)
  components/       Shared UI (TopNav, PageSkeleton, …)
  lib/              Pure analysis engines copied from VELOCITY (unchanged)
    analysis/       *-pure.ts: load, trends, athlete-state, vo2max, biometrics, compliance…
    plans/          *-pure.ts: capacity, pace-compliance, recovery, state-awareness
    coach/          *-pure.ts: coach voice
    race/           *-pure.ts: fueling, taper, execution, debrief, macrocycle
    ai/             *-pure.ts: context builder
    weather/        *-pure.ts: heat adjust
    garmin/         mapper + types

oauth-worker/       Cloudflare Worker — Strava /oauth/token proxy
  wrangler.toml
  src/index.ts

src-tauri/          Tauri 2 desktop wrapper (Rust shell, minimal)
  tauri.conf.json
  Cargo.toml
  src/main.rs
  src/lib.rs
```

## Critical rules

- **Never commit to `main` directly** — always `git checkout -b feat/<name>` first
- **No PR required** — this is `github.com/rjsmegmpdc`; branch discipline applies, Matt merges directly
- **Pure functions only in `*-pure.ts`** — no browser APIs, no worker imports; safe to test with Vitest node env
- **UTC date arithmetic** — `new Date(isoStr + 'T00:00:00Z')` + `.getUTC*()` everywhere
- **Worker is async** — all DB reads/writes are `await query(sql, params)` — no synchronous DB calls exist

## DB access pattern

```typescript
// ✅ Correct — async query via worker bridge
import { query } from '@/db/client';
const rows = await query('SELECT * FROM activities WHERE start_date >= ?', [startIso]);

// ❌ Never — better-sqlite3 / server-only imports don't exist here
import { getDb } from '@/db'; // this file does not exist in GHOST
```

## Strava OAuth flow

```
Browser → strava.com/oauth/authorize (redirect)
       ← strava.com redirects back with ?code=xxx
Browser → POST https://ghost-strava-oauth.<account>.workers.dev/exchange { code }
Worker  → POST strava.com/oauth/token (with client_secret)
       ← { access_token, refresh_token, athlete }
Browser stores tokens encrypted in IndexedDB
```

## DB schema — current tables

| Table | Added in | Purpose |
|---|---|---|
| `activities` | 0001 | Synced Strava activities |
| `settings` | 0001 | Key/value app config |
| `shoes` | 0001 | Gear inventory |
| `journal` | 0001 | Daily wellness entries |
| `plans` | 0001 | Selected training methodology + params |
| `plan_periods` | 0001 | Date-bound plan period rows |
| `races` | 0001 | Goal race + tune-ups |
| `calendar_events` | 0001 | Holidays, trips, sickness, commitments |
| `sync_jobs` | 0001 | Strava sync job state |
| `recurring_sessions` | 0002 | Weekly group runs |
| `race_results` | 0003 | Post-race debrief data |
| `vo2max_observations` | 0003 | VO2max readings (Cooper/Rockport/Lab/device) |

Migration 0002 also adds `is_goal INTEGER` and `level TEXT` columns to `races`.

## GitHub Actions

| Workflow | Trigger | Output |
|---|---|---|
| `deploy.yml` | push to main | Cloudflare Pages PWA |
| `worker.yml` | push to main (oauth-worker/**) | Cloudflare Worker |
| `desktop.yml` | push v* tag | Draft GitHub Release (.exe + .dmg) |

## Cloudflare Pages setup (one-time, manual)

1. Connect repo to Cloudflare Pages (Dashboard → Workers & Pages → Create)
2. Add secret `STRAVA_OAUTH_WORKER_URL` = your deployed Worker URL
3. Add secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## Tauri icons (before first desktop release)

Add to `src-tauri/icons/`: 32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico.
Use `npx @tauri-apps/cli icon src/assets/icon.png` to generate all sizes from one source.

## PROGRESS.md template

```markdown
## Branch
feat/<name>

## Session: <YYYY-MM-DD>

### Completed
-

### In progress
-

### Blocked
-

### Next session should
-

## Key decisions
-

## Files changed
-
```
