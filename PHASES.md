# PHASES.md — VELOCITY Development Ledger

## Current state

**Version**: 0.2.17  
**Branch**: main (clean)  
**Test coverage**: 29 test files · 472 tests · all passing  
**Status**: Phase 17 complete. Core product is feature-complete, documented, and robustness-hardened.

---

## App routes (14 screens)

| Route | Name | Nav bucket | Purpose |
|---|---|---|---|
| `/patrol` | Patrol | Dashboard | Weekly compliance dashboard — daily-use screen |
| `/recon` | Recon | Training | Weekly trend report — Sunday-night review |
| `/dojo` | Dojo | Training | Plan management and methodology selection |
| `/calendar` | Calendar | Training | Races, group runs, events, commitments |
| `/coach-log` | Coach Log | Training | Manual session logging and plan adjustments |
| `/race` | Race | Training | Execution planner, debrief, carb loading |
| `/strike` | Strike | Analytics | Peak training week analysis |
| `/vo2max` | VO2max | Analytics | VO2max tracking and trend insights |
| `/shoes` | Shoes | Analytics | Gear inventory, rotation health, shoe recommender |
| `/journal` | Journal | Profile | Daily wellness entries (sleep, stress, energy) |
| `/profile` | Profile | Profile | Athlete settings, HR calibration, strength prefs |
| `/club` | Club | Profile | Club schedule sharing and parkrun integration |
| `/settings` | Settings | Profile | Strava connection, sync, data export, wipe |
| `/help` | Help | Profile | In-app user guide, glossary, how-to |

Plus: `/setup` (7-step first-run wizard) · `/api/*` (Strava OAuth + sync endpoints)

---

## Database schema (20 tables)

| Table | Purpose |
|---|---|
| `activities` | Synced Strava activities — primary source of truth |
| `plans` | Active training plan + history |
| `plan_periods` | Date-bound plan period rows for the program matrix |
| `plan_adjustments` | Per-week overrides (volume cap, skip, force-recovery) |
| `block_debriefs` | Training block retrospectives |
| `races` | Goal races and tune-up events |
| `race_results` | Post-race debrief data |
| `recurring_sessions` | Weekly group runs (Shoe Science, Coaches Run, etc.) |
| `calendar_events` | Commitments: holidays, trips, sickness |
| `nz_holidays` | Cached NZ public holidays from GitHub iCal |
| `sync_jobs` | Stateful, resumable Strava sync runs |
| `sync_log` | Legacy sync audit trail |
| `journal` | Daily wellness entries (manual) |
| `daily_health_metrics` | Device-sourced biometrics (Garmin, Apple Health) |
| `shoes` | Gear inventory synced from Strava |
| `activity_shoe_assignments` | Activity ↔ shoe link |
| `shoe_price_watches` | Replacement model price tracking |
| `vo2max_observations` | VO2max readings (Cooper, Rockport, device, lab) |
| `interruptions` | Injury/illness training breaks |
| `settings` | App key/value config (no secrets) |

---

## Phase ledger

### Phase 1–2 — Foundation
**What**: Initial project scaffold, Strava OAuth, database schema, Drizzle ORM, first sync.

**Key files**:
- `lib/db/schema.ts` — SQLite schema (Drizzle)
- `lib/sources/strava-api.ts` — Strava activity fetcher
- `lib/sources/strava-mapper.ts` — Strava → DB mapper
- `app/setup/` — 7-step first-run wizard
- `app/api/strava/` — OAuth callback + sync endpoints

**Status**: Complete. Foundation on which all phases build.

---

### Phase 3 — Sync runner + plan engine framework
**What**: Stateful, resumable sync job runner; plan engine interface; first plan implementations (Hansons, Lydiard).

**Key files**:
- `lib/sources/sync-runner.ts` — Job lifecycle (pending → running → completed/paused/rate_limited/failed)
- `lib/plans/types.ts` — `PlanEngine` interface
- `lib/plans/hansons.ts` — Hansons marathon method
- `lib/plans/lydiard.ts` — Lydiard periodisation

