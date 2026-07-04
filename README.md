# GHOST

A zero-cost PWA fork of VELOCITY (Night Ninjas training tracker). Same training-science brain, completely different shell.

**Goal**: One React bundle that runs as a web PWA, iPhone home-screen app, Android app, and native Windows/macOS desktop — with zero backend except one Cloudflare Worker for the Strava OAuth token swap.

---

## Quick start

```bash
npm install
npm run dev          # dev server at localhost:5173
npm run build        # production build → dist/
npm test             # 474 pure-engine tests
```

First run: navigate to `/setup`, connect Strava, and sync your activities.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Vite 6 + React 19 + React Router 7 |
| Database | wa-sqlite (SQLite in browser via WASM) |
| Storage | AccessHandlePoolVFS (OPFS) · MemoryVFS fallback |
| Styling | Tailwind CSS 4 (Vite plugin) |
| PWA | vite-plugin-pwa + Workbox |
| Desktop | Tauri 2 (~5 MB installer, unsigned) |
| OAuth proxy | Cloudflare Worker (the only server code) |
| Tests | Vitest — 474 pure-engine tests |
| Hosting | Cloudflare Pages (free) |

---

## Screens (14 routes)

| Route | Screen | What it does |
|---|---|---|
| `/setup` | Setup | Strava OAuth, client ID entry, activity sync |
| `/patrol` | Patrol | Dashboard — streak, weekly summary, compliance snapshot |
| `/recon` | Recon | 6-month volume trends, zone distribution, CTL/ATL chart |
| `/strike` | Strike | 8-week athlete state — CTL/ATL/TSB, intensity history, mileage |
| `/dojo` | Dojo | Training methodology picker + macrocycle shape card |
| `/calendar` | Calendar | Goal race, tune-ups, capacity caps, commitments |
| `/race` | Race | Pace plans (3 strategies), fueling, carb-load, taper, post-race |
| `/vo2max` | VO2 Max | Cooper/Rockport/Lab test capture, trend sparkline, insights |
| `/coach-log` | Coach Log | Daily wellness — sleep/energy/stress emoji log, 42-day history |
| `/journal` | Journal | 35-day training diary calendar — activity dots, day detail |
| `/profile` | Profile | Athlete profile, HR zones, strength preferences |
| `/shoes` | Shoes | Gear tracking with distance progress bars |
| `/club` | Club | 4-week summary + clipboard share text generator |
| `/settings` | Settings | Strava status, sync history, data export, wipe |
| `/help` | Help | Static reference — glossary, tasks, troubleshooting, privacy |

---

## Architecture

```
src/
  main.tsx          Entry — BrowserRouter + DbProvider + App
  App.tsx           React Router routes (14 screens + /setup)
  index.css         Tailwind 4 @theme tokens (ink/bone/accent/signal)
  db/
    worker.ts       wa-sqlite Web Worker — OPFS VFS, migrations runner
    client.ts       postMessage async bridge (query / exec)
    DbContext.tsx   React context — DB ready state
    migrations.ts   Ordered SQL migrations (0001, 0002, 0003)
  routes/           One folder per screen
  components/       TopNav, PageSkeleton, shared UI
  lib/              Pure analysis engines (copied from VELOCITY, unchanged)
    analysis/       CTL/ATL, compliance, load, trends, VO2max, biometrics
    plans/          Capacity, pace compliance, recovery prescription
    coach/          Coach voice
    race/           Fueling, taper, execution, debrief, macrocycle
    ai/             Context builder
    weather/        Heat adjust
    garmin/         Activity mapper + types

oauth-worker/       Cloudflare Worker — Strava /oauth/token proxy
  wrangler.toml
  src/index.ts      /exchange + /refresh endpoints (30 lines)

src-tauri/          Tauri 2 desktop wrapper
  tauri.conf.json
  Cargo.toml
  src/main.rs + lib.rs
```

---

## Database

SQLite in the browser via wa-sqlite + OPFS. All data stays local — nothing is sent to a server.

**Migrations** (applied automatically on first load):

| Migration | Tables |
|---|---|
| `0001_initial` | activities, settings, shoes, journal, plans, plan_periods, races, calendar_events, sync_jobs |
| `0002_races_goal_level` | adds `is_goal` + `level` to races; creates `recurring_sessions` |
| `0003_race_results_vo2max` | race_results, vo2max_observations |

**Storage**: OPFS persists across page reloads (Chrome/Edge/Firefox). Falls back to MemoryVFS in Safari or private browsing — data lost on tab close. Storage label shown on Patrol.

---

## Data and privacy

- All data stored locally in the browser (OPFS / IndexedDB)
- Strava tokens stored encrypted in IndexedDB
- No analytics, no telemetry, no cloud sync
- Outbound calls: `strava.com` (OAuth + activity sync), Cloudflare Worker (token exchange), `api.open-meteo.com` (race-day weather, no auth required)

---

## Deployment

### Cloudflare Pages (PWA)

Push to `main` → GitHub Actions builds + deploys automatically via `deploy.yml`.

One-time setup:
1. Repo Settings → Pages → Source: GitHub Actions
2. Add secret `STRAVA_OAUTH_WORKER_URL` = your deployed Cloudflare Worker URL
3. Add secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Cloudflare Worker (OAuth proxy)

```bash
cd oauth-worker
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler deploy
```

### Desktop (Tauri)

Push a `v*` tag → GitHub Actions cross-builds Windows + macOS → draft GitHub Release.

Before first desktop release, generate Tauri icons:
```bash
npx @tauri-apps/cli icon src/assets/icon.png
# copy outputs to src-tauri/icons/
```

---

## Development scripts

```bash
npm run dev      # Vite dev server (localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm test         # Vitest (474 pure-engine tests)
npm run lint     # ESLint
```

---

## Relation to VELOCITY

GHOST is a fork of VELOCITY (night-ninjas-shadow-tracker). It shares:
- All pure analysis engines (`src/lib/*/`) — copied verbatim, same tests
- Design tokens (ink/bone/accent/signal colour system)
- DB schema (same tables, compatible structure)

It replaces:
- Next.js 15 + better-sqlite3 → Vite 6 + React 19 + wa-sqlite
- Electron desktop → Tauri 2
- Local-only desktop → installable PWA + optional desktop

GHOST does **not** yet include:
- Plan engines (hansons, pfitzinger, daniels, etc.) — pure support files exist, renderers not yet ported
- AI coach (needs Anthropic BYOK wiring)
- Garmin Connect sync
- Patrol compliance matrix (uses plan engine)
