# VELOCITY

> Local-first marathon training console for serious runners.

> **Note:** this product was originally branded *Night Ninjas Shadow Tracker*.
> As of 2026, it has been rebranded to **VELOCITY**. The codebase folder,
> `package.json` name, and GitHub repository retain the original name to
> avoid disruptive renames; all UI surfaces show VELOCITY.
> See [`BRAND.md`](./BRAND.md) for the rebrand spec.

This README is for **installing and running** the app. If you want to know
how to *use* it as a runner - what the screens do, what the words mean,
what to do when life happens - the in-app **Reference** page is where to
look. Open `http://localhost:3000/help` once you have the dev server
running, or read the source at `app/(app)/help/page.tsx`.

---

## What it does (one paragraph)

Pulls your training data from Strava and compares it against a real plan
(Hansons, Pfitzinger, Daniels, Lydiard, Higdon, Polarised, Ultra, or Custom).
Tells you what you were meant to do, what you actually did, and where the
gaps are. No cloud, no subscription, no telemetry. Your data stays on
your machine.

For where the product is going, see [`ROADMAP.md`](./ROADMAP.md). For
brand identity, see [`BRAND.md`](./BRAND.md). For visual tokens and
design rules, see [`DESIGN.md`](./DESIGN.md).

---

## Install

### Requirements

- **Node.js 22 LTS** (22.13+ avoids ESLint engine warnings)
- **A Strava account** with at least one activity logged
- **Native build chain** for `better-sqlite3` and `keytar`:
  - Windows: usually works out of the box on Node 22 with prebuilt binaries.
    If not, install Visual Studio Build Tools 2022 with the "Desktop
    development with C++" workload.
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` + `libsecret-1-dev`

### First-time install

```bash
cd night-ninjas-shadow-tracker
npm install        # ~30s with prebuilt binaries; ~3min if compiling from source
npm run dev        # starts dev server on http://localhost:3000
```

Open the URL. The first-run wizard guides you through Strava setup, plan
selection, and an initial 90-day sync.

### After the first install — use the checker

A `check.ps1` script lives in the project root. It:

- Kills any orphan Node/Next dev server processes
- Strips UTF-8 BOMs from all `.ts`/`.tsx` files (Turbopack chokes on them)
- Verifies the project structure matches what the app expects
- Verifies dependencies installed
- Auto-applies any pending DB migrations from `lib/db/migrations/`
- Reports status

```powershell
# First time only — allow local script execution if blocked
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Then any time after extracting a new zip:
.\check.ps1
npm run dev
```

The checker is idempotent — safe to run as many times as you want.

---

## Where data lives

| What | Path |
|---|---|
| SQLite DB | `%APPDATA%\NightNinjas\` (Windows) · `~/Library/Application Support/NightNinjas/` (macOS) · `~/.config/night-ninjas/` (Linux) |
| Strava `client_secret` + tokens | OS keychain — service `NightNinjas-ShadowTracker` |
| Project source | The folder you extracted the zip into |

To wipe everything: delete the data directory above + clear the keychain
entry. Or use Settings → "Wipe everything" once that screen is built out.

---

## Architecture (developer reference)

```
┌──────────────────────────────┐
│  Next.js 16 App Router       │
│  · Server Components         │
│  · Server Actions            │
└────────┬─────────────────────┘
         │
    ┌────┴─────────────────────┐
    │                          │
┌───▼───────────┐   ┌──────────▼──────────────┐
│ better-sqlite3│   │ keytar (OS keychain)    │
│ + Drizzle ORM │   │ — Strava credentials    │
└───────────────┘   └─────────────────────────┘
         │
    ┌────┴────────────────────────────┐
    │ Strava API (only outbound call) │
    │ + GitHub iCal (annual fetch)    │
    └─────────────────────────────────┘
