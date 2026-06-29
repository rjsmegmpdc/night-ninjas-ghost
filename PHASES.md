# PHASES.md — VELOCITY Development Ledger

## Current state

**Version**: 0.2.28  
**Branch**: main (clean)  
**Test coverage**: 33 test files · 609 tests · all passing  
**Status**: Phase 28 complete. Electron desktop packaging: Windows NSIS installer + macOS unsigned DMG, GitHub Actions CI builds on tag push.

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

Plus: `/setup` (7-step first-run wizard: Welcome → Strava → Connect → Sync → Race → Plan → Life Events) · `/api/*` (Strava OAuth + sync endpoints)

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

### Phase 19 — CWC long-running agent harness
**What**: Adopted patterns from `anthropics/cwc-long-running-agents` to make agent sessions resumable, steerable, and self-checkpointing.

**Files added**:
- `CLAUDE.md` — project contract with startup/stop ritual, operator controls quick reference, key invariants summary
- `PROGRESS.md` — session handoff doc; agent reads it at start of every session to resume context
- `.claude/hooks/kill-switch.sh/.ps1` — PreToolUse hook: blocks all tool calls when `AGENT_STOP` sentinel file exists in project root
- `.claude/hooks/steer.sh/.ps1` — PreToolUse hook: reads `STEER.md` once and injects as a blocking instruction, then clears it
- `.claude/hooks/commit-on-stop.ps1` — Stop hook: checkpoints uncommitted work as `session checkpoint: <timestamp>` on the active `feat/` branch
- `.claude/agents/evaluator.md` — fresh-context quality gate agent; reads PHASES.md + PROGRESS.md + git diff, runs tests, checks invariants, emits PASS or NEEDS_WORK

**Operator controls**:
- Emergency halt: `New-Item AGENT_STOP` → all tool calls blocked instantly
- Mid-run steering: `Set-Content STEER.md "instruction"` → agent receives once, clears it
- Session checkpoint: happens automatically on Stop hook

**Deferred**: `commit-on-stop.sh` (Bash variant) and `.claude/settings.json` (hook wiring) pending explicit authorization.

**Status**: Complete (PS1 hooks + evaluator + CLAUDE.md + PROGRESS.md committed; .sh + settings.json pending authorization).

---

### Phase 20 — NS Engine ICS Alignment + Per-dojo framework stats
**What**: Full rewrite of Norwegian Singles engine to match the ICS training plan exactly. Per-dojo framework stat rows dispatched from a pure module.

**NS Engine changes** (`lib/plans/norwegian-singles.ts`):
- `defaultProgramWeeks: 20`, `defaultLongRunCapKm: 34`, `status: 'full'`
- ICS-exact long run progression via `LONG_KM` table (weeks 1–20: 16→18→20→22→24→22↓→28→30→32→26↓→32→34→28+6MP→30+8MP→32+10MP→Devonport→30+12MP→32+12MP→18+5MP→Race)
- MP finish segments embedded in long run labels and notes (weeks 13–15, 17–19)
- Phase-accurate sub-T session labels: Base Early=20×400m/6×5min/4×8min; Base Mid=24×400m/7×5min/5×8min; Specificity=20×400m/6×5min+MP/4×8min; Taper 1=12×400m/4×5min+MP; Taper 2=6×400m sharpener/shakeouts/race
- `VOLUME_SCALE` capped at 1.0 — `weeklyVolumeCapKm` is a hard ceiling, not a peak to exceed

**Framework stats** (`lib/analysis/framework-stats.ts`):
- `getFrameworkStats()` dispatches 4 `FrameworkStat` objects per dojo — all 9 dojos covered
- NS: sub-T%, easy HR, rep HR, long run. Hansons: volume/MP-tempo/long/sessions. Pfitzinger: volume/LT pace/long/medium-long count. Daniels: T-pace/I-pace/VDOT/volume. Lydiard: phase/aerobic vol/long/aerobic %. Higdon: long/volume/week type/sessions. Polarised: easy%/hard%/grey%/volume. Ultra: time-on-feet/vert gain/back-to-back/volume
- `FrameworkStatRow` server component replaces the old hardcoded 4-stat block on Patrol
- Extended `WeekStats` with `totalElevationGainM` and `backToBackKm` for Ultra framework
- `resolveVo2()` feeds VO2max → VDOT approximation for Daniels framework

