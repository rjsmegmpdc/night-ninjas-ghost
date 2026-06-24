# TESTING.md — VELOCITY Test Guide

> 29 test files · 472 tests · Vitest · all pure functions

---

## Running tests

```powershell
# All tests (from project root)
npm test

# Watch mode (re-runs on file save)
npm run test:watch

# Single file
npx vitest run lib/analysis/load.test.ts

# Coverage report
npx vitest run --coverage
```

Tests run without a database. All tested code lives in `*-pure.ts` files (no DB, no Next.js, no network). You do not need Strava connected, a running dev server, or any environment variables to run the suite.

---

## Test file inventory

### Training load and athlete state (`lib/analysis/`)

#### `athlete-state.test.ts`
Tests the EWMA engine and form classification that drives Patrol's daily summary.

| Function | What it tests |
|---|---|
| `computeEwma` | Returns 0 with no load; settles to steady-state; ATL responds faster than CTL; rest days dilute correctly |
| `classifyForm` | TSB → fresh / on-form / maintained / loaded / overreached thresholds |
| `rollupConfidence` | Returns calibrated / pace-only / estimated based on activity mix |

Key scenario: `computeEwma` is timezone-independent — the test provides an ISO date at midnight and verifies the asOf day is counted.

---

#### `biometrics.test.ts`
Tests biometric source priority resolution and trend calculation across time windows.

| Function | What it tests |
|---|---|
| `resolveDayRows` | Takes each field from highest-priority source (Whoop > Apple Health > Coros); falls through when value is null; unknown sources land at lowest priority |
| `trendFor` | Picks latest non-null value; computes window mean; computes prior-half mean for delta |

---

#### `injury-vulnerability-pure.test.ts`
Tests the injury history scorer that feeds the Profile page's risk indicators.

| Function | What it tests |
|---|---|
| `injuryVulnerabilityScores` | Severity weighting (niggle ~1, moderate ~2, severe ~3); recency decay (365-day half-life); active-injury ACTIVE_BOOST; score cap; `activeNow` flag; area normalisation (case + whitespace); excludes illness/travel/other types; uses endDate as reference for resolved, startDate for active |

Edge cases: injuries 365+ days old contribute ~0; score clamps at SCORE_CAP; multiple injuries in one area sum before capping.

---

#### `interruptions-pure.test.ts`
Tests the interruption (injury/illness/travel) detection used by the Calendar and state-awareness layer.

| Function | What it tests |
|---|---|
| `isActive` / `durationDays` | Active when no end date; inclusive day count; active duration runs to today |
| `hasActiveInjuryOrIllness` | True for injury, true for illness, false for travel |
| `windowsOverlapping` | Window fully inside week; illness resolved before week; open illness spanning week start; future window excluded; boundary touches; type filtering |
| `returnToTraining` | Null for active interruption; null for travel/other; phase 1 immediately after resolved injury; progression through phases; null after ramp complete |
| `assessInjuryRisk` | High when ACWR ≥ 1.5; elevated in caution band; high when injury active; flags recent 28-day history; low with benign inputs |

---

#### `load.test.ts`
Tests the core activity load computation — the foundation of CTL/ATL/TSB.

| Function | What it tests |
|---|---|
| `computeActivityLoad` | Returns null for no useful duration; Tier 1 (calibrated HR-reserve) zone classification at 70/82/88/95% thresholds; Tier 2 (age-predicted max HR); Tier 3 (pace classification for runs); sport baselines (Run=1.0, Ride=0.65, Yoga=0.30); Pilates recognition from activity name; worked examples: 90min marathon-HR run ≈ 36 pts, 60min marathon-HR ride ≈ 15.6 pts |

---

#### `monotony-pure.test.ts`
Tests training monotony — a Patrol warning signal for low load variation.

| Function | What it tests |
|---|---|
| `stdev` | Population SD; zero for identical values; zero for empty |
| `dailyLoadSeries` | 7-day series ending at asOf; zero-fills missing days |
| `monotony` | Caps at MONOTONY_CAP for constant non-zero load; 0 for rest week; high for low-variation week; low for varied week |
| `evaluateMonotony` | Fires when high monotony + enough active days; does NOT fire on light weeks; does NOT fire on varied weeks; respects custom threshold |

