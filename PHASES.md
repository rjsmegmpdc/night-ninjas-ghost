# PHASES.md — GHOST Development Ledger

## Current state

**Version**: 0.6.0  
**Branch**: main  
**Tests**: 574/574 passing (32 test files)
**Status**: All 14 screens implemented. Plan engines (9 dojos), plan-aware Patrol dashboard, AI coach (BYOK Anthropic), biometrics check-in and Strike card all shipped.

---

## App routes (14 screens + setup)

| Route | Name | Status | Batch |
|---|---|---|---|
| `/setup/*` | Setup wizard | ✅ Implemented | Initial |
| `/patrol` | Patrol | ✅ Plan-aware (7-day grid, tonight's mission, dojo stats) | Initial |
| `/profile` | Profile | ✅ Implemented | 1 |
| `/shoes` | Shoes | ✅ Implemented | 1 |
| `/recon` | Recon | ✅ Implemented | 1 |
| `/dojo` | Dojo | ✅ Implemented | 2 |
| `/strike` | Strike | ✅ + BiometricsCard (HRV/RHR/sleep/body battery) | 2 |
| `/calendar` | Calendar | ✅ Implemented | 2 |
| `/race` | Race | ✅ Implemented | 3 |
| `/vo2max` | VO2max | ✅ Implemented | 3 |
| `/coach-log` | Coach Log | ✅ + AI coach panel + HRV/body battery check-in | 3 |
| `/settings` | Settings | ✅ + BYOK Anthropic key | 4 |
| `/help` | Help | ✅ Implemented | 4 |
| `/club` | Club | ✅ Implemented | 4 |
| `/journal` | Journal | ✅ Implemented | 4 |

---

## Remaining opportunities

### UX / personalisation

| Feature | Dependency | Notes |
|---|---|---|
| GHOST logo → configurable home button | None | `localStorage.ghost.home_page`; dropdown in Settings Display section; default `/calendar` |
| Display preferences — font scale | None | 4 sizes (0.85/1/1.15/1.3×); CSS `--font-scale` var on `<html>`; `applyDisplayPrefs()` in `main.tsx` before render |
| Display preferences — 6 color presets | None | `data-theme` on `<html>` + CSS token overrides for Ink/Dusk/OLED/Storm/Dawn/High Contrast |
| Slicker first-run onboarding | None | Detect no Strava token → redirect to `/setup` login-style screen; StatHunters-style flow; auto-trigger first sync after OAuth |
| Privacy-first storage notice | First-run onboarding | Full-screen plain-language card before first OAuth; acknowledged via `localStorage.ghost.privacy_acknowledged`; explains OPFS, localStorage, and token storage |
| Strava Client ID localStorage cache | First-run onboarding | Pre-fills setup form on return visits; token stays in OPFS only (not localStorage) |

### Data

| Feature | Dependency | Notes |
|---|---|---|
| Garmin Connect OAuth sync | `daily_health_metrics` schema ✅, mapper ✅ | Needs Garmin developer registration + Cloudflare Worker |
| Strike: 28-day mileage chart | Recharts (already in deps ✅) | Actual vs planned rolling weekly volume |
| Patrol: tonight's mission deep-link | None | Opens activity in Strava app / recording |
| Ultra plan stub | `src/lib/plans/ultra.ts` | `status: 'stub'` — lowest priority |
| Patrol compliance flag display | ✅ Done (feat/patrol-compliance-flags) | FAST/SLOW/SHORT badges now shown on week grid |

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
