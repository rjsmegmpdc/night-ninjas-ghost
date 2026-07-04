## Branch
feat/patrol-plan-aware

## Session: 2026-07-04

### Completed

**Plan Engines + Patrol Plan-Aware — feat/patrol-plan-aware (in progress)**

- Ported all 9 plan engines: hansons (full), lydiard, daniels, pfitzinger, higdon, polarised, norwegian-singles, ultra, custom
- `src/lib/plans/calendar-blocks.ts` — pure TypeScript composer used by all engines
- `src/lib/plans/index.ts` — ENGINES registry, getEngine(), ALL_ENGINES
- `src/lib/plans/program-phase.ts` — ProgramPhase type
- `src/lib/analysis/intensity-distribution.ts` — IntensityDistribution interface
- `src/lib/analysis/framework-stats.ts` — per-dojo 4-stat dispatch (getFrameworkStats)
- `src/lib/analysis/week-queries.ts` — backToBackKm, totalElevationGainM, getActivePlanPeriod()
- `vitest.config.ts` — removed engine-snapshot + framework-stats from exclude list
- Engine snapshot test suite: 54 tests now passing (was excluded/deferred)
- PatrolPage: plan-aware rewrite — 7-day compliance matrix, "tonight's mission" card,
  dojo-specific FrameworkStatsRow; falls back to generic when no plan configured

**Batch 4 — Settings, Help, Club, Journal — merged to main**

- SettingsPage: Strava status, sync history, data stats, JSON export (Blob download), three-step wipe-with-CLEAR confirm
- HelpPage: fully static reference — glossary (14 screens), 7 common tasks, storage guide, troubleshooting, privacy
- ClubPage: identity inputs (athlete name + parkrun ID → settings), 4-week run summary with CSS bar chart, clipboard share text, recent runs list
- JournalPage: 35-day Mon-anchored calendar grid (activity dots + energy bar), click-to-expand day detail with notes upsert, 5-week summary table
- Documentation updated: README, CLAUDE.md, PHASES.md, PROGRESS.md

**Batch 3 — Race, Vo2max, Coach Log — merged to main**

- RacePage: pace plans (even/negative/progressive), fueling grid, carb-load 3-day plan, taper checklist, post-race recovery + debrief form (race_results table), Auckland weather via Open-Meteo, macrocycle block counter
- Vo2maxPage: trend card with SVG sparkline + ACSM fitness band, 3-tier insights, Cooper/Rockport/Lab capture tabs, observation history, profile quick-form
- CoachLogPage: 14-day activity bar strip, 4-metric wellness sparklines, emoji-picker daily log with upsert, 42-day history with inline edit + two-step delete
- Migration 0003: race_results + vo2max_observations tables

**Batch 2 — Dojo, Strike, Calendar — merged to main**

- DojoPage: 9-methodology picker (5 primary + 4 collapsible), level toggle, macrocycle bar (base/build/peak/taper phases), start-date editor, plan writes to plans + plan_periods
- StrikePage: CTL/ATL/TSB, 8-week intensity history (stacked bars), mileage trajectory, long-run block — wired to load.ts + athlete-state-pure.ts
- CalendarPage: goal race management, tune-up races, capacity caps, commitments CRUD
- Migration 0002: is_goal + level on races; recurring_sessions table

**Batch 1 — Profile, Shoes, Recon — merged to main**

- ProfilePage: athlete profile (age/weight/sex/HR zones), NS HR calibration, strength preferences, morning check-in with journal upsert
- ShoesPage: LEFT JOIN distance aggregate, progress bars (green/amber/red), add/retire/unretire actions
- ReconPage: monthly volume bar chart, zone distribution stacked bars, CTL/ATL line chart — trends-only (no plan engine needed)

**Phase 2 — Green build + 474/474 tests — merged to main (2026-06-30)**

- wa-sqlite OPFS VFS (AccessHandlePoolVFS) replacing IDBMirrorVFS
- MemoryVFS fallback for Safari + private browsing
- IDB version conflict root-cause found + resolved (service worker caching old builds)
- Strava OAuth working: `night-ninjas-ghost.pages.dev` live
- Full activity sync confirmed

**Phase 1 — GHOST Scaffold — merged to main (2026-06-29)**

- Vite 6 + React 19 + React Router 7 replaces Next.js 15 + Electron
- wa-sqlite Web Worker, Cloudflare Worker OAuth proxy, Tauri 2 scaffold
- 14 route stubs, 56 pure engine files copied from VELOCITY
- GitHub Actions: Cloudflare Pages + Worker deploy + Tauri cross-build

### In progress
- `feat/patrol-plan-aware` — plan engines + plan-aware PatrolPage (not yet merged)

### Blocked
- Nothing (plan engines unblocked engine-snapshot + framework-stats test suites)

### Next session should
1. Merge `feat/patrol-plan-aware` to main (Matt's call)
2. Wire up AI coach (Anthropic BYOK) — architecture is ready, BYOK key entry needed
3. Consider Garmin Connect biometrics sync (`daily_health_metrics` table not ported)

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Worktree isolation per agent**: parallel developer agents each got an isolated git worktree; outputs copied back after verification
- **No plan engines yet**: pure support files (capacity-pure, pace-compliance-pure, etc.) exist; individual engine renderers (hansons.ts etc.) not yet ported — Dojo shows static descriptions, Patrol shows trends-only

## Files changed (Batch 4)
- `src/routes/settings/SettingsPage.tsx`
- `src/routes/help/HelpPage.tsx`
- `src/routes/club/ClubPage.tsx`
- `src/routes/journal/JournalPage.tsx`
- `README.md`, `CLAUDE.md`, `PHASES.md`, `PROGRESS.md`
