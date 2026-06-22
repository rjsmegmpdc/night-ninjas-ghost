# VELOCITY — Local-First Running Training Analysis

Welcome to VELOCITY, the official training companion for the Night Ninjas running club.

VELOCITY is a desktop app that tracks and analyzes your running training with precision. All your data stays on your machine—nothing is ever uploaded to the cloud.

## What VELOCITY does

VELOCITY pulls your training data from Strava and compares it against your chosen training plan (Hansons, Pfitzinger, Daniels, Lydiard, Higdon, Polarised, Ultra, Norwegian Singles, or Custom). It shows you what you were meant to do, what you actually did, and where the gaps are. No cloud, no subscription, no telemetry. Your data stays on your machine.

For development and brand identity, see [`BRAND.md`](./BRAND.md) and [`PHASES.md`](./PHASES.md).

---

## System requirements

- **Node.js 20.11.0+** and npm 9.0.0+
- **A Strava account** (for activity sync)
- **macOS 11+**, Windows 10+, or recent Linux
- **Native build dependencies** for `better-sqlite3` and `keytar`:
  - Windows: Usually built-in with Node 20+. If needed, install Visual Studio Build Tools 2022 with "Desktop development with C++".
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` + `libsecret-1-dev`

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/night-ninjas/velocity.git
   cd velocity
   npm install
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

3. Open your browser to `http://localhost:3000`.

On first run, a setup wizard will guide you through Strava connection, training plan selection, and data sync.

## Optional: Use the health checker

A `check.ps1` script (Windows) or shell equivalent helps verify your setup:

```powershell
# First time: allow local script execution
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# Then run:
.\check.ps1
npm run dev
```

The checker verifies dependencies, applies pending migrations, and reports status.

## Data and privacy

All your training data stays local and secure:

- **SQLite database**: `%APPDATA%\NightNinjas\shadow-tracker.db` (Windows) · `~/Library/Application Support/NightNinjas/` (macOS) · `~/.config/night-ninjas/` (Linux)
- **Strava credentials**: Stored securely in OS keychain (service: `NightNinjas-ShadowTracker`)
- **No cloud sync**: Your data never leaves your machine
- **No telemetry**: No analytics, no tracking

### Internal naming note

The app uses the `NightNinjas` namespace for internal storage to maintain compatibility with existing user databases. Do not rename these paths:

- Database file: `%APPDATA%\NightNinjas\shadow-tracker.db`
- Keychain service: `NightNinjas-ShadowTracker`

Renaming them would orphan existing user databases and credentials. User-facing exports use VELOCITY naming.

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
