## Branch
main (Phase 1 scaffold)

## Session: 2026-06-29

### Completed

**Phase 1 — GHOST Scaffold**

Full zero-cost PWA + desktop architecture scaffolded. Forked from VELOCITY at commit `7b67daa`.

- Vite 6 + React 19 + React Router 7 replaces Next.js 15 + Electron
- wa-sqlite + IDBMirrorVFS Web Worker (SQLite in browser, no COOP/COEP, GitHub Pages compatible)
- 14 route stubs + TopNav + PageSkeleton
- 56 pure-function files + tests copied from VELOCITY (unchanged logic)
- Cloudflare Worker for Strava OAuth token swap (the only server code)
- Tauri 2 Rust scaffold for 3-8 MB desktop installers
- GitHub Actions: Pages deploy + Worker deploy + Tauri cross-build
- CLAUDE.md, PHASES.md, PROGRESS.md

### In progress
- Nothing

### Blocked
- GitHub repo must be created manually — PAT lacks repo creation scope.
  Run: `gh repo create rjsmegmpdc/night-ninjas-ghost --public`
  Then: `git push origin main`

### Next session should
1. `npm install` and fix wa-sqlite WASM import paths
2. Strip `server-only` from copied `src/lib/` files; fix import aliases
3. `npm run build` green
4. `npm test` green
5. Enable GitHub Pages (repo Settings → Pages → GitHub Actions source)
6. Add secrets: `STRAVA_OAUTH_WORKER_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
7. Port `/patrol` page — highest daily-use priority

## Key decisions
- IDBMirrorVFS: no COOP/COEP needed — GitHub Pages works natively
- One Cloudflare Worker: unavoidable — Strava blocks browser CORS on /oauth/token (confirmed by research)
- Tauri 2 unsigned: acceptable for club-internal distribution
- Pure engines: 56 files copied unchanged — same tests, zero logic changes

## Files changed
- Initial scaffold — see PHASES.md Phase 1 for full list
