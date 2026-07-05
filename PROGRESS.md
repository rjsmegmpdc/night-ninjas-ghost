## Branch
main (feat/garmin-gdpr-import merged)

## Session: 2026-07-06 (continued)

### Completed

**feat/calendar-nz-race-search — merged to main (39af9a3)**

- `CalendarPage.tsx`: `RaceFormState` gains `raceUrl` and `raceSearchUrl` fields
- `NzRaceSearch` combobox component: filters all 49 `NZ_RACES` by name or city as user types (min 2 chars); dropdown shows race name, city, date, Half/Marathon badge
- Selecting a result auto-fills name, date, distance; selecting manually clears stored URLs
- Event page link (originator URL) + "Google if 404" fallback appear beneath name field after a NZ race is selected
- Works identically for both goal race and tuneup race add forms via shared `RaceForm` component

**feat/garmin-gdpr-import — merged to main (22cca3b)**

- `SettingsPage.tsx`: `GarminImportSection` added (Section 6)
- User unzips Garmin export, selects JSON files from `DI_CONNECT` folder; no JSZip dependency — native `File.text()` only
- `parseGarminFiles()`: iterates all records in each file; extracts date from `calendarDate`, `summaryDate`, `startTimestampGMT`, `date`, or `dailySleepDTO.calendarDate`
- Calls all existing mapper extractors (`extractSleep`, `extractDailySummary`, `extractHrv`, `extractWeight`, `extractVo2max`) per record; merges by date with null-coalescing
- Preview panel shows day count, oldest–newest range, and which metric types were found (RHR/HRV/Sleep/Stress/Body Battery/VO2 max/Weight) before user confirms
- `upsertHealthRows()`: BEGIN/COMMIT transaction; `ON CONFLICT DO UPDATE SET ... COALESCE` merges across re-imports without clobbering existing values
- Last imported timestamp stored in `settings` key `garmin_gdpr_imported_at`; displayed as relative time

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
1. Patrol page: "tonight's mission" deep-link to activity recording (stretch)
2. Strike dashboard: rolling 28-day mileage chart (Recharts) comparing actual vs planned
3. Garmin Connect OAuth sync (alternative to GDPR file import) — if user wants live sync without manual export

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness railway)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser
- **Gear: no transactions in GHOST**: deal search opens Google; no cart, no checkout, no affiliate links
- **Garmin import: no ZIP library**: user unzips manually; `File.text()` reads JSON files directly — zero new dependencies
- **Garmin import: COALESCE upsert**: re-importing merges new fields without overwriting existing ones; safe to run multiple times

---

## Session: 2026-07-06 (earlier)

### Completed

**feat/dojo-training-calendar — merged to main (4c569c5)**

- `DojoPage.tsx`: full rewrite — picker collapses when a plan is active
- `ActivePlanBar`: compact strip showing dojo name, current phase/week number, goal race, editable start date, "Change plan" button
- `TrainingCalendar`: week-by-week grid grouped by calendar month; calls `engine.renderWeek()` with full `WeekContext` (goalRace, tuneupRaces, lifeEvents) for every program week
- `WeekRow`: phase dot (colour-coded base/build/peak/taper), phaseName from engine, km target, "← now" indicator on current week, goal race accent banner
- `DayCell`: 7-column grid per week; session type badge (E/L/T/I/RP/X/S/—), distance, life event markers, tuneup race markers, past-day muted opacity
- Macrocycle overview bar: coloured phase blocks across all weeks with legend
- "No goal race set" advisory when races table is empty
- New DB queries: loadCalendarData() — parallel fetch of goalRace, tuneupRaces, lifeEvents, capacity settings
- `showPicker` state: false = calendar view; true = picker; "Change plan" toggles back

**feat/data/nz-races — merged to main (c87e8bd, ba859fb)**

- `src/data/nz-races-2026.ts`: 49 NZ half marathon + marathon events Jul 2026–Jun 2027
- Sourced from runningcalendar.co.nz; macron-safe slug() function derives event URLs
- Every race has `url` (primary → originator page) and `searchUrl` (Google fallback for slug 404s)
- `NZ_HALF_MARATHONS` and `NZ_MARATHONS` exports for use in CalendarPage race-add UI