```

### Key directories

```
app/
├── (app)/              Main authenticated app
│   ├── patrol/         Daily dashboard
│   ├── recon/          Weekly compliance (placeholder)
│   ├── strike/         Best week analysis (placeholder)
│   ├── dojo/           Plan management (placeholder)
│   ├── calendar/       Races, group runs, events — full CRUD
│   ├── journal/        Wellness tracking (placeholder)
│   ├── settings/       System config (placeholder)
│   └── help/           In-app user docs
├── setup/              7-step first-run wizard
└── api/                Server endpoints (Strava OAuth, sync)

lib/
├── db/                 Drizzle schema + connection + migrations
├── plans/              Plan engines (Hansons, Lydiard, Custom)
├── sources/            External data — Strava API, sync runner, NZ holidays
├── actions/            Server actions for forms
├── store/              Settings + secrets layer
├── analysis/           Best-week, compliance computation
├── data/               Cached/derived data accessors
└── constants/          Shared keys (kept out of 'use server' files)

components/
├── brand/              Logo, Wordmark
├── ui/                 Button, Card, Input, Stat, Stepper, EmptyState
├── nav/                Sidebar
├── calendar/           Sections used by both wizard + /calendar page
└── sync/               Live progress, status banner
```

### Schema

10 SQLite tables. Run `npm run db:studio` to browse them in Drizzle Studio.

| Table | Purpose |
|---|---|
| `activities` | Synced Strava activities (one source of truth) |
| `plans` | User's active plan + history |
| `journal` | Daily wellness entries |
| `settings` | App key/value config |
| `sync_log` | Legacy sync audit trail |
| `sync_jobs` | Stateful, resumable sync runs |
| `races` | Goal race + tune-ups |
| `recurring_sessions` | Weekly group runs |
| `calendar_events` | Holidays, trips, sickness |
| `nz_holidays` | Cached public holidays from sohnemann iCal |

### Plan engines

Each plan implements `PlanEngine` (see `lib/plans/types.ts`). To add a new plan:

1. Create `lib/plans/your-plan.ts` exporting a `PlanEngine`
2. Register it in `lib/plans/index.ts`
3. Done — wizard, dojo picker, and compliance pick it up automatically

### Sync runner

The Strava sync is a **stateful job runner**, not a one-shot fetch. Each
sync creates a `sync_jobs` row tracking status (`pending` → `running` →
`completed`/`paused`/`rate_limited`/`failed`), cursor position, and progress.

If a sync is interrupted (process killed, network drop, computer sleep),
the next page render of `/patrol` or `/calendar` calls
`detectInterruptedJobs()` which flips orphans (`running` jobs without a
heartbeat in 60s) to `paused`. The user sees a banner with a Resume button.

If Strava returns a 429, the runner pauses with `rate_limited` status and
a `rate_limit_resets_at` timestamp. The banner shows the countdown.

---

## Development scripts

```bash
npm run dev           # Start dev server (Turbopack)
npm run build         # Production build
npm run start         # Run production build
npm run lint
npm run db:generate   # Generate Drizzle migrations from schema changes
npm run db:migrate    # Apply pending migrations
npm run db:studio     # Open Drizzle Studio (DB browser at localhost:4983)
```

When you change `lib/db/schema.ts`, also write a corresponding migration
SQL file in `lib/db/migrations/NNNN_description.sql`. The checker applies
these automatically on next run.

---

## Privacy

| Question | Answer |
|---|---|
| Does my data leave this machine? | No |
| Is there telemetry? | No. `NEXT_TELEMETRY_DISABLED=1` is set by default |
| Where do my Strava tokens live? | OS keychain |
| What outbound network calls? | `strava.com` for OAuth + sync; one annual GitHub fetch for NZ public holidays |
| Does it work offline? | Yes — except syncing new activities |

---

## License

Personal use. Built for and used by the Night Ninjas community
(`nightninjas.run`, est. 2016). The Night Ninjas brand and "est. 2016" mark
are not licensed for redistribution outside the community.