**Status**: Complete.

---

### Phase 3b — State-aware monotony + interruption detection
**What**: Training monotony scoring, sickness/travel interruption detection, multi-week compliance matrix, coach log.

**Key files**:
- `lib/plans/state-aware-week.ts` — Week template with calendar state flags
- `lib/analysis/interruptions-pure.ts` — Interruption detection
- `app/(app)/coach-log/page.tsx` — Manual session logging

**Status**: Complete.

---

### Phase 4–6 — Time handling, race planning, UI
**What**: Timezone fixes; race-day weather forecast + heat advisory; taper view + post-race protocol; Norwegian Singles dojo; multi-block calendar.

**Key files**:
- `lib/race/taper-pure.ts` — Taper week calculation
- `lib/race/post-race-pure.ts` — Post-race recovery protocol (R1–R4 phases)
- `lib/plans/norwegian-singles.ts` — Norwegian Singles methodology

**Status**: Complete.

---

### Phase 5 — Athlete profile
**What**: `/profile` route with editable athlete preferences, HR calibration, strength modality, injury ledger.

**Key files**:
- `app/(app)/profile/page.tsx`
- `lib/actions/profile.ts`
- `lib/actions/wellness.ts`

**Status**: Complete.

---

### Phase 6b — Navigation and streak
**What**: Top navigation redesign (4-bucket: Dashboard/Training/Analytics/Profile); streak counter in nav.

**Key files**:
- `components/nav/topnav.tsx`
- `lib/analysis/streak.ts`

**Status**: Complete.

---

### Phase 7 — Race weather integration
**What**: Race-day weather forecast, heat advisory, pacing suggestions for hot conditions.

**Status**: Complete.

---

### Phase 8 — Compliance engine + session matching
**What**: Additive session matching, compliance flagging (OK/WARN/FAST/SLOW/SHORT/NONE), recovery prescription.

**Key files**:
- `lib/analysis/compliance.ts` — Week evaluation engine
- `lib/plans/pace-compliance-pure.ts` — Pace band verdict logic

**Status**: Complete.

---

### Phase 9 — Coach voice + Sunday reflection
**What**: Contextual coaching messages based on athlete state; Sunday night reflection prompt (3-question weekly retrospective).

**Key files**:
- `lib/coach/coach-voice-pure.ts` — Message generation from state snapshot
- `lib/ai/context-pure.ts` — Snapshot → text for AI context
- `components/patrol/coach-voice-card.tsx`
- `components/patrol/sunday-reflection-card.tsx`

**Status**: Complete.

---

### Phase 10 — BYOK AI (Bring Your Own Key)
**What**: Anthropic API key entry (stored in OS keychain); AI-powered daily briefings on Patrol; model selection (Haiku/Sonnet).

**Key files**:
- `lib/ai/client.ts` — Anthropic SDK wrapper
- `lib/ai/models.ts` — Model registry
- `lib/store/secrets.ts` — Keychain-backed API key storage
- `lib/actions/ai.ts` — AI server actions
- `components/patrol/daily-briefing-card.tsx`

**Status**: Complete.

---

### Phase 11 — Shoe recommender + rotation health
**What**: Shoe category model (race-day/uptempo/super-trainer/daily/trail); session-type routing; rotation health scorer.

**Key files**:
- `lib/shoes/shoe-recommender-pure.ts` — Recommendation engine
- `lib/shoes/ingest.ts` — Gear ingestion from Strava
- `lib/shoes/queries.ts` — Shoe data accessors
- `components/patrol/shoe-recommendation-card.tsx`
- `components/patrol/shoe-nudge-banner.tsx`

**Status**: Complete.

---

### Phase 12 — Garmin integration (framework)
**What**: Garmin Connect OAuth flow; session token storage in keychain; sync enablement toggle in Settings.