**Key files**:
- `lib/plans/norwegian-singles.ts` — full engine rewrite
- `lib/analysis/framework-stats.ts` — new, dojo dispatch module
- `lib/analysis/framework-stats.test.ts` — new, 35 tests
- `components/patrol/framework-stat-row.tsx` — new, stat grid component

**Test count**: 588 (35 new)  
**Status**: Complete.

---

### Phase 21 — Weekly compliance report
**What**: Automated weekly training summary generated server-side and surfaced as a hero card on Patrol. Persistently cached so it survives page reloads.

**Key files**:
- `lib/analysis/weekly-report-pure.ts` — pure report builder: `buildWeeklyReport()`, UTC-safe week bounds
- `lib/analysis/weekly-report-pure.test.ts` — UTC boundary tests (NZ Monday-local/Sunday-UTC)
- `lib/analysis/weekly-report-display-pure.ts` — display helpers: `formatWeekRange`, `complianceTextClass`, `dayStatusSymbol`, etc.
- `lib/analysis/weekly-report-display-pure.test.ts` — 53 tests
- `lib/actions/weekly-report.ts` — `generateWeeklyReportIfDue()`, `getPersistedWeeklyReport()` — idempotent, generates once per week
- `components/patrol/weekly-report-hero.tsx` — hero card with day-by-day breakdown; prompt state when no report yet
- `components/settings/weekly-report-toggle.tsx` — enable/disable + delivery-day picker in Settings
- `lib/store/settings.ts` — 4 new keys: `weeklyReportEnabled`, `weeklyReportDay`, `weeklyReportWatermark`, `weeklyReportPayload`

**Key decisions**:
- Report persists as JSON in settings store — survives page reloads without re-generating
- Gated on `weeklyReportEnabled` — disabled users pay zero overhead on Patrol
- `WeeklyReportHero` always renders something (prompt card) when report is null — never crashes

**Test count**: 553 (pre-framework-stats baseline)  
**Status**: Complete.

---

### Phase 22 — Mid-program entry detection
**What**: Detects when a user activates a plan mid-block (week > 2 and period created ≤7 days ago), compares 6-week chronic load to week target, and surfaces a one-time dismissable verdict banner on Patrol.

**Detection logic** (`lib/plans/mid-entry-pure.ts`):
- `isNewMidEntry`: `weekNumber > 2 && daysSincePeriodCreated <= 7`
- Verdict: `ok` (chronic ≥ 90% of target) / `caution` (70–89%) / `warning` (< 70%)
- `fitnessDelta` = chronicKm − weekKmTarget; `weeksSkipped` = weekNumber − 1
- Dismissal is period-scoped (`plan_periods.id`) so re-activating a plan re-triggers the banner

**Key files**:
- `lib/plans/mid-entry-pure.ts` — new, `assessMidProgramEntry()`
- `lib/plans/mid-entry-pure.test.ts` — new, 21 tests (detection, thresholds, edge cases)
- `lib/analysis/week-queries.ts` — added `getTrailingChronicKm(weeks)`: 6-week trailing avg run km
- `lib/store/settings.ts` — `MID_ENTRY_DISMISSED_PERIOD` key + 2 accessors
- `lib/actions/mid-entry.ts` — new, `dismissMidEntryBanner(periodId)` server action
- `components/patrol/mid-entry-banner.tsx` — new, verdict-styled banner with stats strip + dismiss form

**Key decisions**:
- Warn-only — no auto-shifting of plan start date; matches "recommend first" working rule
- 6-week ACWR trailing average for chronic load
- Race-date-derived week number always honoured — no compression of missed transition weeks

**Test count**: 609 (21 new)  
**Status**: Complete.

---

### Phase 23 — Patrol UX hardening
**What**: Three targeted UX improvements to the Patrol daily-use screen — loading experience, matrix legibility, and friction-free incident logging.