**feat/gear-page — merged to main (c84490f)**

- Migration 0006: `gear_items` table (name, category, brand, model, description, size, quantity, is_watchlist, target_price, url); ALTER `shoes` adds `description` and `size` columns
- `src/lib/strava/types.ts`: `StravaShoe`, `StravaBike`, `StravaAthleteGear` types added
- `src/lib/strava/client.ts`: `fetchAthleteGear()` — calls `GET /athlete`, returns shoes + bikes
- `src/routes/gear/GearPage.tsx` (new):
  - **Import banner**: one-click Strava import — upserts all shoes by strava_gear_id, timestamps last import
  - **Shoe rotation analysis**: Race shoe / Trail / Daily trainer / Near limit badges derived from best pace, activity type split, km% used; avg and best pace per shoe from joined activities
  - **Deal search**: "Find deals" per shoe/item → Google `{brand} {model} sale NZ running`
  - **Gear sections**: Clothing, Backpacks, Hardware, Food — manual add form per category
  - **Watchlist**: target price, size, product URL per item; deal search button; "waiting for a sale" intent
  - Retired shoes collapsible via ChevronDown toggle
- `src/App.tsx`: `/gear` route added; `/shoes` now redirects to `/gear`
- `src/components/nav/TopNav.tsx`: "Shoes" → "Gear"

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
1. Wire NZ race data into CalendarPage — searchable combobox for adding target/tuneup races from `NZ_RACES`
2. Garmin GDPR export import — file picker UI → garmin/mapper.ts → bulk upsert to daily_health_metrics
3. CalendarPage race-add: primary URL + "Search Google" fallback for slug 404s

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness rating)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser
- **Gear: no transactions in GHOST**: deal search opens Google; no cart, no checkout, no affiliate links
- **Shoe rotation advice is computed not queried**: pure JS from aggregated activity stats — no extra table needed

## Session: 2026-07-05

### Completed

**BiometricsCard on Strike — feat/biometrics-card (in progress)**

- `StrikePage.tsx`: added `BiometricsCard` component (Card 5)
  - Queries last 28 days from `daily_health_metrics` + `journal` (HRV/RHR fallback)
  - Uses `resolveDayRows()` + `trendFor()` from `biometrics-pure.ts` for source-priority resolution
  - 4 metric tiles: HRV (ms), Resting HR (bpm), Sleep Score, Body Battery — each with latest value, 28-day avg, and ↑/↓/→ trend arrow
  - HRV 28-day SVG sparkline at card bottom
  - Hidden when no biometrics data logged; `hasAny` guard prevents ghost card
- `StrikePage.tsx`: added `fetchBiometrics(fromIso, toIso)` query helper
- `StrikePage.tsx`: added `biometrics-pure.ts` import (resolveDayRows, trendFor, ResolvedDayMetrics)
- PHASES.md: updated to v0.6.0, 574/574 tests, replaced stale "not yet ported" table with remaining opportunities

**feat/biometrics — merged to main (2026-07-05)**

- Migration 0005: `daily_health_metrics` table (rhr_bpm, hrv_ms, sleep_duration_s, sleep_score, stress_score, body_battery, vo2max_device, weight_kg; UNIQUE(date, source))
- `week-queries.ts`: getTodayBiometrics(), upsertBiometrics(), getRecentBiometrics() helpers
- `CoachLogPage.tsx`: TodayLogForm extended with HRV (ms) + Body Battery (0–100) fields; HRV → journal.hrv, body battery → daily_health_metrics source=manual
- `snapshot-builder.ts`: merges journal.hrv/resting_hr + daily_health_metrics into AI coach context
- `context-pure.ts`: BiometricsSnapshot in AthleteSnapshot; snapshotToText emits biometrics line
- 2 new biometrics tests in context-pure.test.ts

**feat/ai-coach — merged to main (2026-07-04)**

