## Branch
main

## Session: 2026-06-30

### Completed

**Phase 2 — Green build + 474/474 tests — merged to main**

- `npm run build` green (Vite, 5.86s)
- `npm test` 474/474 passing (2 suites deferred — see below)
- wa-sqlite worker: `IDBBatchAtomicVFS` replaces `IDBMirrorVFS` (v1.0.0 API change)
- `worker: { format: 'es' }` in vite.config.ts (dynamic imports require ES worker format)
- Vitest config split from vite.config.ts (`test` block invalid in Vite config)
- `tsconfig.app.json` excludes `*.test.ts` from build type-checking
- `src/vite-env.d.ts` created (fixes `Cannot find module ./index.css`)
- Deleted `postcss.config.mjs` (Next.js leftover; Tailwind 4 Vite plugin owns PostCSS)
- Missing pure libs copied from VELOCITY and stripped of `server-only`:
  `compliance.ts`, `load.ts`, `ns-guardrails.ts`, `sport-classifier.ts`,
  `vo2max-insights.ts`, `garmin/mapper.ts`, `garmin/types.ts`,
  `plans/types.ts`, `plans/state-awareness.ts`
- Merged `feat/phase2-green-tests` → `main`, pushed to `github.com/rjsmegmpdc/night-ninjas-ghost`

**Phase 1 — GHOST Scaffold — merged to main (2026-06-29)**

Full zero-cost PWA + desktop architecture scaffolded and merged. Forked from VELOCITY at commit `7b67daa`.

- Vite 6 + React 19 + React Router 7 replaces Next.js 15 + Electron
- wa-sqlite + IDBBatchAtomicVFS Web Worker (SQLite in browser, no COOP/COEP, GitHub Pages compatible)
- 14 route stubs + TopNav + PageSkeleton
- 56 pure-function files + tests copied from VELOCITY (unchanged logic)
- Cloudflare Worker for Strava OAuth token swap (the only server code)
- Tauri 2 Rust scaffold for 3-8 MB desktop installers
- GitHub Actions: Pages deploy + Worker deploy + Tauri cross-build
- CLAUDE.md, PHASES.md, PROGRESS.md

### In progress
- Nothing

### Blocked
- `engine-snapshot.test.ts` — needs `src/lib/plans/index.ts` + all 9 plan engines (hansons, lydiard, daniels, pfitzinger, higdon, polarised, ultra, custom, norwegian-singles) + `derive.ts`
- `framework-stats.test.ts` — needs `framework-stats.ts`, `week-queries.ts`, `intensity-distribution.ts`, `program-phase.ts`

### Next session should
1. Enable GitHub Pages (repo Settings → Pages → GitHub Actions source)
2. Add secrets: `STRAVA_OAUTH_WORKER_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
3. Port `/patrol` page — highest daily-use priority
4. Port Strava sync to browser-side fetch via Cloudflare Worker
5. Port setup wizard to React Router nested routes

## Key decisions
- IDBBatchAtomicVFS (not IDBMirrorVFS): wa-sqlite v1.0.0 renamed the VFS; no COOP/COEP needed
- One Cloudflare Worker: unavoidable — Strava blocks browser CORS on /oauth/token
- Tauri 2 unsigned: acceptable for club-internal distribution
- Pure engines: 56 files copied unchanged — same tests, zero logic changes
- `engine-snapshot` and `framework-stats` deferred: deep dependency chains, not blocking PWA MVP

## Files changed
- Phase 1: initial scaffold — see PHASES.md Phase 1 for full list
- Phase 2: see commit `6a7957a` on `feat/phase2-green-tests`
