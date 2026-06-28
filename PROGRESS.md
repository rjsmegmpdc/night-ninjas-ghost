## Branch
main (clean — feat/setup-wizard-redesign merged)

## Session: 2026-06-28

### Completed

**Phase 24 — Setup Wizard Redesign**

Rebuilt the 7-step setup wizard with a new user flow and product framing:
- **New step order:** Welcome → Strava → Connect → Sync → Race → Plan → Life Events
  - Previously: Welcome → Strava App → Connect → Dojo → Races → Weekly → Sync
  - Key change: Sync is now step 4 (the hero payoff — matrix appears); Race and Plan are optional and come after
- **`app/setup/page.tsx`** — Welcome redesigned; Calendar Matrix is the hero. Shows a live data preview mockup (four rows of sample runs: past/now/future). Removed Logo component, added value prop copy focused on the matrix.
- **`app/setup/strava-app/page.tsx`** — Visual 3-stage guide replacing the old bulleted list:
  - Stage 01: Open strava.com/settings/api button
  - Stage 02: Form field mockup with every field labelled; Authorization Callback Domain highlighted with warning border and copy button
  - Stage 03: Credential mockup (Client ID as number, Client Secret as masked string)
- **`components/setup/copy-button.tsx`** — New client component; clipboard API with 2s "copied" feedback, signal-ok accent on confirmation
- **`app/setup/connect/page.tsx`** — STEPS array updated; minor copy improvements
- **`app/setup/sync/page.tsx`** — Moved to step 4; copy changed to "show me my matrix" framing; Continue → /setup/races; Back → /setup/connect
- **`app/setup/races/page.tsx`** — Step 5 with "optional" badge; Skip → /setup/life-events; Next → /setup/dojo; Back → /setup/sync
- **`app/setup/dojo/page.tsx`** — Step 6 with "optional" badge; Skip → /setup/life-events; Back → /setup/races
- **`app/setup/life-events/page.tsx`** — NEW step 7; explains injury/sick/away with preview of the quick-log chip strip; Continue → /patrol
- **`lib/actions/dojo.ts`** — Redirect after dojo selection changed from /setup/races to /setup/life-events
- **`app/api/strava/callback/route.ts`** — OAuth success redirect changed from /setup/dojo to /setup/sync (evaluator catch — critical fix)
- **`app/setup/weekly/page.tsx`** — Converted to redirect shim → /setup/life-events (evaluator catch — weekly dropped from wizard flow; content still accessible from Calendar page)

### In progress
- Nothing

### Blocked
- Pre-existing TS errors (not introduced this session):
  - `lib/ai/client.ts:45` — type predicate citations type mismatch
  - `lib/sources/strava-api.ts:114` — StravaActivity index signature
  - `lib/ai/fueling.ts:52` — AiModel string cast
  - `lib/analysis/weekly-report-pure.test.ts:33` — ComplianceFlag string literal
- Manual smoke tests needed:
  - Setup wizard: full flow Strava registration → connect → sync → race → plan → life-events → patrol
  - Confirm OAuth callback now lands on /setup/sync not /setup/dojo
  - Confirm copy button copies "localhost" correctly

### Next session should
- Fix the 4 pre-existing TS errors (P2 — straightforward type fixes)
- Manual smoke test: quick-log strip (log injury, confirm InterruptionIndicator updates)
- Manual smoke test: mid-entry banner (set plan start in past to trigger)
- Manual smoke test: setup wizard full flow
- Consider: add "Revisit Setup" prominent button to Settings (currently just "Re-run wizard" ghost button in Plan section — could be more prominent)
- Consider: gear module expansion (equipment types for race-prep mode)

## Key decisions made (Phase 24)
- Sync first, plan optional: the matrix is the payoff, not the plan. Users can see 90 days of their data before committing to a training method.
- Weekly config removed from wizard: group runs and capacity caps are advanced config; accessible from Calendar page.
- /setup/weekly preserved as redirect shim (not deleted) — existing revalidatePaths in server actions still target it; redirect avoids broken routes.
- OAuth callback fix was a missed edge: the wizard page links were all updated but the server-side redirect was not — evaluator caught it.

## Files changed this session
- app/setup/page.tsx (welcome redesign)
- app/setup/strava-app/page.tsx (visual guide)
- app/setup/connect/page.tsx (STEPS update)
- app/setup/sync/page.tsx (step 4, new nav)
- app/setup/races/page.tsx (step 5, optional, skip)
- app/setup/dojo/page.tsx (step 6, optional, skip)
- app/setup/weekly/page.tsx (redirect shim)
- app/setup/life-events/page.tsx (new — step 7)
- app/api/strava/callback/route.ts (OAuth redirect fix)
- components/setup/copy-button.tsx (new)
- lib/actions/dojo.ts (redirect target)
- PROGRESS.md (this file)

---

## Previous session (2026-06-28, main branch)

### Completed
All work from the prior session is committed to main and pushed to GitHub.

**Phase 20 — NS Engine ICS Alignment + Framework stats**
- `lib/plans/norwegian-singles.ts` — full rewrite: 20-week plan, ICS-exact long runs, MP finish segments, phase-accurate sub-T labels, `status: 'full'`
- `VOLUME_SCALE` capped at 1.0 (weeklyVolumeCapKm is a hard ceiling)
- `lib/analysis/framework-stats.ts` — new: `getFrameworkStats()` dispatches per-dojo 4-stat rows for all 9 dojos
- `lib/analysis/framework-stats.test.ts` — 35 tests
- `components/patrol/framework-stat-row.tsx` — new: replaces old hardcoded 4-stat block

**Phase 21 — Weekly compliance report**
- `lib/analysis/weekly-report-pure.ts` + test (UTC-safe week bounds)
- `lib/analysis/weekly-report-display-pure.ts` + test (53 tests)
- `lib/actions/weekly-report.ts` — generates once per week, persists JSON in settings
- `components/patrol/weekly-report-hero.tsx` — hero card on Patrol
- `components/settings/weekly-report-toggle.tsx` — enable/day picker in Settings

**Phase 22 — Mid-program entry detection**
- `lib/plans/mid-entry-pure.ts` — `assessMidProgramEntry()`: detection, verdict, headline, body, suggestedAction
- `lib/plans/mid-entry-pure.test.ts` — 21 tests
- `lib/actions/mid-entry.ts` — `dismissMidEntryBanner(periodId)` server action
- `components/patrol/mid-entry-banner.tsx` — verdict-styled banner, stats strip, dismiss form

**Phase 23 — Patrol UX hardening**
- `app/(app)/patrol/loading.tsx` — faithful loading skeleton; `animate-pulse` + `bg-ink-line-bold`
- `components/patrol/matrix-cells.tsx` — date is primary identifier; week number dropped
- `components/patrol/quick-log-strip.tsx` — compact chip row for injury/sick/away