---

#### `ns-guardrails.test.ts`
Tests Norwegian Singles HR discipline checks — the NS Guardrails card on Patrol.

| Function | What it tests |
|---|---|
| `evaluateEasyDiscipline` | Pass/warn/miss thresholds; ignores sessions without HR |
| `evaluateRepIntensity` | Pass when reps sub-threshold; warn with some threshold sessions; miss when ≥50% run hot |
| `computeQualityCap` | OK inside 20-25% band; miss when over ceiling; warn when under floor |
| `evaluateMaxHrValidity` | Miss when observed HR exceeds configured max; warn on age-predicted max; OK with measured max and no exceedance |
| `buildNsGuardReport` | Surfaces worst severity across guards; absolute HR caps (Matt's personal calibration) |
| `computeNsDisciplineScore` | 100 when all pass; 0 when all miss; weights: easy=40%, rep=30%, quality=20%, maxHr=10%; warns score at 50 each |

---

#### `session-match-pure.test.ts`
Tests planned-vs-actual session alignment — the compliance dots on Patrol.

| Function | What it tests |
|---|---|
| `plannedKind` / `activityKind` | Session type → kind mapping; walks/yoga ignored |
| `analyzeWeekMatching` | Same-day same-kind; day-shifted session; unmatched activity flagged as extra; walks/yoga not flagged; same-day preference over adjacent; kind-strict (ride ≠ run slot); Tue/Thu swap handled as two shifted sessions |

---

#### `trends-pure.test.ts`
Tests monthly volume aggregation — the Recon trend charts.

| Function | What it tests |
|---|---|
| `monthlyVolume` | Buckets by calendar month; UTC-safe month keys; zero-fills empty months; emits exactly N months; computes deltas |
| `zoneDistribution` | Aggregates minutes per zone; computes percentages; worst confidence rollup; estimated+zero on empty |

---

#### `vo2max-pure.test.ts`
Tests VO2max estimate computation across methods.

| Function | What it tests |
|---|---|
| `estimateVo2max` | Monotone ordering (Cooper < Rockport < device < lab); female offset applied correctly; returns null for unknown source; boundary values at distance/time edges |

---

#### `vo2max-insights.test.ts`
Tests VO2max trend analysis and outlier detection.

| Function | What it tests |
|---|---|
| Outlier detection | MAD-based (median absolute deviation) — not mean+std; flags observations >3 MAD from median |
| Trend direction | Rising/falling/stable thresholds; minimum observation count before trend fires |

---

### Plan engines and state (`lib/plans/`)

#### `engine-snapshot.test.ts`
Tests the invariant that no plan engine exceeds the configured volume cap.

| What it tests |
|---|
| `weeklyVolumeCap(n, peakVolume) ≤ peakVolume` for all 9 engines across all week numbers in a 20-week cycle |

This is a cross-cutting invariant test — if any engine's formula overflows, this catches it.

---

#### `matrix-adjustments-pure.test.ts`
Tests week adjustment overlay — how manual and automatic overrides appear in the plan matrix.

| Function | What it tests |
|---|---|
| `overlayWeekAdjustment` | Applied adjustment reflected on any week (past/present/future); auto-applied flag on automatic rows; corrupt afterState snapshot falls back to raw; illness window previewed as reduce-volume on future weeks; travel window previewed as add-recovery; no preview on current/past weeks; applied row takes precedence over window; future off-program week returns raw |

---

#### `recovery-prescription-pure.test.ts`
Tests the day-after workout recovery recommender.

| Function | What it tests |
|---|---|
| `recoveryPrescription` | Threshold constants match Daniels-points values; full-rest band (load ≥ HIGH_LOAD = 30 pts); light band (MODERATE_LOAD = 12 pts to HIGH_LOAD); active band (< MODERATE_LOAD); exact boundary values at 11.9/12/29.9/30; opts overrides flow to items; sleep target and mobility minutes override; halved mobility in light band; bad input (negative/NaN/Infinity) degrades gracefully; always returns non-empty items list |

---

#### `state-awareness.test.ts`
Tests the week-by-week plan state machine — the most complex analysis component.

| Function | What it tests |
|---|---|
| `phaseBandFor` | Correct phase banding for 18-week program |
| `computeAcwr` | Acute:chronic weekly ratio; null when no chronic history |
| `interpretState` | Hold when in range; ACWR hard rail fires at ≥1.5 regardless of methodology; fires even off-program; caution band at ≥1.3; same TSB, different dojos → different verdicts (philosophy point); magnitude scales with depth below floor; overreached form earns add-recovery even above TSB floor; holds off-program when no rail fires |
| Monotony + windows | Fires monotony when high for now-state; suppressed below threshold; suppressed for future weeks; illness window fires reduce-volume; windows fire even on future weeks; illness outranks ACWR caution (but not hard rail); ACWR hard rail always wins; evaluateNowState=false suppresses now-state triggers |
| `applyAdjustment` | Returns same template on hold; never mutates raw; reduce-volume respects protected types on soft adjustments; hard rail cuts protected sessions too; reduce-intensity downgrades hottest unprotected quality session; add-recovery converts shortest easy day; recomputes weekly totals after adjustment |

---

### Race planning (`lib/race/`)

#### `debrief-pure.test.ts`
Tests race time parsing for the debrief form.

| Function | What it tests |
|---|---|
| `parseHmsToSeconds` | Ultra hours (48:00:00); leading zeros (01:02:03); zero time (0:00:00); standard marathon formats |

---

#### `execution-pure.test.ts`
Tests the race pace plan and fueling calculator.

| Function | What it tests |
|---|---|
| `pacePlan` | Single-segment even-effort plan; negative-split ratio application; progressive strategy; pace/distance consistency |
| `fuelingPlan` | Carb-ladder boundary: first gel, subsequent gels, electrolyte timing; empty when effort too short |
| `carbLoadPlan` | Days-out schedule; total carb target |

---

#### `macrocycle-pure.test.ts`
Tests multi-year training block analysis — the Recon macrocycle view.

| Function | What it tests |
|---|---|
| `blockNumberForYear` | Counts marathon-distance blocks in calendar year within ±5km tolerance; excludes other distances and years |
| `compareWeeks` | km delta percent; pace delta (negative = faster); nulls when no prior-year data |
| `sameWeekLastYearMonday` | Subtracts exactly 52 weeks; preserves weekday |
| `distanceLabel` | Labels 5k / 10k / half / marathon / ultra |

---

#### `post-race-pure.test.ts`
Tests the R1–R4 post-race recovery protocol.

| Function | What it tests |
|---|---|
| `recoveryProtocol` | Full marathon window (21 days, 4 phases); marks active phase from days since race; null current phase after window; scales window for shorter races (phases strictly increasing); single-day and multi-day range formatting |

---

#### `taper-pure.test.ts`
Tests the race week taper checklist.

| Function | What it tests |
|---|---|
| `taperChecklist` | Returns full discipline set; holds normal fuelling outside final 3 days; flips to carb-load inside final 3 days |
| `buildTaperCues` | Emits cues only for meaningful data; drops negative/flat volume delta and weak compliance; returns nothing when no data |

---

### Shoes (`lib/shoes/`)

#### `shoe-recommender-pure.test.ts`
Tests the shoe recommender and rotation health scorer.

| Function | What it tests |
|---|---|
| `recommendShoe` | Category routing by session type (race-day/uptempo/super-trainer/daily/trail); boundary cases (no shoes in category); tie-break logic; worn-past-target detection |
| `computeRotationHealth` | UTC-safe cutoff date; health percentage calculation; alert threshold |

---

### AI features (`lib/ai/`)

#### `context-pure.test.ts`
Tests the AI context builder that feeds the Anthropic prompt.

| Function | What it tests |
|---|---|
| `buildContext` | Null HR handled (no crash); weekNumber=0 does not get falsy-suppressed (`!= null` guard); snapshot serialisation |

---

### Garmin data (`lib/garmin/`)

#### `mapper.test.ts`
Tests Garmin API response parsing for all metric types.

| Function | What it tests |
|---|---|
| `extractSleep` | Reads duration and overall score from `dailySleepDTO`; tolerates missing payload; tolerates flat DTO |
| `extractDailySummary` | Reads RHR, stress, body battery; treats Garmin -1/-2 sentinels as null; falls back to highest body battery when most-recent missing |
| `extractHrv` | Prefers `lastNightAvg`; falls back to `weeklyAvg`; null when absent |
| `extractVo2max` | Reads precise value from maxmet array; falls back to rounded value; null for empty/non-array |
| `extractWeight` | Converts grams to kg (0.1 precision); reads `totalAverage` fallback; null for zero/absent |
| `snapshotToRow` | Maps full snapshot to garmin-source DB row |

---

### Club sharing (`lib/club-share/`)

#### `generator.test.ts`
Tests the club schedule payload generator for parkrun sharing.

| Function | What it tests |
|---|---|
| `generateSchedulePayload` | Correct window metadata; strips completed sessions; strips today's session when activity logged; keeps today when no activity; strips past days; suppresses 'rest' entries; collapses interval/repetition to 'intervals'; strips pace targets from notes; strips HR zone references from notes; day-of-week labels (dow 0..6 → Mon..Sun); throws when weeks empty; ascending date order; includes parkrun_id and version |
| `buildShareFilename` | Canonical filename; sanitises non-alphanumeric characters in parkrun ID |

---

### Weather (`lib/weather/`)

#### `heat-adjust-pure.test.ts`
Tests race-day heat impact on pace.

| Function | What it tests |
|---|---|
| `heatAdjust` | No penalty in cool conditions; no penalty exactly at threshold; hot+humid penalises more than hot+dry; monotone increase with temperature; severity bands; pace-adjustment cap in extreme heat; advisory string for every condition; clamps out-of-range humidity |
| `applyHeatToPaceSpk` | Goal pace unchanged in cool conditions; slows pace (larger spk) in heat; matches formula: goalSpk × (1 + paceAdjustPct/100) |
| `apparentTemperature` | Equals air temperature in cold/dry air; reads hotter than air temperature when warm and humid |

---

## Test design principles

**All test targets are pure functions** — no database, no network, no Next.js context. The `*-pure.ts` naming convention marks functions safe for direct unit testing.

**Boundary-first coverage**: tests focus on threshold values (e.g. exactly MODERATE_LOAD=12, exactly ACWR=1.5) rather than happy-path averages, because analysis engines have hard decision boundaries that are easy to get wrong.

**UTC-safe date arithmetic**: any test involving date comparisons uses `new Date(isoStr + 'T00:00:00Z')` and UTC getter methods to avoid TZ-local midnight shifts.

**Invariant tests**: `engine-snapshot.test.ts` tests a cross-cutting property across all 9 engines — one test file guarding one system-wide invariant.

**No mocks**: the test suite does not mock any internal modules. External dependencies (DB, keychain) are simply absent from pure functions, so no mocking framework is needed.

---

## Areas not covered by unit tests

The following areas have no automated tests and require manual verification:

| Area | Why not automated |
|---|---|
| `lib/actions/*.ts` | Server Actions require Next.js context; integration test infra not set up |
| `lib/sources/sync-runner.ts` | Requires live DB + mocked Strava API; end-to-end sync tested manually |
| `app/(app)/*/page.tsx` | Server Component rendering; no component test harness |
| OAuth flow | Requires live Strava callback |
| Keychain reads/writes | Requires OS credential manager |
| AI briefing | Requires Anthropic API key |
| Garmin sync | Framework only; sync engine not yet built |

See `ARCHITECTURE.md` for the full route → analysis engine map to identify what manual test scenarios cover these areas.
