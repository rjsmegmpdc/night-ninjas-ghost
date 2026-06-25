# CLAUDE.md — VELOCITY Project Contract

## Startup ritual (read this first, every session)

1. Read `PROGRESS.md` — if it doesn't exist, create it from the template at the bottom of this file
2. Read `PHASES.md` current state section to understand where the project stands
3. Check `git status` and `git log --oneline -5` to anchor to current branch and recent commits
4. If `AGENT_STOP` exists in the project root, stop immediately and report it
5. Proceed with the session's task

## Stop ritual (before ending every session)

1. Update `PROGRESS.md` — what was completed, what is blocked, what is next
2. Any uncommitted work is checkpointed by the `commit-on-stop` hook automatically
3. If a `feat/` branch has work, push it

## Project at a glance

**Stack**: Next.js 15, React 19 RC, Drizzle ORM + better-sqlite3 (SQLite), keytar, Tailwind CSS, Vitest  
**DB**: 20 tables — `activities`, `sync_jobs`, `plans`, `shoes`, `journal` (and 15 more; see `lib/db/schema.ts`)  
**Routes**: 14 authenticated screens (`/patrol` is the daily-use screen), `/setup` wizard, `/api/*`  
**Tests**: 29 test files, 472 tests — all pure functions, no DB, no network  
**DB path**: `%APPDATA%\NightNinjas\shadow-tracker.db`

## Critical rules

- **Never commit to `main` directly** — always `git checkout -b feat/<name>` first
- **No PR required** — this is `github.com/rjsmegmpdc` (Matt's personal account); branch discipline applies but Matt merges directly
- **Pure functions only in `*-pure.ts`** — no DB imports, no Next.js context; safe to test with Vitest
- **UTC date arithmetic** — all date comparisons: `new Date(isoStr + 'T00:00:00Z')` + `.getUTCFullYear()`/`.getUTCMonth()`/`.getUTCDate()`
- **Local day-of-week parsing** — `dowOf()` in compliance uses explicit component parsing, never `new Date(isoStr).getDay()`

## Key files to orient fast

| Area | File |
|---|---|
| Development ledger | `PHASES.md` |
| Architecture | `ARCHITECTURE.md` |
| Test guide | `TESTING.md` |
| DB schema | `lib/db/schema.ts` |
| Sync runner | `lib/sources/sync-runner.ts` |
| Plan engines | `lib/plans/` |
| Analysis | `lib/analysis/` |
| Server actions | `lib/actions/` |

## Operator controls

- **Emergency stop**: `touch AGENT_STOP` in project root — all tool calls halt immediately via kill-switch hook
- **Mid-run steering**: write instruction to `STEER.md` — agent reads it once then clears it
- **Checkpoint commit**: happens automatically on session stop via commit-on-stop hook
- **Quality gate**: run `.claude/agents/evaluator.md` as a subagent after significant changes

## PROGRESS.md template

```markdown
# PROGRESS.md

## Branch
feat/<name>

## Session: <YYYY-MM-DD>

### Completed
- 

### In progress
- 

### Blocked
- 

### Next session should
- 

## Key decisions made
- 

## Files changed this session
- 
```