**Loading skeleton** (`app/(app)/patrol/loading.tsx`):
- Next.js route-level Suspense wrapper — shows instantly on navigation while the async RSC waterfall resolves
- Revised to be clearly visible: `animate-pulse` (opacity 0.5 rhythm) + `bg-ink-line-bold` (#3A3A3A) fills + `bg-ink-shadow` cell backgrounds
- Covers all five sections in correct layout order: header strip, quick-log strip, compliance block, program matrix (with 220px legend sidebar), tonight's mission card, framework stat row

**Matrix date label** (`components/patrol/matrix-cells.tsx`):
- Dropped week number (`W5`) as the primary identifier — date (`28 Jun`) is now the sole label
- Current week: date in accent bold + tiny `now` subtext; orange left-border accent already marks the row unambiguously
- Base maintenance rows retain their `(base)` italic annotation

**Quick-log strip** (`components/patrol/quick-log-strip.tsx`):
- Compact `Log: [+ injury] [+ sick] [+ away]` chip row on Patrol, between header and compliance block
- Click a chip to open a one-line inline form directly below the strip — no navigation required
  - Injury: body-region select + niggle/moderate/severe radios → `logInterruption()`
  - Sick: severity radios only → `logInterruption(type=illness)`
  - Away: from/to date pickers + impact select → `createCalendarEvent(eventType=holiday)`
- Error surfaces inline; success closes the panel; `revalidatePath('/patrol')` in existing server actions fires automatically

**Status**: Complete.

---

### Phase 24 — Setup Wizard Redesign
**What**: Rebuilt the 7-step setup wizard with a Strava-first flow, Calendar Matrix as the product hero, and a visual Strava registration guide. Race and Plan selection are now optional and come after the first sync.

**New step order**:
- Step 1: Welcome — Calendar Matrix preview hero (sample past/now/future run data)
- Step 2: Strava — 3-stage visual walkthrough: open URL, fill form (with copy button for `localhost` callback domain), note credentials
- Step 3: Connect — credential paste (unchanged functionally)
- Step 4: Sync — moved from step 7; framed as "show me my matrix" hero payoff
- Step 5: Race — optional, skip button, back to /sync
- Step 6: Plan/Dojo — optional, skip button, back to /races
- Step 7: Life Events — new step; explains injury/sick/away with quick-log strip preview

**Key files**:
- `app/setup/page.tsx` — Calendar Matrix preview hero; date sample grid (past/now/future)
- `app/setup/strava-app/page.tsx` — 3-stage visual guide with callout border + copy button for `localhost`
- `app/setup/connect/page.tsx` — STEPS array updated
- `app/setup/sync/page.tsx` — moved to step 4; "show me my matrix" framing; continue → /setup/races
- `app/setup/races/page.tsx` — step 5, optional badge, skip button
- `app/setup/dojo/page.tsx` — step 6, optional badge, skip button
- `app/setup/life-events/page.tsx` — **new**, step 7; three event type cards + quick-log strip preview
- `app/setup/weekly/page.tsx` — converted to redirect shim → /setup/life-events (weekly config lives in Calendar page)
- `components/setup/copy-button.tsx` — **new** client component; clipboard API with 2s signal-ok feedback
- `lib/actions/dojo.ts` — redirect on dojo selection changed from /setup/races to /setup/life-events
- `app/api/strava/callback/route.ts` — OAuth success redirect fixed from /setup/dojo to /setup/sync

**Key decisions**:
- Sync first (step 4), plan optional (step 6): the matrix is the payoff, not the plan; users see 90 days of their data before committing to a training method
- Weekly pattern config removed from the wizard flow — advanced config accessible from Calendar page; `/setup/weekly` preserved as a redirect shim to avoid broken `revalidatePath` references
- OAuth callback redirect was missed during page-level nav updates — evaluator caught it before merge

**Test count**: 609 (no new tests — all UI/routing changes)  
**Status**: Complete.

---

### Phase 25 — Color Scheme Switcher
**What**: 4 named color schemes selectable under Settings → Display. CSS custom properties drive all token overrides; a no-flash inline script applies the stored scheme before React hydrates to prevent FOUC. Default is Ninja (brand dark).

**Themes**:
| Name | Key | Background | Accent | Designed for |
|---|---|---|---|---|
| Ninja | `ninja` | #0A0A0A | #FF5F00 | Default — brand dark |
| Daybreak | `daybreak` | #FBF8F1 | #E2521A | Warm paper, morning / outdoor |
| Midnight | `midnight` | #080B12 | #4FA8FF | Cool blue-black, late-night |
| Light | `light` | #F5F1E8 | #FF5F00 | Standard paper-bone light |

**Key files**:
- `app/globals.css` — `html[data-theme="daybreak"]` and `html[data-theme="midnight"]` blocks added; `html[data-theme="light"]` block fixed (5 missing tokens added for full parity across all 4 themes)
- `components/theme/theme-provider.tsx` — full rewrite: `ColorScheme = 'ninja' | 'daybreak' | 'midnight' | 'light'`; removed system-pref resolution; `NO_FLASH_SCRIPT` validates against 4 scheme names; default `ninja`; context exports `{ scheme, setScheme }`
- `components/theme/theme-toggle.tsx` — updated to use `ColorScheme` API; cycles Ninja→Daybreak→Midnight→Light; icons Moon/Sunset/SunMedium/Sun
- `components/theme/theme-switcher.tsx` — **new** client component; 4-option card grid with 3-dot color swatch previews (bg / accent / text), active state (accent border + ✓ active)
- `app/(app)/settings/page.tsx` — `ThemeSwitcher` added to Display section above `FirstDayOfWeekToggle`; `Palette` icon imported for section label

**Key decisions**:
- Ninja is the explicit default — system-pref resolution removed; one clear choice per user stored in localStorage under `nn-theme`
- `data-theme` attribute on `<html>` drives all styling — no JS class manipulation; themes activate instantly via CSS custom property cascade
- `color-scheme: light/dark` set explicitly per theme block so browser chrome (scrollbars, form controls) matches the palette

**Test count**: 609 (no new tests — all UI/theme changes)  
**Status**: Complete.

---

### Phase 26 — Patrol Dashboard Reorder + Sticky Compliance Bar
**What**: Reordered the Patrol dashboard for a cleaner daily-use flow and replaced the large compliance block with a slim sticky bar that collapses to traffic lights on scroll. Fixed nav active state to show a filled pill.

**New dashboard order**:
1. Compliance bar (sticky, under nav)
2. Header strip (week title, sync, race countdown)
3. Tonight's Mission
4. Program Matrix
5. Mid-program entry banner (conditional)
6. Quick-log strip
7. Framework stats
8. Coaching detail (collapsed)

**Key files**:
- `components/patrol/compliance-bar.tsx` — **new** client component. Two states driven by `window.scrollY > 30`:
  - *Expanded* (at top): single-line `78% · On Track` bar with coloured dot + count for each of Hit / Partial / Miss
  - *Collapsed* (sticky): three traffic-light dots (green/amber/red) with counts; clicking a dot opens a popover explaining the status and a "→ session detail" link that opens the coaching drawer and scrolls to the session breakdown
  - Uses `sticky top-16 z-40` + negative margin breakout (`-mx-4 sm:-mx-8 lg:-mx-12`) to span full width within the `max-w-7xl` container
- `app/(app)/patrol/page.tsx` — Tonight's Mission moved before Program Matrix; Program Matrix moved to second position; `WeekComplianceBlock` replaced by `ComplianceBar` at top of dashboard; `id="coaching-detail"` added to `<details>`; `id="session-compliance"` added to session compliance card
- `components/nav/topnav.tsx` — Active nav bucket now shows `bg-accent/10` filled pill + `shadow-[inset_0_1px_0_0_rgba(255,95,0,0.15)]` inner glow in addition to the existing accent underline; hover state adds `hover:bg-ink-panel`

**Key decisions**:
- Compliance bar uses scroll position (not IntersectionObserver) for simplicity and reliability across all browsers
- Popover for the last (rightmost) traffic light uses `right-0` alignment to avoid off-screen overflow
- `WeekComplianceBlock` component preserved on disk; only the patrol page import was swapped

**Test count**: 609 (no new tests — UI/layout changes only)  
**Status**: Complete.

---

### Phase 27 — Loading Performance
**What**: Eliminated sequential data-fetch waterfalls on the patrol page; added React `cache()` for settings reads; added instant loading skeletons on all 14 routes so screens feel snappy on first navigation.

**Changes**:
- `lib/store/settings.ts` — wrapped `get()` in React `cache()`. Per-request deduplication: multiple server components reading the same key in one render share one SQLite hit.
- `app/(app)/patrol/page.tsx` — two waterfall fixes:
  1. `getActivitiesInRange` now runs in parallel with `resolveWeekContext` via `Promise.all` (both only need date strings from the pure `currentWeekRange()` call).
  2. `getTrailingChronicKm` and `getMidEntryDismissedPeriod` merged into the large 12-item `Promise.all` block, removing a second sequential pair.
- 14 × `loading.tsx` — animated `animate-pulse` skeleton on every app route: calendar, club, coach-log, profile, strike, vo2max, journal, shoes, race, dojo, test-lab, help, recon, settings. Next.js streams these instantly while the async page component resolves.

**Key files**:
- `lib/store/settings.ts`
- `app/(app)/patrol/page.tsx`
- `app/(app)/[calendar|club|coach-log|profile|strike|vo2max|journal|shoes|race|dojo|test-lab|help|recon|settings]/loading.tsx` (14 new files)

**Test count**: 609 (no new tests — infrastructure/perf changes only)  
**Status**: Complete.

---

### Phase 28 — Electron Desktop Packaging
**What**: Wrapped the Next.js app in Electron 33 so it ships as a native installable desktop application. Windows gets an NSIS setup wizard (.exe); macOS gets a drag-to-Applications DMG. GitHub Actions builds both automatically when a version tag is pushed.

**Architecture**:
- `electron/main.ts` — main process. Runs Next.js 15 programmatically on port 3579 inside the same process (no separate Node.js binary). Opens `BrowserWindow` once the server is ready. Single-instance lock, macOS dock reactivation, external-link routing to OS browser.
- `electron/preload.ts` — minimal (contextIsolation: true, nodeIntegration: false; all data access is server-side).
- `electron/tsconfig.json` — CommonJS target, compiles `electron/*.ts` → `electron/*.js` in-place (gitignored).
- `electron-builder.config.js` — packages `.next/`, `public/`, `electron/main.js`, `node_modules/` (production only) into an asar. `better-sqlite3` and `keytar` are asar-unpacked so native `.node` binaries load from filesystem.

**Release flow**:
1. `git tag v0.x.y && git push origin v0.x.y`
2. GitHub Actions triggers on `windows-latest` (produces `VELOCITY Setup.exe`) and `macos-latest` (produces `VELOCITY.dmg`, arm64 + x64 universal)
3. Both artifacts are attached to a draft GitHub Release — review and publish manually

**Local builds**:
- Windows only: `npm run electron:dist:win`
- macOS only (requires Mac): `npm run electron:dist:mac`

**Icons**: Add `electron-assets/icon.ico` (Windows) and `electron-assets/icon.icns` (macOS) then uncomment the icon lines in `electron-builder.config.js`.

**macOS signing**: Unsigned — users right-click → Open on first launch (Gatekeeper bypass). Add `CSC_LINK` + `CSC_KEY_PASSWORD` secrets to GitHub Actions to enable signing when an Apple Developer certificate is available.

**Key decisions**:
- Programmatic Next.js server (not `next start` child process) — avoids bundling a separate Node.js binary, keeps the package smaller
- DB path unchanged — `data-dir.ts` already returns the correct OS-native path on both platforms
- Port 3579 fixed — avoids conflicts with dev ports (3000/3001)

**Test count**: 609 (no new tests — packaging infrastructure only)  
**Status**: Complete. Push a `v*` tag to trigger a release build.

---

## Next phase candidates

| Item | Priority | Description |
|---|---|---|
| Garmin active sync | P1 | Build the sync engine that uses the stored session tokens |
| Server action `{ok,error}` returns | P2 | Structured error propagation from all server actions to UI |
| FK constraints | P2 | `PRAGMA foreign_keys=ON` + FK annotations in schema |
| Pre-existing TS errors | P2 | Fix `lib/ai/client.ts` citations type, `lib/sources/strava-api.ts` index signature, `lib/ai/fueling.ts` AiModel cast, `weekly-report-pure.test.ts` ComplianceFlag |
| Action test coverage | P3 | Integration tests for `lib/actions/` and sync pipeline |
| Quick-log strip — sick as calendar event | P3 | Option to log sickness as a `calendarEvents` row with impact, not just an interruption |
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
