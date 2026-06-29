# PHASES.md — GHOST Development Ledger

## Current state

**Version**: 0.1.0  
**Branch**: main (scaffold)  
**Tests**: 56 pure-function files ported from VELOCITY — need import-path fixes before running  
**Status**: Phase 1 scaffold complete. Vite + React + Router shell, wa-sqlite worker, all 14 route stubs, Tauri config, Cloudflare Worker, GitHub Actions (Pages + Worker + Desktop). Pure engines copied. Next: fix imports + get build green.

---

## App routes (14 screens)

| Route | Name | Status |
|---|---|---|
| `/patrol` | Patrol | Stub — port from VELOCITY |
| `/recon` | Recon | Stub |
| `/dojo` | Dojo | Stub |
| `/calendar` | Calendar | Stub |
| `/coach-log` | Coach Log | Stub |
| `/race` | Race | Stub |
| `/strike` | Strike | Stub |
| `/vo2max` | VO2max | Stub |
| `/shoes` | Shoes | Stub |
| `/journal` | Journal | Stub |
| `/profile` | Profile | Stub |
| `/club` | Club | Stub |
| `/settings` | Settings | Stub |
| `/help` | Help | Stub |
| `/setup/*` | Setup wizard | Stub |

---

## Phase history

### Phase 1 — GHOST Scaffold (2026-06-29)

**What**: Forked from VELOCITY (night-ninjas-shadow-trackerv2). Replaced Next.js 15 + Electron with Vite 6 + React 19 + React Router 7 + Tauri 2. Established the full zero-cost distribution architecture.

**Forked from**: `github.com/rjsmegmpdc/night-ninjas-shadow-trackerv2` at commit `7b67daa`

**Key decisions**:
- **wa-sqlite + IDBMirrorVFS** (IndexedDB backend): no COOP/COEP headers required — GitHub Pages works without tricks. Confirmed by wa-sqlite docs and research (2026-06-29).
- **GitHub Pages** over Cloudflare Pages: free, zero extra accounts. IDBMirrorVFS removes the header requirement that previously forced Cloudflare.
- **One Cloudflare Worker** (free tier, 100k req/day): the only server piece — exists because Strava blocks CORS on `/oauth/token`. Research confirmed Strava deliberately disables browser CORS on the token endpoint.
- **Tauri 2** over Electron: ~5 MB vs ~200 MB installer; uses OS webview (WebView2/WKWebView); unsigned for now.
- **Pure engines copied verbatim** from VELOCITY `lib/*/` → `src/lib/*/` — 56 files, no logic changes, same tests.

**Files created**:
- `vite.config.ts` — Vite 6 + React + Tailwind 4 + vite-plugin-pwa + wa-sqlite WASM
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`
- `index.html` — PWA meta, apple-touch-icon, viewport
- `src/index.css` — Tailwind 4 `@theme` design tokens (ink/bone/accent/signal)
- `src/main.tsx` — entry point + `navigator.storage.persist()`
- `src/App.tsx` — React Router, 14 lazy-loaded routes, DbProvider
- `src/db/worker.ts` — wa-sqlite + IDBMirrorVFS Web Worker + migrations runner
- `src/db/client.ts` — postMessage async bridge (query/exec)
- `src/db/DbContext.tsx` — React context for DB ready state
- `src/db/migrations.ts` — initial schema (8 tables, 3 indexes)
- `src/components/nav/TopNav.tsx` — NavLink nav with active pill
- `src/components/ui/PageSkeleton.tsx` — loading skeleton
- `src/routes/*/` — 15 stub page components
- `src/lib/` — 56 pure-function files from VELOCITY (analysis, plans, coach, race, ai, weather, garmin)
- `oauth-worker/wrangler.toml` + `oauth-worker/src/index.ts` — Cloudflare Worker: `/exchange` + `/refresh` Strava token swap
- `src-tauri/tauri.conf.json` + `Cargo.toml` + `src/main.rs` + `src/lib.rs` + `build.rs` — Tauri 2 Rust scaffold
- `.github/workflows/deploy.yml` — GitHub Pages PWA on push to main
- `.github/workflows/worker.yml` — Cloudflare Worker on oauth-worker/** changes
- `.github/workflows/desktop.yml` — Tauri cross-build (Windows + macOS) on v* tag → GitHub Release draft

**Next phase (Phase 2)**:
1. `npm install` + fix wa-sqlite WASM import paths in `src/db/worker.ts`
2. Strip `'server-only'` / Next.js guards from copied `src/lib/` files; fix import aliases (`lib/` → `src/lib/`)
3. Get `npm run build` green (Vite)
4. Get `npm test` green (pure function tests — should need import-path fixes only)
5. Deploy manually to GitHub Pages for first live URL
6. Port `/patrol` page — highest daily-use value, port first
7. Port Strava sync to browser-side fetch via the Cloudflare Worker
8. Port setup wizard to React Router nested routes

---
