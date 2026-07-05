## Branch
feat/compliance-and-pmc

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

**feat/compliance-and-pmc — in progress**

- `PatrolPage.tsx`: replaced `buildMinimalCompliance()` shim with `evaluateWeek(template, asActivities(activities))` — real per-session flag evaluation (ok/fast/slow/short/none) now feeds `getFrameworkStats()`
- `snapshot-builder.ts`: added CTL/ATL/TSB computation — queries last 56 days, uses `computeActivityLoad()` + `computeEwma()` + `classifyForm()` + `rollupConfidence()` (same pattern as StrikePage). `state` is now populated in AthleteSnapshot when ≥7 activities exist; null when insufficient history. PMC query runs in parallel with plan query.

### In progress
- `feat/compliance-and-pmc` (not yet merged)

### Blocked
- Nothing

### Next session should
1. Merge `feat/compliance-and-pmc` to main (Matt's call)
2. Consider Garmin Connect OAuth sync (daily_health_metrics schema exists)

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
