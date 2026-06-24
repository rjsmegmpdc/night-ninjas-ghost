# ARCHITECTURE.md — VELOCITY Solution Architecture

> Audience: testers and contributors. Describes how the system is structured, how data moves through it, and where each feature lives.

---

## System overview

VELOCITY is a **local-first, single-user, desktop web application**. It runs entirely on the athlete's own machine as a Next.js development server. There is no cloud backend, no shared database, and no multi-tenant hosting.

```
Athlete's PC
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Browser (localhost:3000)                                            │
│  └── Next.js App Router (React 19 RC)                               │
│       ├── /app/(app)/            ← 14 authenticated screens          │
│       ├── /app/setup/            ← 7-step first-run wizard           │
│       └── /app/api/              ← OAuth callbacks + sync endpoints  │
│                                                                      │
│  Next.js Server (Node.js)                                            │
│  ├── Server Components           ← read DB, render HTML              │
│  ├── Server Actions              ← writes, form posts                │
│  └── API Routes                  ← Strava OAuth, sync trigger        │
│                                                                      │
│  SQLite database (C:\Users\<user>\AppData\Roaming\NightNinjas\)      │
│  └── better-sqlite3 (synchronous driver via Drizzle ORM)            │
│                                                                      │
│  OS Keychain (Windows Credential Manager)                            │
│  └── keytar — Strava tokens, Anthropic key, Garmin session          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Outbound calls (user-triggered, not background):
  ├── api.strava.com         ← activity + gear sync
  ├── api.anthropic.com      ← AI briefings (BYOK, opt-in)
  ├── connect.garmin.com     ← session token exchange
  └── raw.githubusercontent.com  ← NZ public holidays iCal (once/year)
```

---

## Layer map

```
app/                    Next.js App Router
  (app)/                Auth-required screens (14 routes)
  setup/                First-run wizard (7 steps)
  api/
    strava/callback     OAuth redirect handler
    strava/sync/run     Sync job trigger (fire-and-forget)

components/             Shared React components
  nav/                  Top navigation + streak chip
  patrol/               Patrol-specific cards (AI, shoes, coach, etc.)
  ui/                   Generic atoms (buttons, badges, cards)

lib/
  db/                   Drizzle schema, migrations, getDb()
  sources/              Strava API client + mapper + sync runner
  plans/                9 plan engine implementations
  analysis/             Pure analysis functions (no DB)
  race/                 Race planning, execution, taper, debrief
  shoes/                Shoe recommender, rotation health, gear ingest
  coach/                Coach voice message generation
  ai/                   Anthropic SDK wrapper, model registry
  actions/              Next.js Server Actions (write operations)
  store/                Settings + secrets (keytar) accessors
  club-share/           Club schedule payload generator
  garmin/               Garmin data mapper

scripts/
  run-migrations.js     Standalone migration runner
  seed.ts               Dev seed data

lib/db/migrations/      Versioned SQL migration files
```

---

## Data flow: Strava sync

```
User clicks "Sync now" on /settings
        │
        ▼
POST /api/strava/sync/run
        │
        ▼
createIncrementalJob()          ← writes sync_jobs row (status: pending)
        │  fire-and-forget
        ▼
runJob(jobId)
  ├── mark status → running
  ├── LOOP:
  │     fetchActivityPage(before, after)     ← GET /athlete/activities
  │     │   ↳ strava-api.ts
  │     │     filters null start_date rows
  │     │     returns StravaActivity[]
  │     │
  │     ├── mapStravaActivity()              ← strava-mapper.ts
  │     │     converts to DB row shape
  │     │
  │     ├── upsertActivity()                ← INSERT OR UPDATE activities
  │     │
  │     ├── ensureShoesForGearIds()         ← GET /gear/{id} (deduped per run)
  │     │     upserts shoes table
  │     │
  │     ├── update sync_jobs (cursor, counts, heartbeat)
  │     │
  │     └── sleep(150ms) between pages
  │
  ├── mark status → completed
  └── on error → failed / rate_limited / paused

Background: detectInterruptedJobs() runs on every Patrol + Calendar render
  ├── running + no heartbeat >60s  → paused   (resumable)
  └── pending + no heartbeat >2min → failed   (not resumable)
```

---

## Data flow: analysis pipeline

All analysis is **pure computation over DB rows** — no live API calls.

```
Page render (e.g. /patrol)
        │
        ├── getDb() → query activities table
        │
        ├── computeActivityLoad(activity, profile)
        │     ├── Tier 1: HR-reserve (calibrated max HR)
        │     ├── Tier 2: age-predicted max HR
        │     └── Tier 3: pace classification
        │
        ├── computeEwma(loadSeries, 42d)  → CTL  (chronic training load)
        ├── computeEwma(loadSeries, 7d)   → ATL  (acute training load)
        ├── TSB = CTL − ATL               → form score
        │
        ├── classifyForm(TSB)             → fresh/on-form/maintained/loaded/overreached
        │
        ├── interpretState(profile, form, plan)
        │     ├── checks ACWR (acute:chronic ratio) for injury risk
        │     ├── checks monotony (load variation score)
        │     ├── overlays calendar windows (sickness/travel)
        │     └── emits adjustment signal: hold/reduce-volume/reduce-intensity/add-recovery
        │
        ├── complianceCheck(plan, activities, week)
        │     ├── sessionMatch() — planned vs actual
        │     └── paceCompliance() — pace band verdict
        │
        └── coach-voice-pure.ts → coaching message from state snapshot
```

