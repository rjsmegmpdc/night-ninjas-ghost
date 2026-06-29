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
- **Database**: wa-sqlite + IDBMirrorVFS (SQLite in browser via IndexedDB — no COOP/COEP headers needed)
- **Styling**: Tailwind CSS 4 (Vite plugin)
- **PWA**: vite-plugin-pwa + Workbox service worker
- **Desktop**: Tauri 2 (~3–8 MB installer, unsigned)
- **OAuth proxy**: Cloudflare Worker (30 lines — the only server code)
- **AI**: Anthropic SDK direct from browser, BYOK, `dangerouslyAllowBrowser`
- **Tests**: Vitest — pure `*-pure.ts` engine tests from VELOCITY, unchanged
- **Hosting**: GitHub Pages (free) + GitHub Releases for desktop installers

## Architecture

```
src/
  main.tsx          Entry point — BrowserRouter + DbProvider + App
  App.tsx           React Router routes (14 screens + /setup)
  index.css         Tailwind 4 @theme tokens (VELOCITY design system)
  db/
    worker.ts       wa-sqlite Web Worker (IDBMirrorVFS, IndexedDB backend)
    client.ts       Main-thread async bridge to the worker
    DbContext.tsx   React context — ready state for DB init
    migrations.ts   Ordered SQL migrations (same schema as VELOCITY)
  routes/           One folder per screen — port from VELOCITY app/(app)/
  components/       Shared UI (TopNav, PageSkeleton, …)
  lib/              Pure analysis engines copied from VELOCITY (unchanged)
    analysis/       *-pure.ts: compliance, monotony, trends, …
    plans/          *-pure.ts: 9 plan engines (Base, Norwegian, etc.)
    coach/          *-pure.ts: coach voice
    race/           *-pure.ts: fueling, taper, execution, debrief
    ai/             *-pure.ts: context builder
    weather/        *-pure.ts: heat adjust
    garmin/         mapper

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

## GitHub Actions

| Workflow | Trigger | Output |
|---|---|---|
| `deploy.yml` | push to main | GitHub Pages PWA |
| `worker.yml` | push to main (oauth-worker/**) | Cloudflare Worker |
| `desktop.yml` | push v* tag | Draft GitHub Release (.exe + .dmg) |

## GitHub Pages setup (one-time, manual)

1. Repo Settings → Pages → Source: GitHub Actions
2. Add secret `STRAVA_OAUTH_WORKER_URL` = your deployed Worker URL
3. Add Cloudflare secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

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
