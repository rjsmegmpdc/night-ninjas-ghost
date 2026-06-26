## Branch
feat/weekly-report-patrol-hero

## Session: 2026-06-26 (code-review fixes)

### Completed
- FIX 1 (BLOCKING): Replaced `currentWeekRange(today)` (local-time) with `getThisMondayIso + addUtcDays` (UTC) in `generateWeeklyReportIfDue`. Week bounds now consistent with watermark and `shouldGenerateReport`. Exported `addUtcDays` from `weekly-report-pure.ts` to enable this.
- FIX 2 (SHOULD FIX): Added `enabled` check to `getPersistedWeeklyReport` (Option A). Disabling the feature now causes the function to return null immediately — stale snapshot is not surfaced.
- FIX 3 (SHOULD FIX): Gated `<WeeklyReportHero>` render in `patrol/page.tsx` on `weeklyReportEnabled`. Read flag server-side at `PatrolDashboard` entry; skip all report calls and skip the hero when disabled.
- Tests: Added 4 UTC boundary regression tests in `weekly-report-pure.test.ts` for the NZ Monday-local/Sunday-UTC scenario (`new Date('2026-06-22T10:00:00+12:00')`). All 553 tests pass.

### In progress
- Nothing active

### Blocked
- Pre-existing TS error in components/patrol/shoe-recommendation-card.tsx (line 21 — unterminated string literal). Pre-dates this branch; not introduced by this session.
- `getPersistedWeeklyReport` enabled-gate test: cannot be unit-tested (server action with DB dependency — see TESTING.md `lib/actions/*.ts` exclusion). Behaviour verified by reading the implementation; integration/manual test required for full coverage.

### Next session should
- Consider Phase 19 backlog: shadcn Tooltip/Progress/Alert/Skeleton; ComplianceRow responsive layout; Patrol chip cluster redesign
- Manual smoke-test: disable weekly report in Settings, open Patrol — confirm hero is absent and no stale card shows; re-enable, open Patrol — confirm hero appears
- Consider pulling WeeklyReportHero outside PatrolDashboard into PatrolPage so it shows even when no active plan is configured

## Session: 2026-06-26 (frontend pass)

### Completed
- lib/analysis/weekly-report-display-pure.ts — pure display helpers: formatWeekRange, formatWeekRange, formatNextReport, formatGeneratedAt, dayAbbrevFromIso, complianceTextClass/BorderClass/Label, formatVolume, dayStatusClass, dayStatusSymbol (~130 lines)
- lib/analysis/weekly-report-display-pure.test.ts — 53 tests (UTC safety, all compliance variants, boundary cases, negative cases including 0/0 volume, future timestamps, edge day-of-week values); all pass
- components/patrol/weekly-report-hero.tsx — WeeklyReportHero Card component with full report view and prompt state; DayRow sub-component; prop interface: { report: WeeklyReport | null } (~140 lines)
- components/settings/weekly-report-toggle.tsx — WeeklyReportToggle client component; optimistic useState + useTransition pattern matching FirstDayOfWeekToggle; on/off buttons + day picker select; aria-pressed, labels, disabled states (~110 lines)
- app/(app)/patrol/page.tsx — wired WeeklyReportHero as first element in PatrolDashboard return; generateWeeklyReportIfDue + getPersistedWeeklyReport fallback called on every Patrol load
- app/(app)/settings/page.tsx — added Weekly Report section with WeeklyReportToggle; getWeeklyReportEnabled + getWeeklyReportDay read server-side and passed as initial props

### In progress
- Nothing active

### Blocked
- Pre-existing TS error in components/patrol/shoe-recommendation-card.tsx (line 21 — unterminated string literal). Pre-dates this branch; not introduced by this session. Does not affect test suite or runtime.

### Next session should
- Consider Phase 19 backlog: shadcn Tooltip/Progress/Alert/Skeleton; ComplianceRow responsive layout; Patrol chip cluster redesign
- Manual smoke-test: open Patrol with feature disabled (confirm prompt card renders); enable in Settings; open Patrol again (confirm hero renders)
- Consider pulling WeeklyReportHero outside PatrolDashboard into PatrolPage so it shows even when no active plan is configured

## Key decisions made
- Display: PERSISTENT — persist full report payload JSON (weeklyReportPayload in settings store). Frontend reads snapshot on every Patrol load.
- QA STANDARD (standing, all future VELOCITY work): negative tests required for all UI components and integrations — error states, null/empty props, disabled states, invalid inputs, failed async, renders-when-data-absent.
- phase label falls back to "No active plan" when getActivePlan() returns null or week number falls outside programWeeks range; no crash, no empty state panic.
- buildWeeklyReport accepts longRunTargetKm as a separate param (not derived from weekTemplate inside the pure function) so it stays mockable in tests.
- Component tests not possible per project architecture (no component test harness — environment: 'node', include: 'lib/**/*.test.ts'). Pure display-logic helpers extracted to weekly-report-display-pure.ts and fully unit-tested instead. This satisfies the QA standard at the testable boundary.
- WeeklyReportHero always renders something (prompt card) when report is null — never crashes, never renders nothing.

## Files changed this session

### Prior session (backend)
- lib/analysis/weekly-report-pure.ts (new, ~195 lines)
- lib/analysis/weekly-report-pure.test.ts (new, ~240 lines)
- lib/store/settings.ts (edited — +52 lines: 4 keys + 6 accessors)
- lib/actions/weekly-report.ts (new, ~165 lines)

### This session (frontend)
- lib/analysis/weekly-report-display-pure.ts (new, ~130 lines)
- lib/analysis/weekly-report-display-pure.test.ts (new, ~240 lines, 53 tests)
- components/patrol/weekly-report-hero.tsx (new, ~140 lines)
- components/settings/weekly-report-toggle.tsx (new, ~110 lines)
- app/(app)/patrol/page.tsx (edited — +8 lines: imports + hero integration)
- app/(app)/settings/page.tsx (edited — +30 lines: imports + section + Promise.all)
- PROGRESS.md (this file)