---

## Data flow: AI briefing

```
User visits /patrol
        │
        ├── lib/store/secrets.ts → getAnthropicKey()
        │     └── keytar.getPassword('velocity', 'anthropic-key')
        │
        ├── lib/ai/context-pure.ts → buildContext(snapshot)
        │     └── converts athlete state to ~500-token text block
        │
        ├── lib/ai/client.ts → callAnthropic(prompt)
        │     ├── POST api.anthropic.com/v1/messages
        │     ├── strips sk-ant-* from any error messages before logging
        │     └── returns { ok, text } | { ok: false, error }
        │
        └── DailyBriefingCard renders streamed response
```

---

## Sync state machine

```
           createJob()
               │
               ▼
           [pending]
               │
      runJob() starts
               │
               ▼
           [running] ──── heartbeat every page ────┐
               │                                    │
        ┌──────┴────────────────────────────────────┘
        │
        ├── all pages fetched → [completed]
        │
        ├── StravaRateLimitError → [rate_limited]  (resumable at resetsAt)
        │
        ├── other error → [failed]  (not resumable)
        │
        └── process killed → heartbeat goes stale
                │
                ├── >60s stale + was running → [paused]  (resumable)
                └── >2min stale + was pending → [failed]  (never started)

Resume paths:
  [paused]       → resumeJob() → runJob() from saved cursor
  [rate_limited] → resumeJob() after resetsAt → runJob()
```

---

## Authentication and secrets

```
Strava OAuth:
  Setup wizard → /api/strava/callback
    ├── exchange code for tokens (access_token, refresh_token)
    ├── keytar.setPassword('velocity', 'strava-access-token', ...)
    ├── keytar.setPassword('velocity', 'strava-refresh-token', ...)
    └── expiry stored in settings table

  Before each API call:
    ├── read expiry from settings
    ├── if expired → POST /oauth/token with refresh_token
    ├── store new access_token
    └── proceed with request

Anthropic BYOK:
  /settings → API key field
    └── keytar.setPassword('velocity', 'anthropic-key', ...)

  No Anthropic key → AI features disabled, no prompts shown

Garmin (framework, not yet active):
  /settings → Garmin connect button
    └── keytar.setPassword('velocity', 'garmin-session', ...)

Fallback behavior:
  keytar unavailable → reads return null, writes throw
  No file-based fallback exists (Windows Credential Manager is required)
```

---

## Database — key relationships

```
activities (primary)
  ├── source = 'strava', sourceId = Strava activity ID
  ├── gearId → shoes.stravaId
  └── startDateUtc (all date arithmetic done in UTC)

activities ←→ shoes (via activity_shoe_assignments)
  └── set manually or auto-matched by gearId

sync_jobs
  └── tracks cursor (Unix timestamp) for resumable pagination

plan_periods
  └── references plans.id (one plan, many periods)

plan_adjustments
  └── references plan_periods.id + weekNumber

block_debriefs
  └── references plans.id

calendar_events
  ├── eventType: holiday | work_trip | birthday | sickness | caregiving | ninja_loop_holiday | other
  └── impact: none | reduced | travel_only | no_training | group_run

recurring_sessions
  └── sessionType: recovery | easy | long | tempo | interval | repetition | cross | strength

races ←→ race_results (one race, zero or one result)

vo2max_observations
  └── source: cooper | rockport | device | lab

interruptions
  └── type: injury | illness | travel | other
  └── bodyRegion → injury-vulnerability engine

daily_health_metrics
  └── source: garmin | whoop | apple-health | coros | manual
  └── Distinct from journal (manual wellness) — device-sourced

settings
  └── key/value pairs only (no secrets — those go to keychain)
  └── PATROL_ORIENTATION_DISMISSED tracks first-run banner state
```

---

## Analysis engines — input/output