- `SettingsPage.tsx`: BYOK Anthropic key entry (masked, stored as settings.ai.anthropic_key, remove button)
- `CoachLogPage.tsx`: AI Coach Panel — reads key from settings, builds snapshot via buildAthleteSnapshot(), calls claude-haiku-4-5-20251001 direct API
- `snapshot-builder.ts`: created — queries plan/goal/week/activities/biometrics → AthleteSnapshot
- `context-pure.ts`: snapshotToText() serialises to prompt text

**feat/patrol-plan-aware — merged to main (2026-07-04)**

- PatrolPage: plan-aware rewrite — 7-day compliance matrix, "tonight's mission" card, dojo-specific FrameworkStatsRow
- `week-queries.ts`: getActivePlanPeriod() — joins plan_periods+plans, parses params_json, queries races WHERE is_goal=1

**Plan engines — merged to main (2026-07-04)**

- 9 engines: hansons, lydiard, daniels, pfitzinger, higdon, polarised, norwegian-singles, ultra (stub), custom
- calendar-blocks.ts, plans/index.ts, program-phase.ts, intensity-distribution.ts, framework-stats.ts
- Engine snapshot tests (54) + framework-stats tests unblocked; 574 total passing

**feat/compliance-and-pmc — merged to main**

- `PatrolPage.tsx`: replaced `buildMinimalCompliance()` shim with `evaluateWeek(template, asActivities(activities))` — real per-session flag evaluation (ok/fast/slow/short/none) now feeds `getFrameworkStats()`
- `snapshot-builder.ts`: added CTL/ATL/TSB computation — queries last 56 days, uses `computeActivityLoad()` + `computeEwma()` + `classifyForm()` + `rollupConfidence()`. `state` now populated when ≥7 activities exist; null otherwise.

**fix/coach-log-form-state — merged to main (34f7757)**

- `CoachLogPage.tsx`: added `hrv: ''` and `bodyBattery: ''` to `InlineEditForm` useState initialiser — CI type error from missing fields added by feat/biometrics.

**fix/strike-trend-type — merged to main (8d0b410)**

- `StrikePage.tsx`: extended `trend` type in BiometricsCard metrics array to include `mean: number | null` — CI `tsc -b` caught `mean` property missing from inline type.
- `PatrolPage.tsx`: removed orphaned `WeekCompliance` type import — was unused after shim deletion; `tsc -b` treats unused imports as TS6133 errors.

**feat/patrol-compliance-flags — merged to main (9fa3e63)**

- `PatrolPage.tsx`: exposed `compliance` from `derived` useMemo return; passed to `WeekPlanGrid` as prop
- Added `COMPLIANCE_FLAG` lookup table: `fast` → amber FAST, `slow` → muted SLOW, `short` → amber SHORT; `ok/none/warn/miss` produce no badge (handled by status dot)
- `WeekPlanGrid`: reads `compliance.days` per-DOW; renders flag badges beneath actual run row, guard `status === 'done' && sessionFlags.length > 0`
- Updated PHASES.md: marked two completed remaining items; added patrol-compliance-flags as done

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
1. Consider Garmin Connect OAuth sync — Garmin developer registration → Cloudflare Worker → OAuth flow → upsert to daily_health_metrics (mapper already exists)
2. Alternatively: Garmin Connect JSON file import (lower effort, no OAuth) — file picker → mapper → bulk insert historical biometrics

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness rating)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser

## Files changed (biometrics-card)
- `src/routes/strike/StrikePage.tsx`
- `PHASES.md`, `PROGRESS.md`

## Files changed (biometrics)
- `src/db/migrations.ts`
- `src/lib/analysis/week-queries.ts`
- `src/lib/ai/context-pure.ts`, `context-pure.test.ts`
- `src/lib/ai/snapshot-builder.ts`
- `src/routes/coach-log/CoachLogPage.tsx`

## Files changed (ai-coach)
- `src/routes/settings/SettingsPage.tsx`
- `src/routes/coach-log/CoachLogPage.tsx`
- `src/lib/ai/snapshot-builder.ts`
- `src/lib/ai/context-pure.ts`

## Files changed (patrol-plan-aware)
- `src/routes/patrol/PatrolPage.tsx`
- `src/lib/analysis/week-queries.ts`