**Key files**:
- `lib/actions/garmin.ts` — Garmin connection actions
- `lib/store/secrets.ts` — Garmin session token storage

**Status**: Framework complete. Active sync engine deferred.

---

### Phase 13 — Race execution planner + fueling
**What**: Pace plan generator (even/negative/progressive strategies); fueling plan (carb ladder by effort duration); carb loading calculator; race debrief.

**Key files**:
- `lib/race/execution-pure.ts` — `pacePlan()`, `fuelingPlan()`, `carbLoadPlan()`
- `lib/race/debrief-pure.ts` — `parseHmsToSeconds()`, debrief calculation
- `app/(app)/race/page.tsx`

**Status**: Complete.

---

### Phase 14 — Dojo capacity + volume capping
**What**: Weekly volume cap per plan period; capacity adjustments from calendar events; ramp plan loader.

**Key files**:
- `lib/plans/ramp-loader.ts` — Progressive ramp schedule
- `lib/plans/plan-periods.ts` — Plan period management
- `lib/actions/capacity.ts` — Volume cap server actions
- `components/patrol/ramp-card.tsx`

**Status**: Complete.

---

### Phase 15 — Pace reference + NS guardrails
**What**: Norwegian Singles HR guardrails (easy/sub-threshold caps with measured vs. estimated confidence); pace zone reference card on Patrol.

**Key files**:
- `lib/analysis/ns-guardrails.ts` — NS guardrail engine
- `lib/analysis/ns-guardrails-read.ts` — DB reader
- `components/patrol/ns-guardrails-card.tsx`

**Status**: Complete.

---

### Phase 16 — Audit remediation + test expansion
**What**: Timezone-safe date arithmetic across 3 production files; weekNumber=0 falsy-guard fix; 32 new tests across 7 files.

**Production fixes**:
- `lib/shoes/shoe-recommender-pure.ts` — UTC-safe cutoff date in `computeRotationHealth`
- `lib/analysis/trends-pure.ts` — UTC-safe month-key generation in `monthlyVolume`
- `lib/ai/context-pure.ts` — `!= null` guard replacing falsy `&&` on weekNumber

**New tests** (file by file):
- `lib/plans/engine-snapshot.test.ts` — Volume cap invariant for all 9 engines
- `lib/race/execution-pure.test.ts` — Single-segment, pace ratio, carb-ladder boundary tests
- `lib/shoes/shoe-recommender-pure.test.ts` — Boundary, tie-break, worn-past-target tests
- `lib/analysis/vo2max-pure.test.ts` — Monotone ordering, female offset, unknown-source safety
- `lib/analysis/vo2max-insights.test.ts` — MAD outlier detection, trend threshold boundary
- `lib/ai/context-pure.test.ts` — Null HR, weekNumber=0 handling
- `lib/race/debrief-pure.test.ts` — Ultra hours, leading-zero, zero-time parsing

**Status**: Complete. Test count: 472 tests across 29 files.

---

### Phase 17A — Robustness fixes
**What**: Five production bugs fixed; README + help page documentation aligned to reality.

**Code fixes**:
- `lib/sources/sync-runner.ts` — `detectInterruptedJobs()` now reaps stale `pending` jobs (>2 min); incremental cursor `+1` avoids re-fetching newest activity
- `lib/sources/strava-api.ts` — Filter activities with null `start_date` before cursor math
- `lib/store/secrets.ts` — Remove false file-based fallback claim from comment
- `lib/ai/client.ts` — Strip `sk-ant-*` patterns from Anthropic error messages

**Documentation fixes**:
- `README.md` — 20 tables (was 10); 14 routes (was 8); correct outbound calls (added Anthropic + Garmin); no placeholder labels
- `app/(app)/help/page.tsx` — Replace 4 "Shadow Tracker" references with "VELOCITY"; Strike tagline updated
- `app/setup/layout.tsx` — Footer reads "VELOCITY · v0.1.0 · local-only"