| Engine | Input | Output |
|---|---|---|
| `computeActivityLoad` | activity row + athlete profile | `{ points, zone, tier, confidence }` |
| `computeEwma` | daily load series + days | EWMA value (CTL=42d, ATL=7d) |
| `classifyForm` | TSB number | `'fresh' \| 'on-form' \| 'maintained' \| 'loaded' \| 'overreached'` |
| `rollupConfidence` | activity array | `'calibrated' \| 'pace-only' \| 'estimated'` |
| `evaluateMonotony` | week's daily loads | `{ fires: bool, monotonyScore, advice }` |
| `interpretState` | plan + athlete state + calendar | `{ adjustment, reason, magnitude }` |
| `applyAdjustment` | week template + adjustment | Modified week template |
| `analyzeWeekMatching` | planned sessions + activities | `{ matched, shifted, extras }` |
| `paceCompliance` | pace band + actual pace | `'OK' \| 'WARN' \| 'FAST' \| 'SLOW' \| 'SHORT' \| 'NONE'` |
| `heatAdjust` | temp (°C) + humidity (%) | `{ paceAdjustPct, severity, advisory }` |
| `recoveryProtocol` | race distance + days since | Array of R1–R4 phase items |
| `taperChecklist` | days to race + metrics | Checklist items with carb-load flag |
| `computeRotationHealth` | shoe + activities | `{ healthPct, category, alert }` |
| `buildNsGuardReport` | activity HR data + profile | `{ overallSeverity, guards[], disciplineScore }` |
| `injuryVulnerabilityScores` | interruptions array | `[{ bodyRegion, score, level, activeNow }]` |
| `assessInjuryRisk` | ACWR + interruptions | `'low' \| 'elevated' \| 'high'` |

---

## Route map

| Route | Server components read | Server actions write | Key analysis |
|---|---|---|---|
| `/patrol` | activities, plan, settings, shoes | dismissOrientation | EWMA, TSB, compliance, NS guardrails |
| `/recon` | activities, plan, recurring_sessions | — | Monthly trends, zone distribution |
| `/dojo` | plans, plan_periods | savePlan, savePeriod | Engine snapshot, capacity |
| `/calendar` | calendar_events, recurring_sessions, nz_holidays | addEvent, addSession | State-awareness overlays |
| `/coach-log` | plans, activities, interruptions | saveLog, saveInterruption | — |
| `/race` | races, activities, profile | saveRace, saveDebrief | Execution plan, fueling, taper |
| `/strike` | activities | — | Peak week comparisons |
| `/vo2max` | vo2max_observations, activities | saveObservation | VO2max estimate, trend |
| `/shoes` | shoes, activities, shoe_price_watches | updateShoe | Rotation health, recommender |
| `/journal` | journal, daily_health_metrics | saveJournal | — |
| `/profile` | settings, interruptions | saveProfile | Injury vulnerability |
| `/club` | recurring_sessions, activities | — | Schedule payload generator |
| `/settings` | sync_jobs, settings | triggerSync, wipeData | Sync job history |
| `/help` | — | — | Static content |
| `/test-lab` | — | — | Test scenario reference |

---

## Plan engine interface

All 9 engines implement `PlanEngine`:

```typescript
interface PlanEngine {
  id: EngineId;
  name: string;
  weeklyVolumeCap(weekNumber: number, peakVolume: number): number;
  generateWeek(weekNumber: number, context: PlanContext): WeekTemplate;
  phaseFor(weekNumber: number): PhaseName;
}
```

The state-awareness layer wraps every engine's `generateWeek()` output:

```
engine.generateWeek()
    → interpretState()    ← checks ACWR, monotony, calendar windows
    → applyAdjustment()   ← modifies sessions if adjustment fires
    → overlayWeekAdjustment() ← applies stored manual overrides
    → final WeekTemplate for rendering
```

---

## Key invariants (tested)

These properties are enforced by the test suite:

1. **Volume cap monotonicity**: every engine's `weeklyVolumeCap()` never exceeds `peakVolume`
2. **ACWR hard rail**: when ACWR ≥ 1.5, `interpretState()` always fires `reduce-volume` regardless of plan methodology
3. **UTC date arithmetic**: all date comparisons use `new Date(isoStr + 'T00:00:00Z')` + `.getUTCFullYear()`/`.getUTCMonth()`/`.getUTCDate()`
4. **Load tier priority**: HR-reserve (Tier 1) > age-predicted HR (Tier 2) > pace classification (Tier 3)
5. **Gear dedup**: each `gear_id` is fetched from Strava at most once per sync run
6. **Enum safety**: `eventType`, `impact`, and `sessionType` fields are whitelist-guarded before DB writes
7. **Stale job cleanup**: pending jobs >2 min old are marked `failed`; running jobs with no heartbeat >60s are marked `paused`

---

## Technology stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.x |
| UI library | React | 19 RC |
| Styling | Tailwind CSS | 3.x |
| ORM | Drizzle ORM | latest |
| Database | SQLite (better-sqlite3) | — |
| Keychain | keytar | — |
| Test runner | Vitest | — |
| AI SDK | @anthropic-ai/sdk | — |
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20+ |

---

## File naming conventions

| Pattern | Meaning |
|---|---|
| `*-pure.ts` | Pure functions with no DB/IO imports — safe to test without Next.js context |
| `*-read.ts` | DB read helpers that compose pure functions with DB queries |
| `*.test.ts` | Vitest test file for the matching module |
| `lib/actions/*.ts` | Next.js Server Actions (`'use server'` directive) |
| `lib/store/*.ts` | Persistent state accessors (settings table + keychain) |
| `app/(app)/*/page.tsx` | Route page components (Server Components by default) |
| `components/*/` | Reusable React components grouped by page/domain |
