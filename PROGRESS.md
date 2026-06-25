# PROGRESS.md

## Branch
feat/cwc-agent-harness

## Session: 2026-06-25

### Completed
- Phase 17A: robustness fixes (stale pending jobs, null start_date, cursor +1, secrets comment, API key redaction)
- Phase 17B: analytics glossary, dojo descriptions, orientation banner, enum validation, gear dedup, migration tracking
- Phase 18 docs: PHASES.md complete rewrite (Phases 1–18, 20 tables, 14 routes), ARCHITECTURE.md, TESTING.md, /test-lab page
- Phase 18 skills audit: 17 backlog items fixed (code correctness, component Card consistency, content slop removal)
- CWC harness: CLAUDE.md, PROGRESS.md, kill-switch, steer, commit-on-stop hooks, evaluator agent

### In progress
- Nothing active

### Blocked
- Nothing blocked

### Next session should
- Merge pending branches: `feat/docs-architecture-testlab` and `feat/skills-audit-improvements` and `feat/cwc-agent-harness` into main
- Consider Phase 19 backlog items: shadcn Tooltip/Progress/Alert/Skeleton; ComplianceRow responsive layout; Patrol chip cluster redesign; Patrol skeleton loading state
- Consider Garmin active sync (P1 in next-phase candidates)

## Key decisions made
- CWC harness patterns adopted: PROGRESS.md handoff, kill-switch, steer, commit-on-stop, fresh-context evaluator
- Deferred: verify-gate (no test-results.json equivalent in VELOCITY), track-read (audit complexity not needed yet)
- Gemini API key available → banana-claude can be installed; ckm-design fully enabled

## Files changed this session (Phase 18 skills audit)
- lib/actions/recurring-sessions.ts
- lib/actions/calendar-events.ts
- lib/analysis/compliance.ts
- lib/store/settings.ts
- lib/ai/client.ts
- components/patrol/ramp-card.tsx
- components/patrol/progression-flag-card.tsx
- components/patrol/ns-guardrails-card.tsx
- components/patrol/interruption-indicator.tsx
- app/(app)/help/page.tsx
- app/(app)/test-lab/page.tsx
- components/patrol/orientation-banner.tsx
- PHASES.md
- ARCHITECTURE.md