**Status**: Complete.

---

### Phase 17B — User goals alignment
**What**: Analytics glossary, dojo philosophy descriptions, first-run orientation banner, enum validation, gear dedup, migration tracking.

**Code changes**:
- `app/(app)/help/page.tsx` — Analytics metrics glossary (CTL/ATL/TSB/HR Reserve/Karvonen/pace zones); 9 dojo methodology descriptions
- `components/patrol/orientation-banner.tsx` — Dismissible first-run banner on Patrol
- `lib/actions/orientation.ts` — Server action to persist dismissal
- `lib/store/settings.ts` — `patrol_orientation_dismissed` settings key
- `lib/actions/calendar-events.ts` — Enum whitelist guards (eventType, impact)
- `lib/actions/recurring-sessions.ts` — Enum whitelist guard (sessionType)
- `lib/sources/sync-runner.ts` — Gear dedup set: each shoe fetched once per sync run
- `lib/db/schema.ts` — Biometric column intent clarified in comment
- `scripts/run-migrations.js` — `schema_migrations` table: files tracked by name, skipped on re-run
- `check.ps1` — Added `club` and `vo2max` pages to file-presence check

**Status**: Complete.

---

## Training methodologies (9 dojo engines)

| Engine | Key idea | Best for |
|---|---|---|
| Hansons | Cumulative fatigue via high mileage; no monster long run | Experienced runners wanting consistent volume |
| Daniels | Phase-based VDOT-anchored periodisation | Data-driven runners who want precise zones |
| Pfitzinger | High volume + heavy lactate threshold emphasis | Sub-elite marathoners chasing PRs |
| Higdon | Approachable single long run; lower mid-week stress | First-timers through intermediate runners |
| Lydiard | Months of aerobic base before any speedwork | Runners with 20+ week build runway |
| Polarised | 80% easy / 20% high intensity; no grey zone | Evidence-based athletes avoiding junk miles |
| Ultra | Time-on-feet over pace zones; back-to-back long days | 50km+ events |
| Norwegian Singles | Lactate-guided threshold intervals (singles only) | HR-disciplined athletes comfortable with intensity data |
| Custom | No engine; user defines the week directly | Athletes following a coach's plan |

---

## Data sources

| Source | Status | What's synced |
|---|---|---|
| Strava | Full | Activities, gear, OAuth tokens |
| Garmin Connect | Framework only | Session tokens stored; active sync not yet built |
| Anthropic | BYOK, opt-in | AI briefings and coaching messages |
| NZ Govt / GitHub iCal | Annual fetch | Public holidays for Ninja Loop calendar |
| Manual entry | Via Coach Log | Session notes, debrief data |

---

## Key analysis engines

| Engine | File | What it produces |
|---|---|---|
| Compliance | `lib/analysis/compliance.ts` | OK/WARN/FAST/SLOW/SHORT/NONE flag per session |
| Trends | `lib/analysis/trends-pure.ts` | Monthly volume, zone distribution |
| VO2max | `lib/analysis/vo2max-pure.ts` | Cooper/Rockport/device estimate; fitness band |
| VO2max insights | `lib/analysis/vo2max-insights.ts` | Trend direction, outlier flagging (MAD-based) |
| Shoe recommender | `lib/shoes/shoe-recommender-pure.ts` | Best shoe for session type; rotation health |
| NS guardrails | `lib/analysis/ns-guardrails.ts` | HR ceiling check for Norwegian Singles |
| Pace compliance | `lib/plans/pace-compliance-pure.ts` | Verdict + label from pace band + actual |
| Interruptions | `lib/analysis/interruptions-pure.ts` | Sickness/travel break detection |
| Athlete state | `lib/analysis/athlete-state-pure.ts` | Composite readiness snapshot |
| Coach voice | `lib/coach/coach-voice-pure.ts` | Contextual coaching messages |
| AI context | `lib/ai/context-pure.ts` | Snapshot → text prompt for Anthropic |

---

## Outbound network calls

| Endpoint | When | Purpose |
|---|---|---|
| `strava.com/api/v3` | On sync | Activity fetch (`/athlete/activities`), gear fetch (`/gear/{id}`) |
| `strava.com/oauth` | Setup + token refresh | OAuth handshake |
| `api.anthropic.com` | When AI enabled (BYOK) | Daily briefings, coaching messages |
| `connect.garmin.com` | When Garmin connected | Session token exchange |
| `raw.githubusercontent.com` | Once per year | NZ public holidays iCal |

---

### Phase 18 — Skills audit improvements
**What**: Three-dimension audit (code correctness, UI design consistency, content quality) driven by humanizer, stitch, and code-review skills. 17 backlog items identified and implemented.

**Code correctness**:
- `lib/actions/recurring-sessions.ts` — `dow` validated to `[-1, 6]`; `distMin`/`distMax` parseFloat guarded against NaN; unreachable `|| 'easy'` removed
- `lib/actions/calendar-events.ts` — date strings validated as `YYYY-MM-DD` with `endDate ≥ startDate`; `includes()` type cast replaced with array widening; `enableNinjaLoopHolidays` wrapped in a DB transaction with batched inserts (concurrent-safe)
- `lib/analysis/compliance.ts` — `dowOf()` rewritten to parse date components explicitly; eliminates day-of-week shift near midnight for timezones west of UTC
- `lib/store/settings.ts` — `getClubParkrunId()` null round-trip normalised to match all other nullable getters
- `lib/ai/client.ts` — content block cast replaced with type predicate filter

**Component consistency**:
- `components/patrol/ramp-card.tsx`, `progression-flag-card.tsx`, `ns-guardrails-card.tsx` — migrated from raw `div` borders to `Card` / `CardLabel`; closes 3 design-system gaps
- `components/patrol/interruption-indicator.tsx` — fixed full-card-as-anchor accessibility failure; outer `Link` wrapping entire card replaced with `Card` + internal `Manage on journal →` link

**Content quality** (humanizer skill pass):
- `app/(app)/test-lab/page.tsx` — removed 8 AI structural preamble paragraphs; added audience clarity notice; fixed holiday source wording
- `app/(app)/help/page.tsx` — removed 3 throat-clearing openers; fixed Strike copy; added 8-pill in-page section navigation
- `components/patrol/orientation-banner.tsx` — replaced "training command centre" with "What you did vs what the plan said."; migrated to `Card active`; replaced Unicode ✕ with Lucide `X` icon

**Deferred** (own phase): shadcn Tooltip/Progress/Alert/Skeleton additions; ComplianceRow responsive mobile layout; Patrol chip cluster redesign; Patrol skeleton loading state.

**Status**: Complete.

---

## Next phase candidates

| Item | Priority | Description |
|---|---|---|
| Garmin active sync | P1 | Build the sync engine that uses the stored session tokens |
| Server action `{ok,error}` returns | P2 | Structured error propagation from all server actions to UI |
| FK constraints | P2 | `PRAGMA foreign_keys=ON` + FK annotations in schema |
| Action test coverage | P3 | Integration tests for `lib/actions/` and sync pipeline |
| Shoe photo import | Backlog | Photo rotation view; performance correlation by shoe type |
| PDF training summary | Backlog | Exportable weekly/block summary |
| iCal export | Backlog | Race dates as iCal for calendar apps |

---

## Files to read for deep dives

| Area | Read this |
|---|---|
| Training analysis | `lib/analysis/` |
| Plan engines | `lib/plans/` |
| Strava sync | `lib/sources/sync-runner.ts`, `strava-api.ts` |
| Race logic | `lib/race/` |
| AI features | `lib/ai/`, `lib/coach/` |
| Shoe logic | `lib/shoes/` |
| All page routes | `app/(app)/`, `app/setup/` |
| Test suite | `lib/**/*.test.ts` |
