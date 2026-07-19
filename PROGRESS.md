## Branch
docs/ios-investigation (merged to main)

## Session: 2026-07-19 (continued — iOS "buttons don't work" investigation + eslint gate)

### Completed

**ESLint hooks gate** — `eslint.config.mjs` (react-hooks/rules-of-hooks = error, exhaustive-deps = warn, src-only scope), `npm run lint`, wired as a hard gate in deploy.yml before tests. Green on current codebase.

**iOS "buttons don't work" report — investigated, cannot reproduce on current deployment.** Tested with real WebKit 26 via Playwright (iPhone 13 emulation, touch events):
- Full first-run flow works: privacy acknowledge → Connect-with-Strava link (shared app id present) → backup/restore.
- No-OPFS simulation (in-app webview conditions): MemoryVFS fallback works, app interactive.
- Checked and cleared: viewport meta, hover-gated controls, pointer-events, fixed-overlay hit-blocking.
- **Cloudflare Access finding**: only `/sync/start` on the oauth worker is Access-gated ("GHOST profile sync" app, anyone-with-email OTP) — deliberate identity layer, NOT a general blocker. The VELOCITY Access app gates only v1's worker.
- **Most probable explanation**: the reporter hit one of the two now-fixed crashes (React #310 on /setup for connected users — live in prod 2026-07-12 → today; or PWA deploy-skew blank). Both made every tap dead. Fixed + guarded (self-heal reload, ErrorBoundary) earlier today; affected phones need one reload/app-relaunch to converge.
- If it recurs after a reload: need device details (iOS version, Safari vs in-app browser, which screen/buttons).

---

## Branch
fix/wizard-hooks-order (merged to main, deployed via Pages CI)

## Session: 2026-07-19 (continued — the real /setup crash)

### Completed

**Fix: React #310 on /setup for connected users** (surfaced by the new ErrorBoundary — this, not deploy skew, was the actual cause of Matt's original blank page)

- `TrainingWizard` (SetupPage.tsx) had its "load today's session on done-step" `useEffect` BELOW the `wizardLoading`/`shouldShow` early returns — first render mounted fewer hooks than later renders → React #310 → crash. Only reproducible with Strava tokens present (wizard only renders when connected), which is why the fresh-browser probe passed.
- Moved the effect above the early returns (self-gates on `step === 'done'`; behaviour identical).
- Swept the entire codebase with eslint react-hooks/rules-of-hooks (one-off flat config): zero violations remain.

Tests: 704/704. Build clean.

**Recommended follow-up**: add eslint + react-hooks rules to the repo and gate deploy.yml on it — this bug class is 100% machine-catchable and the repo has no linter today.

---

## Branch
fix/blank-page-chunk-skew (merged to main, deployed via Pages CI)

## Session: 2026-07-19 (continued — blank-page fix)

### Completed

**Fix: blank page when clicking Sync on Patrol** (Matt's report)

- Root cause: PWA deploy skew. `registerType: 'autoUpdate'` (skipWaiting + clientsClaim) means a tab running an old build loses its old precached chunks when a new deploy's sw takes control; Pages only serves current-build assets, so the next lazy route import (Sync → `/setup`) rejects — and with no ErrorBoundary, React unmounted to a permanent blank page. Two same-day deploys made this near-certain to hit.
- `src/main.tsx` — `vite:preloadError` self-heal: auto-reload once (fetches the fresh build), timestamp-latched to at most one reload per minute so a persistent failure can't reload-loop.
- `src/components/ui/ErrorBoundary.tsx` (new) + wired around routes in `App.tsx` (resets on navigation) — any render/chunk error now shows a styled "This screen hit an error / RELOAD APP" card instead of a blank page.
- Verified with headless-Edge simulation (chunk deleted from dist + caches cleared, mirroring production): one auto-reload, then ErrorBoundary; never blank. Fresh-profile probe of the live site confirmed /setup itself is healthy — the failure was state, not the page.

Tests: 704/704. Build clean. User unblock: close all GHOST tabs / hard-refresh once; future deploys self-heal.

---

## Branch
feat/ui-kiero-2 (merged to main, deployed via Pages CI)

## Session: 2026-07-19 (continued — Kiero across the rest of the site)

### Completed

**Kiero pass 2 — remaining routes** (Matt approved the deployed rebrand incl. dusk, then asked to carry on across the site)

- **gear** — `rotationAdvice` badges now tone-tinted status pills (colour was previously computed then discarded); "Replace"/"Worn" wear warnings are pills; Shoe Intelligence `WorkoutCard` performance score renders as a RingGauge (was linear bar + "/100" text).
- **vo2max** — fitness band (superior…developing) renders as a status pill via re-tooled `BAND_CLASS`.
- **recon** — `FitnessFatigueCard` form badge now uses `formBadge()`'s tone classes (they existed but the render used a monochrome pill).
- **strike** — athlete-state header badge tone-tinted via new `FORM_PILL`; Sleep Score + Body Battery (/100 device scores) render as RingGauges (HRV/RHR stay numerals — unbounded); LongRunCard "% of week" renders as a RingGauge.
- Skipped as already Kiero-adequate: race severity badges, calendar/journal/vo2max source pills. Skipped as low-payoff: dojo phase text, club improvement label.

Tests: 704/704. `tsc -b && vite build`: clean. Deployed by merge to main.

---

## Branch
feat/ui-kiero (merged to main, deployed via Pages CI)

## Session: 2026-07-19

### Completed

**Kiero visual rebrand** (style reference: Kiero screenshots in the v2 repo's `brief/screenshots/AI/`; same pass already applied to VELOCITY v2)

- **M3 re-seed**: `scripts/generate-m3-tokens.mjs` — seed + `--m3-brand` flipped from GHOST orange `#FF5F00` to Kiero teal `#2DD9CE` (`npm run tokens` re-run; ink primary now `#00ded2`). Storm keeps its blue seed (deliberate alternate identity); dusk re-seeded to muted deep teal `#1D8C84`; dawn brand deepens to `#0D9488` for light contrast. Every route re-themes through the M3 roles — no component changes needed for colour.
- **Kiero radius**: `src/index.css` — `m3-card` 12px→20px, `--radius-2xl` 16px→20px (Patrol cards et al.).
- **RingGauge** (`src/components/ui/RingGauge.tsx`, new): pure-SVG arc ring, strokes with `currentColor`, M3 outline-variant track.
- **ReadinessCard** (`PatrolPage.tsx`): score now renders as a Kiero readiness ring (arc = score/100) with label + recommendation beside it; colour still the engine-owned score token.
- **Week plan status pills** (`PatrolPage.tsx`): done/missed/tonight render as Kiero pill badges; upcoming/rest stay muted glyphs.
- **DESIGN.md**: current-state note added (M3 + Kiero, where tokens actually live, tailwind.config.ts is dead); locked decisions 1–3 updated to teal/M3-nav/20px.

Tests: 704/704. `tsc -b && vite build`: clean. Deployed by merge to main (deploy.yml gates on tests).

### In progress
- Nothing

### Blocked
- (carried) Profile Sync E2E verify — Cloudflare Access OTP issue
- (carried) Club admin writes E2E — same Access issue

### Next session should
- Eyeball night-ninjas-ghost.pages.dev after CI deploy: readiness ring, teal accent across themes (ink/oled/dawn/dusk), week-plan pills, bottom-nav active pill
- Consider ring-gauge treatment for Strike/VO2max hero numbers (same RingGauge component)
- Review device API research briefings and decide build order (carried)
- Address remaining open remediation items: R1 (Worker hardening), R13 (docs stale counts) (carried)

---

## Branch
feat/r2-settings-fix (merging to main)

## Session: 2026-07-13

### Completed

**Remediation wave 2 — R2, R4**
- **R2**: WebCrypto AES-256-GCM at-rest encryption for `strava_access_token`, `strava_refresh_token`, `strava.client_secret`, `ai.anthropic_key` — non-extractable CryptoKey in IndexedDB (`ghost-keystore`); `getSetting`/`setSetting` transparently encrypt/decrypt; plaintext migration on first read (fire-and-forget re-encrypt); 6 new tests (704 total). Follow-up applied: `SettingsPage.tsx` Anthropic key bypassed raw SQL — now routes through helpers.
- **R4**: CSP added — `public/_headers` for Cloudflare Pages PWA (`connect-src` Strava + `*.workers.dev`, `'wasm-unsafe-eval'` for wa-sqlite, no `'unsafe-inline'` in script-src); `src-tauri/tauri.conf.json` updated with Tauri 2 CSP including `tauri:` + `asset:` schemes. `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` also added.

**Research dispatched (pending results)**
- Garmin health metrics + workout push API feasibility
- Coros API feasibility
- Polar Accesslink API feasibility

### In progress
- Waiting on Garmin / Coros / Polar research results

### Blocked
- Profile Sync E2E verify — parked on Cloudflare Access OTP issue
- Club admin writes E2E — same Access issue

### Next session should
- Review device API research briefings and decide build order
- Address remaining open remediation items: R1 (Worker hardening), R13 (docs stale counts)

---

## Branch
feat/r3-r9-cleanup · feat/r10-worker-errors · feat/r11-query-opts (merging to main)

## Session: 2026-07-12

### Completed

**Phase 2 — AI Coach plan generation + setup wizard (merged)**
- `ai_plan_sessions` table (migration 0008), Worker `/generate-plan` endpoint (`claude-sonnet-4-6`, JSON plan)
- AI Coach dojo stub registered in ENGINES; snapshot-builder reads DB for AI Coach athletes
- 3-step setup wizard inline on SetupPage: Goal → Dojo → Plan generation; `wizard_complete` flag prevents re-showing
- CalendarPage Section 2: 6-week training plan view — AI Coach reads `ai_plan_sessions`, template dojos use `engine.renderWeek()`
- 698/698 tests throughout

**Remediation wave 1 — R3, R9, R10, R11**
- **R3**: Club hidden from nav and routing (`App.tsx` + `TopNav.tsx`); code preserved in `src/routes/club/` for later
- **R9**: Deleted stale VELOCITY artefacts — `.env.example`, `.github/workflows/build.yml` (Electron builder), `ShoesPage.tsx`; removed `drizzle-orm` dep; `lib/` root dir and `@anthropic-ai/sdk` verified in-use — kept
- **R10**: Worker `/revoke` success path normalised — no longer forwards raw Strava body; `console.error` logs upstream for diagnosability
- **R11**: `StrikePage.tsx` long-run query deduped (was 2 round-trips, now 1); `getStoredTokens` and `ReconPage` already optimal — no change needed

### In progress
- Wave 2 pending: R2 (WebCrypto at-rest token encryption) + R4 (CSP headers)

### Blocked
- Profile Sync E2E verify — parked on Cloudflare Access OTP issue
- Club admin writes E2E — same Access issue

### Next session should
- Spawn R2 + R4 agents (after wave 1 merged to main)
- Decision still open: R3 `/club/data` PII (Matt: "underwhelming, parked")

---

## Branch
test/coverage-expansion

## Session: 2026-07-09

### Completed

**test/coverage-expansion — in progress, not yet merged**

- Added 65 new tests across 5 new files; total suite now 662 passing (was 597)
- `vitest.config.ts`: widened `include` to `{ts,tsx}`; added `environmentMatchGlobs` (`.test.tsx` → jsdom, `.test.ts` stays node); added `coverage` block (provider: v8, reporters: text + html)
- New dev deps: `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/dom`, `jsdom@24`
- `src/lib/analysis/compliance.test.ts` (21 tests): `evaluateWeek` + `evaluateSession`; pace-band boundaries at min/max/inside/outside; NZ Monday 00:30 UTC-boundary DOW fix; rest/cross/strength session types; multi-run best-selection
- `src/db/migrations.test.ts` (13 tests): structural contract (4-digit prefix ordering, unique names, IF NOT EXISTS on all CREATE TABLE/INDEX); per-migration table presence; mock runner idempotency (run once then zero on second pass)
- `src/lib/db/sync.test.ts` (14 tests): 5 prod-incident scenarios — empty sync, duplicate strava_id upsert, missing optional fields, token expiry error propagation, RateLimitError → paused (not error), latestEpoch max epoch tracking. Used `vi.hoisted()` to solve RateLimitError class identity across mocks
- `src/lib/strava/credentials.test.ts` (12 tests): DB creds present/absent, env var fallback (documents module-load boundary limitation), getTokenCredentials filtering, save/clear trimming
- `src/routes/patrol/PatrolPage.test.tsx` (5 tests): jsdom smoke — not-ready → PageSkeleton, DB error → error message, ready + no data → "No activities synced", error path doesn't render skeleton

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
- Merge test/coverage-expansion to main after Matt reviews

---

## Branch
main (feat/sync-e2e-encryption merged)

---

## Remediation backlog — 3-lens review (added 2026-07-09)

Source: parallel read-only review by security / performance / test-coverage agents.
Repo confirmed **public** (`github.com/rjsmegmpdc/night-ninjas-ghost`) — raises stakes on committed config + leftover VELOCITY server code.
Ordered by priority. Check off as done; each is a `feat/`- or `fix/`-branch candidate.

### P0 — do first (highest impact, cross-lens)

- [ ] **R1 — Harden the OAuth Worker** (`oauth-worker/src/index.ts`) — hits security AND test top findings:
  - [ ] Close the origin-less bypass: `if (origin && origin !== allowed)` lets a request with **no** Origin header through. Change so a *missing* Origin on `/exchange`, `/refresh`, `/revoke` is rejected (drop the `origin &&` short-circuit for those routes). (~line 400)
  - [ ] `/revoke` is unauthenticated — anyone can revoke a leaked token. Gate it. (~line 415)
  - [ ] Add rate limiting (Cloudflare rules or KV/DO token bucket keyed by IP + email) — no throttle on any endpoint today.
  - [ ] Add a worker test suite (miniflare / `@cloudflare/vitest-pool-workers`): JWT verify (valid/expired/wrong-aud/wrong-iss/bad-sig), CORS allow/deny incl. no-Origin case, admin allowlist matching, credential precedence. Currently **zero** tests + **zero** infra.
  - [ ] Add a test/typecheck gate to `.github/workflows/worker.yml` — it deploys to prod on every push with **no gate** (unlike deploy.yml/desktop.yml which run `npm test`). At minimum `tsc --noEmit`.

- [ ] **R2 — Client secret storage** (`src/lib/db/settings.ts:60`, `src/lib/strava/credentials.ts:42`, SettingsPage Anthropic key) — Strava access+refresh tokens, `client_secret`, and Anthropic key are stored **plaintext** in the SQLite `settings` table. The "encrypted in IndexedDB" claim only covers the profile-sync blob in transit, NOT tokens at rest. (VELOCITY used the OS keychain — this is a regression.)
  - [ ] Decide: wrap at-rest with a non-extractable WebCrypto `CryptoKey`, and/or route desktop secrets through a Tauri OS-keychain command; **or** at minimum correct the docs (CLAUDE.md contract + privacy notice) to stop claiming at-rest encryption, and add CSP as compensating control (R4).

- [ ] **R3 — `/club/data` PII exposure** (`oauth-worker/src/index.ts:257`) — public unauthenticated endpoint returns every member's name + sex + year-of-birth + results. Decide: intentional (members consented to public listing) → leave; else gate behind Access or drop `yob`/`sex` from the public payload.

### P1 — high impact, single-lens

- [ ] **R4 — Add CSP** — Tauri `security.csp` is `null` (`src-tauri/tauri.conf.json:24`) = no CSP in the desktop shell; combined with plaintext secrets, XSS = full exfil. Add explicit `connect-src` allowlist (strava / anthropic / worker), `script-src 'self'`, `default-src 'self'`. Mirror it on the PWA via a `public/_headers` file (none exists) + `nosniff` / `Referrer-Policy` / `frame-ancestors 'none'`.

- [ ] **R5 — Batch the Strava sync writes** (`src/lib/db/sync.ts:123`) — upserts one row per worker round-trip inside the loop, no transaction → ~1500 postMessage round-trips + 1500 implicit transactions for a 5-year backfill. Add an `execBatch()`/`execMany()` primitive wrapping a page (≤200 rows) in one `BEGIN`/`COMMIT` / one worker message. The Garmin import path (`upsertHealthRows`) already does this correctly — copy the pattern. (10–50× faster backfill.)

- [ ] **R6 — Drop Recharts from manualChunks** (`vite.config.ts:63`) — `manualChunks: { charts: ['recharts'] }` forces the 412 KB chart chunk to be `modulepreload`'d on **every** page load, even though only StrikePage uses it (already `lazy()`). Remove the entry; let Rollup auto-split it behind the dynamic import. One-line change, removes 412 KB from every first load.

- [ ] **R7 — Test `compliance.ts` + `migrations.ts`**:
  - [ ] `evaluateWeek`/`evaluateSession` (`src/lib/analysis/compliance.ts`) — live on PatrolPage, **zero** direct tests (framework-stats.test.ts only borrows its type). Test pace-band boundaries, same-day best-run selection, rest/cross/strength cases, empty input. Also: `dowOf()` uses `.getDay()` (local) not `.getUTCDay()` — untested deviation from the UTC rule.
  - [ ] `migrations.ts` idempotency — later migrations mix non-idempotent `ALTER TABLE ADD COLUMN` with `CREATE TABLE IF NOT EXISTS` in one `exec()`, and the `_migrations` ledger INSERT runs *after* `exec()`. A mid-migration failure re-runs the whole thing → "duplicate column" → **permanently bricked local DB, no recovery**. Test idempotency + mid-migration-failure recovery, or fix the ordering (insert ledger row per-statement / split migrations).

- [ ] **R8 — Test Strava sync + credential precedence** (`src/lib/db/sync.ts`, `src/lib/strava/credentials.ts`) — this is the exact bug class that already caused a logged prod incident ("app locked to Matt"). Mock fetch/getSetting: stored-creds-win, env fallback, null-when-neither, token-refresh-only-near-expiry, rate-limit cursor resume.

### P2 — hygiene, lower impact

- [ ] **R9 — Prune dead code** (recommend to Matt before deleting, per repo rules):
  - [ ] ~180 tracked VELOCITY server files under root `lib/` (keytar secrets, Garmin MFA scraper, PATs) — dead, but public. Not imported by `src/`.
  - [ ] `src/lib/db/schema.ts` + `drizzle-orm` dep — only reached via `import type` (erased at compile), and the table defs don't match live `migrations.ts` (misleading).
  - [ ] `@anthropic-ai/sdk` (`package.json:19`) — listed dep, never imported (CoachLogPage uses raw fetch); 8.7 MB dead node_modules weight.
  - [ ] `src/routes/shoes/ShoesPage.tsx` (512 lines) — `/shoes` redirects to `/gear`; unreferenced, already excluded from build.
  - [ ] `.github/workflows/build.yml` — stale Electron/Next.js workflow from pre-fork VELOCITY; would fail if triggered.
  - [ ] `.env.example` — stale Next.js/`NN_DATA_DIR` refs.
- [ ] **R10 — Worker error hygiene** (`oauth-worker/src/index.ts:421,464`) — proxies raw upstream Strava error bodies into UI strings; normalize to generic message + status.
- [ ] **R11 — Query micro-opts** (all Low, bounded at current scale):
  - [ ] `getStoredTokens()` (`src/lib/db/settings.ts:42`) — 5 single-key queries → one `WHERE key IN (...)`; runs every app load + token refresh.
  - [ ] StrikePage (`src/routes/strike/StrikePage.tsx:191`) — 3 identical full-window queries for 3 aggregates; fetch once, pass rows to pure aggregators.
  - [ ] ReconPage (`src/routes/recon/ReconPage.tsx:121`) — 3 sequential `await`s → `Promise.all`.
  - [ ] `activities.gear_id` unindexed (used in GearPage shoe-stats JOIN) — add index if activity volume grows.
- [ ] **R12 — Supply chain / infra**: add `npm audit` + Dependabot to CI (not run today); add `@vitest/coverage-v8` so there's a hard coverage number (none configured).
- [ ] **R13 — Docs correction**: CLAUDE.md says "~474 tests" and PHASES.md "574/574" — actual is **597**. Update. Also note the plan engines (hansons/pfitzinger etc.) **are** ported + tested — CLAUDE.md's "not yet ported" note is stale.
- [ ] **R14 — Component tests (bigger investment)**: zero React component tests exist. If pursued, add `@testing-library/react` + jsdom as a second vitest env; start with PatrolPage (compliance grid) and SetupPage (onboarding/OAuth state machine).

### What the review confirmed is already solid
OAuth CSRF `state` (128-bit, single-use, strict validate) · E2E sync crypto (PBKDF2 310k / AES-256-GCM / non-extractable) · Access JWT verify (real RS256, not claim-decode) · all SQL parameterized · route-level `lazy()` on all 15 screens · correct sync (not async) wa-sqlite WASM + CacheFirst · date-bounded queries hitting `idx_activities_start_date` · CTL/ATL/TSB math O(window-days) not O(activity-count) · PatrolPage memoization · 597 pure-layer tests, no skipped/`.only`, realistic fixtures, NZ-Monday/UTC-Sunday boundary coverage.

---

## Session: 2026-07-08

### Completed

**feat/m3-motion — merged to main (42db7b2), DEPLOYED**

- M3 motion tokens (ease-standard/emphasized/decelerate/accelerate) as Tailwind easings
- Route fade-through enter (260ms emphasized-decelerate, keyed wrapper in App.tsx); button press feedback (scale 0.97); theme cross-fade; all off under prefers-reduced-motion

**fix(deploy): unlock for other athletes (89c027f)**

- Root cause of "app locked to Matt": deploy baked `VITE_STRAVA_CLIENT_ID` → all visitors hit Matt's API app, and Strava caps unapproved apps at ONE connected athlete
- Removed from build env (with explanatory comment); deployed site is now wizard-first — every athlete creates their own free API app per docs/ONBOARDING.md; Matt's stored tokens keep refreshing via worker env-secret fallback
- Matt liked the M3 look ✓

## Session: 2026-07-07

### Completed

**feat/m3-polish — merged to main (6cf9dc3), DEPLOYED**

- Per-screen M3 polish pass, all 15 screens: seam-grids eliminated (gap-2 rounded surface-container tiles), one filled hero card per screen, M3 button roles (filled/tonal/text/error-container), unified filled text fields, container-colored chips, list hover states
- `docs/M3-POLISH-GUIDE.md` committed — the recipes; PatrolPage is the hand-built reference
- Executed by 4 parallel frontend-ui-developer agents over disjoint screen sets; verified tsc/tests(597)/build/zero seam-grids
- **fix/m3-sweep-encoding (78f4ef8)**: the earlier sweep's PowerShell read (PS5.1 treats BOM-less UTF-8 as ANSI) had mangled 325 multibyte chars across 16 files, visible live — reversed losslessly (cp1252→UTF-8). **Lesson: never rewrite repo files via PS5.1 Get-Content/-Raw without -Encoding UTF8; use Read/Edit tools**

**feat/m3-redesign — merged to main (6c2ed04), DEPLOYED**

- Material 3 full-sweep redesign, all 15 screens (Matt's decisions: Material-first hybrid + full sweep in one go)
- Color: `scripts/generate-m3-tokens.mjs` runs Google's material-color-utilities at dev time → `src/m3-tokens.css` (six M3 dynamic schemes from the #FF5F00 seed; `npm run tokens` regenerates; zero runtime deps). Ink surface is now a warm brown-black #1e100b
- `index.css`: M3 roles as Tailwind utilities via `@theme inline`; ALL legacy tokens (ink/bone/accent/signal-miss) remapped to M3 roles — 15 screens re-theme live; `--font-mono` token → Roboto/system-ui (one-line app-wide typography switch); Bebas Neue stays for display; `--color-brand` = #FF5F00 for logotype
- Navigation: mobile = M3 top app bar + fixed bottom nav bar (Patrol/Dojo/Calendar/Club/Gear, pill indicators, iOS safe-area); desktop = left navigation rail; Recon+Settings as app-bar actions / rail foot
- Shape sweep: 191 `border border-ink-line` → `m3-card` (12px outlined cards); pills on buttons/chips; Settings swatches show real scheme values; PWA theme_color updated
- Gotchas fixed: material-color-utilities ESM needs vite-node with deps.inline; PowerShell `>` writes UTF-16 (generator now writes UTF-8 itself); `.claude/worktrees/` added to .gitignore
- 597 tests pass; production build verified; Pages deploy green
- **Follow-up candidates**: per-screen polish pass (some dense tables/grids deserve bespoke M3 treatment); Riegel of remaining Bebas/brand accents; motion (M3 transitions)

**feat/club-v2 — merged to main (bcbd20d), DEPLOYED LIVE**

- Club page v2: 6 tabs — Ninja Champs / Ninja Loop / Waiwera / Parkrun (link card, URL TBC) / Road Relays (link card, URL TBC) / My Training (old page preserved)
- Decisions taken (Matt, via AskUserQuestion): baseline = **Riegel prediction** from best of 5k/10k/21.1k PBs; datastore = **Cloudflare D1** approved
- Pure logic + 18 tests (597 total): `champs-pure.ts` (Riegel, improvement ranking, age groups, time parse), `leaderboard-pure.ts` (window/sex/age filters, legend-by-efforts)
- Worker `/club/*`: public `GET /club/data`; admin writes (member/result/champs-entry/winner + deletes) gated by Access JWT + `ADMIN_EMAILS` allowlist; admin auth reuses the /sync/start email-code handoff returning to /club
- Race-day UX: one admin on a phone — member picker with inline add, PB fields pre-fill from existing entry, finish time → standings re-rank live; viewers need no login
- **Infra provisioned live**: D1 `ghost-club` created (id d73cd23e…, region OC), schema applied (4 tables), `ADMIN_EMAILS=smharkness.nz@gmail.com`, worker deployed, `GET /club/data` smoke-tested 200; Pages deploy green
- `docs/CLUB-SETUP.md`: setup + race-day flow + endpoint reference
- **Still open**: Parkrun + Road Relays external URLs (constants `PARKRUN_URL`/`RELAYS_URL` in ClubPage.tsx); club admin writes untested end-to-end pending the Access OTP issue (same login flow as Profile Sync)

**feat/member-onboarding — merged to main (134b7db)**

- Help page: "Getting started" section (first on page) — 7 numbered steps for new club members: iOS home-screen-first rule, privacy card, API wizard, Connect, Profile Sync backup, personalisation
- `docs/ONBOARDING.md`: standalone shareable member guide (club chat / print) + quick answers
- Stale content fixed: Troubleshooting "Clear site data" advice removed (it deletes the OPFS DB!) → close-all-tabs recipe with warning; Shoes→Gear glossary/tasks; privacy section corrected (credentials wording, Profile Sync E2E, outbound calls)

**plan: Club page v2 spec added (ead029e)** — courses, leaderboards, Ninja Champs; see "Planned" section below. Two decisions pending from Matt: baseline equation (21.1k PB direct vs Riegel prediction from best of 5k/10k/21.1k) and D1 datastore approval.

**feat/sync-e2e-encryption — merged to main (44222b3)**

- Profile Sync now offered to club members / third parties → backups end-to-end encrypted; account owner cannot read them
- `src/lib/sync-crypto-pure.ts`: PBKDF2-SHA256 (310k iter) → AES-256-GCM; versioned envelope (salt/iv/ct); 5 new tests (round-trip, no plaintext leakage, wrong passphrase, tamper, fresh salt+iv) — 579 total passing
- Passphrase collected after the Access round-trip (never persisted); backup = choose (min 8, no-reset warning), restore = enter; wrong passphrase retries without redoing the email code
- Legacy v1 plaintext blobs still restorable; next backup overwrites with v2 envelope; worker unchanged
- Access policy note for club rollout: keep `Emails ending in @` (anyone) or list club emails in the Access policy for a closed group

**feat/profile-sync — merged to main (00366bc)**

- Optional cross-device backup/restore of the setup blob (API creds, display prefs, home page, gear profile) — never activities
- Identity: Cloudflare Access One-Time PIN on the worker's `/sync` path; app stays account-free
- Cookie-free JWT handoff: `/sync/start` (behind Access) bounces the Access JWT to the app in a URL fragment → app uses `Authorization: Bearer` — works in mobile Safari
- Worker verifies RS256 JWT against team JWKS (aud/iss/exp, 1h cert cache); KV key `profile:<email>`, 8KB JSON cap; 501 until configured (safe to deploy first)
- `src/lib/sync-profile.ts` + SetupPage Profile Sync section (Back up / Restore buttons); wizard points new devices at Restore
- `docs/ACCESS-SETUP.md`: complete one-time dashboard click-path (KV create, Zero Trust team, OTP login method, Access app on `/sync` with custom-domain fallback, AUD tag, wrangler vars, verify)
- **Matt's action required**: complete docs/ACCESS-SETUP.md Parts 1–5 (~10 min) to activate
- **Known limitation / follow-up**: blobs unencrypted in KV — add client-side encryption with recovery phrase before wider use

**feat/byo-strava-credentials — merged to main (49d8ef2)**

- Per-user Strava API app model: each user creates their own free API app; Client ID + Secret stored in local SQLite settings (`strava.client_id` / `strava.client_secret`), never leave the device except inside token requests
- New `src/lib/strava/credentials.ts`: `getStravaCredentials()` (stored-first, `VITE_STRAVA_CLIENT_ID` env fallback keeps baked-in deployments working), `getTokenCredentials()`, save/clear helpers
- `client.ts`: `exchangeCode`/`refreshAccessToken` accept optional credentials → included in worker request body
- `oauth-worker`: body credentials win, env secrets now optional fallback; pure-BYO deployment needs only `ALLOWED_ORIGIN`
- `SetupPage`: new `needs-credentials` state → `CredentialsWizard` — guided 2 steps: create app at strava.com/settings/api (copy buttons for website + callback domain, sensible field values shown), paste Client ID + masked Secret with validation; "Change API credentials" under Connection details
- Privacy notice: added plain-language paragraph — API app details stored locally, not your password
- Disconnect keeps credentials (only tokens cleared); full data wipe clears them
- Token refresh in `sync.ts` + GearPage passes stored credentials through

**feat/patrol-mission-links — merged to main (0b0fe55)**

- Tonight's mission (pending): "▶ Record on Strava" button via `strava://record` deep link — opens the Strava app's record screen; mobile-only (`sm:hidden`) since the scheme doesn't resolve on desktop
- Tonight's mission (done): each completed run links to its Strava activity page (universal link — app on phones, web on desktop); runs without stravaId stay plain text

**feat/mobile-polish — merged to main (dbcc5ba)**

- Full mobile-overflow audit of all 15 screens (Explore agent): one true breaker — Patrol `ActivityRow` fixed grid summed 412px, forcing horizontal page scroll on phones. Now 3-col grid + stats line under the name at mobile; 6-col grid from `sm:`
- **Contrast root cause**: `--color-bone-mute` #6E6E6A was ~3.7:1 on ink — fails WCAG AA (4.5:1) for small text; that's why Calendar looked faint. Raised to #8A8A85 (~5.5:1) globally; dusk/storm/dawn theme variants that also failed raised to match
- CalendarPage content bumped a tier: section heads → bone, race dates/distances → bone, metadata/notes → dim, NZ-race combobox city/date → dim
- **Gear form**: size field now category-aware — Food → "Volume" (500ml / 40g / 24-pack), Backpack → "Capacity", others "Size" (same DB column); single stacked column on mobile, full-width submit
- `ghost.gear_profile` (localStorage): remembers athlete's size/brand per category on each add; pre-fills next add and category switches, never overwrites typed input

**feat/strike-rolling-volume — merged to main (7979a73)**

- `StrikePage.tsx`: `RollingVolumeCard` — first Recharts use in GHOST (ComposedChart, lazy `charts` chunk ~112 kB gzip, loads only on Strike)
- 56 display days, each carrying its trailing 28-day run-km sum; single sliding-window pass computes both series
- **Actual**: orange area from activities (classifySport/isRunning filter)
- **Planned**: dashed grey line — active plan's `engine.renderWeek(params, weekNum).totalKmTarget / 7` per day, memoised per week, 0 outside program bounds; omitted (with a Dojo link hint) when no plan is active
- Header shows latest actual-vs-plan delta (+green / −amber)
- Card hidden entirely when no runs in the window

**feat/mobile-nav — merged to main (575ed08)**

- `TopNav.tsx`: mobile (< sm) header stacks into two rows — slim 10px GHOST brand strip + horizontally swipeable nav strip; desktop unchanged
- `index.css`: `@utility no-scrollbar` hides the scrollbar on the swipe rail
- GHOST label is now a `<Link>` home button on both layouts

**feat/display-preferences — merged to main (b357505)** *(was P1)*

- `main.tsx`: `applyDisplayPrefs()` runs before React mounts — no flash of wrong theme/font
- `index.css`: `html font-size: calc(130% * var(--font-scale, 1))`; base colors moved to `var(--color-ink/bone)`; 5 `[data-theme]` preset overrides (dusk, oled, storm, dawn, high-contrast)
- `SettingsPage.tsx`: Display section (first) — home page select, 4 font-size buttons, 6 theme swatches rendered in their own colours; all apply live + persist to localStorage
- `TopNav.tsx`: HOME read from `localStorage.ghost.home_page` per render

**feat/onboarding — merged to main (4ecf8a8)** *(was P2)*

- `App.tsx`: `useFirstRunRedirect` — `ghost.onboarded` localStorage fast path; unset → check stored tokens once DB ready → no tokens → redirect `/setup`; existing users backfilled. Root `/` honours `ghost.home_page`
- `SetupPage.tsx`: `PrivacyNotice` full card gates the first connect (plain-language OPFS/localStorage/token explanation, Strava revoke link, "Got it — let's go" → `ghost.privacy_acknowledged`); `NotConnected` restyled as login screen — OAuth params collapsed into `<details>`; `ghost.onboarded` set on token store, cleared on disconnect
- `SettingsPage.tsx`: full data wipe clears `ghost.onboarded`
- **Plan deviation**: no client-ID localStorage cache — Client ID is a build-time env var (`VITE_STRAVA_CLIENT_ID`), no user input exists to pre-fill; `ghost.onboarded` covers the fast-return intent

**feat/calendar-nz-race-search — merged to main (39af9a3)**

- `CalendarPage.tsx`: `RaceFormState` gains `raceUrl` and `raceSearchUrl` fields
- `NzRaceSearch` combobox component: filters all 49 `NZ_RACES` by name or city as user types (min 2 chars); dropdown shows race name, city, date, Half/Marathon badge
- Selecting a result auto-fills name, date, distance; selecting manually clears stored URLs
- Event page link (originator URL) + "Google if 404" fallback appear beneath name field after a NZ race is selected
- Works identically for both goal race and tuneup race add forms via shared `RaceForm` component

**feat/garmin-gdpr-import — merged to main (22cca3b)**

- `SettingsPage.tsx`: `GarminImportSection` added (Section 6)
- User unzips Garmin export, selects JSON files from `DI_CONNECT` folder; no JSZip dependency — native `File.text()` only
- `parseGarminFiles()`: iterates all records in each file; extracts date from `calendarDate`, `summaryDate`, `startTimestampGMT`, `date`, or `dailySleepDTO.calendarDate`
- Calls all existing mapper extractors (`extractSleep`, `extractDailySummary`, `extractHrv`, `extractWeight`, `extractVo2max`) per record; merges by date with null-coalescing
- Preview panel shows day count, oldest–newest range, and which metric types were found (RHR/HRV/Sleep/Stress/Body Battery/VO2 max/Weight) before user confirms
- `upsertHealthRows()`: BEGIN/COMMIT transaction; `ON CONFLICT DO UPDATE SET ... COALESCE` merges across re-imports without clobbering existing values
- Last imported timestamp stored in `settings` key `garmin_gdpr_imported_at`; displayed as relative time

### In progress
- Nothing

### Blocked
- Nothing

### In progress — Profile Sync verification (parked 2026-07-06)

Cloudflare side is fully deployed and smoke-tested (worker bindings live;
unauthenticated /sync/start 302s to Access login with correct AUD).
End-to-end verify is parked on an Access OTP issue:

- **Symptom**: "one-time PIN already used" on every attempt (×4) during restore
- **Likely causes**: (a) reading an older email in Gmail's collapsed thread —
  use the newest timestamp after Resend code; (b) a mail-scanner/link-checker
  consuming the single-use token (Defender/SafeLinks/AV link protection) —
  Cloudflare's fix is allowlisting noreply@notify.cloudflare.com
- **Checks done**: Access app path corrected `sync` → `sync/start` (fixes
  earlier "Failed to fetch" on /sync/profile — CORS preflight was being
  bounced to the Access login); policy uses Everyone selector
- **If OTP stays flaky**: add Google sign-in as a second login method in
  Zero Trust (Integrations → Identity providers) — no email tokens to eat

### Next session should

1. **Club page v2** (spec below) — start with the architecture decision, then build
2. Resume Profile Sync verification (above) — backup on desktop, restore on phone
3. Garmin Connect OAuth sync — **blocked**: needs Garmin developer registration first (external dependency, Matt's action)

---

## Planned — Club page v2: courses, leaderboards, Ninja Champs

Replaces/extends the current personal ClubPage (weekly volume view).

### Courses (tabs/sections on /club)

| Course | Type | Notes |
|---|---|---|
| Ninja Champs | Annual event | Held at the Millwater Half Marathon; improvement-ranked (below) |
| Road Relays | External link | Link card to another site — URL to come |
| Parkrun | External link | Link card to another site — URL to come |
| Ninja Loop | Leaderboard | Club course |
| Waiwera | Leaderboard | Club course |

### Leaderboards (per course)

Strava-style filters, all combinable:
- **Window**: last 12 months (rolling) / calendar year / all time
- **Age group**: standard brackets (e.g. U20, 20–34, 35–39, 40–44, 45–49, 50–54, 55–59, 60+)
- **Sex**: M / F / all
- **Legend**: most efforts on the course (Strava "Local Legend" analogue — count of attempts, not speed)

### Ninja Champs — improvement ranking

- Once a year at the Millwater Half Marathon
- **Entry model (key constraint)**: ONE person (race-day admin) typically
  enters all the data on a phone; everyone else only views results. Not
  per-athlete self-service.
- **Entry form**: one simple mobile-first form — athlete name (type-ahead over
  existing members, or add-new inline), sex, age group, best 21.1k / 10k / 5k
  times over the rolling 12 months, then Millwater finish time. Big touch
  targets, mm:ss / h:mm:ss inputs, one entry saved per tap — built for
  standing-at-the-finish-line use.
- **Results calculated on the fly**: the ranked table sits directly below the
  form and re-ranks live as each entry is saved — no "publish" step
- **Registration**: on the day; must be a Night Ninjas club member (the
  admin adding an athlete to the form IS the registration act)
- **Scoring**: simple best-time ÷ new-time division against the Millwater result:
  `improvement = baselineHalfTimeS / millwaterActualTimeS` — > 1.0 means faster than baseline; rank descending
- **Open question for Matt**: baseline = the entered 21.1k PB directly, or
  predicted from the best of 5k/10k/21.1k (Riegel t2 = t1 × (d2/d1)^1.06)?
  The 5k/10k inputs only matter if prediction is used — decide before build
- **Past winners**: by-year table (admin-entered history)

### Architecture decision (blocks build — decide first)

Leaderboards are shared multi-athlete data; GHOST is local-first with no
backend. The single-writer / many-readers model simplifies this. Proposal:
extend the existing `ghost-strava-oauth` worker with **Cloudflare D1**
(free tier) as the club datastore:

- Tables: `members` (name, sex, dob/age-group), `results` (member, course,
  date, time_s), `champs_entries` (member, year, pb_21k/10k/5k,
  millwater_time_s), `champs_winners` (year, member, improvement)
- **Writes**: admin-only — Access-JWT gated (same verified-email mechanism as
  profile sync) with the admin's email(s) allowlisted in the worker config;
  the race-day phone logs in once via the email code
- **Reads**: public JSON endpoints — viewers need zero login; the /club page
  fetches and renders leaderboards + live Champs standings for everyone
- Alternative rejected: KV (no relational queries for filtered leaderboards)

---

---

## Implemented specs (kept for reference — shipped 2026-07-06)

#### P1 — Display preferences + home button (localStorage, no DB changes) ✅ SHIPPED

**GHOST logo → home button**
- `TopNav.tsx`: wrap `<span>GHOST</span>` in `<Link to={homePage}>` where `homePage` is read from `localStorage.getItem('ghost.home_page') ?? '/calendar'`
- `SettingsPage.tsx`: new "Display" section (before Data Management); "Home page" dropdown: all 6 nav destinations (Patrol, Recon, Dojo, Calendar, Gear, Strike) + Journal/Coach Log — saves to `localStorage.ghost.home_page` immediately on change

**Font scale**
- 4 options: Small (85%), Normal (100%), Large (115%), X-Large (130%)
- Apply by setting `document.documentElement.style.setProperty('--font-scale', '1.15')` (or similar)
- In `index.css`: `font-size: calc(1rem * var(--font-scale, 1))` on `html` — all `rem` units scale automatically
- localStorage key: `ghost.font_scale` (values: `'0.85'|'1'|'1.15'|'1.3'`)

**Color presets (6 options)**
- Apply by setting a `data-theme` attribute on `<html>` — CSS in `index.css` handles the token overrides
- Preset names + token changes:
  1. **Ink** (default — current dark palette, no changes)
  2. **Dusk** — slightly warmer dark, `--ink: oklch(10% 0.02 25)`, `--bone: oklch(88% 0.01 60)`
  3. **OLED** — pure black, `--ink: oklch(0% 0 0)`, higher contrast accent
  4. **Storm** — cool/blue-grey dark, `--ink: oklch(10% 0.02 240)`
  5. **Dawn** — light/day mode, `--ink: oklch(97% 0 0)`, `--bone: oklch(18% 0 0)`, invert accent lightness
  6. **High Contrast** — WCAG AAA, `--ink: oklch(0% 0 0)`, `--bone: oklch(100% 0 0)`, `--accent: oklch(75% 0.18 60)`
- localStorage key: `ghost.color_preset` (values: `'ink'|'dusk'|'oled'|'storm'|'dawn'|'high-contrast'`)

**Apply on startup**
- `main.tsx`: before `ReactDOM.render`, read both localStorage keys and call a `applyDisplayPrefs()` function that sets the CSS variable and `data-theme` attribute — avoids flash-of-wrong-theme

---

#### P2 — Slicker onboarding + privacy-first storage notice ✅ SHIPPED

**First-run detection and redirect**
- In `App.tsx` (or a top-level `<Bootstrap>` component): on mount, check `localStorage.ghost.strava_client_id` and the SQLite `settings.strava.client_id`
- If neither exists: redirect to `/setup` immediately (don't show any other page)
- Sequence mirrors StatHunters: → enter Strava Client ID → "Authorise with Strava" button → OAuth redirect → token exchange → auto-start first 90-day activity sync → redirect to home page
- The setup page should feel like a login screen, not a settings form

**localStorage caching for Strava Client ID**
- After successful OAuth: also write `localStorage.setItem('ghost.strava_client_id', clientId)`
- On subsequent visits: pre-fill the client ID input in setup (or skip setup entirely if SQLite also has the token)
- The actual OAuth tokens (access_token, refresh_token) stay in SQLite OPFS only — not localStorage (reduces exposure if XSS)

**Privacy notice (plain language, first run only)**
- Show a dismissable overlay before the first OAuth redirect — not a modal, a full-screen card with the GHOST branding
- Content (verbatim, write these words):
  > **What GHOST stores on your device**
  >
  > GHOST runs entirely in your browser. Nothing you enter or sync leaves your device except the requests GHOST makes directly to Strava on your behalf.
  >
  > **In your browser's private storage (IndexedDB/OPFS):** All your activities, shoes, journal entries, plans, and race calendar. This storage is tied to this browser and device. Clearing your browser site data deletes it.
  >
  > **In browser localStorage:** Your display preferences (theme, font size), your home page, and your Strava App Client ID. These are lightweight settings, not your training data.
  >
  > **Your Strava OAuth token:** Stored in private browser storage after you connect. GHOST uses it to pull your activities. You can revoke access at any time at strava.com/settings/apps — GHOST will need to reconnect if you do.
  >
  > No accounts. No servers. No analytics. Your data stays yours.
- Dismiss button: "Got it — let's go" → sets `localStorage.ghost.privacy_acknowledged = 'true'` → proceeds to OAuth
- Only shown if `localStorage.ghost.privacy_acknowledged` is not set

**localStorage keys summary** (for implementation reference)

| Key | Value | Purpose |
|---|---|---|
| `ghost.home_page` | e.g. `'/calendar'` | Home button destination |
| `ghost.font_scale` | `'0.85'` / `'1'` / `'1.15'` / `'1.3'` | Font size multiplier |
| `ghost.color_preset` | `'ink'` / `'dusk'` / `'oled'` / `'storm'` / `'dawn'` / `'high-contrast'` | Theme preset |
| `ghost.strava_client_id` | e.g. `'123456'` | Pre-fills setup form on return visits |
| `ghost.privacy_acknowledged` | `'true'` | Suppresses privacy notice after first read |

---


## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness railway)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser
- **Gear: no transactions in GHOST**: deal search opens Google; no cart, no checkout, no affiliate links
- **Garmin import: no ZIP library**: user unzips manually; `File.text()` reads JSON files directly — zero new dependencies
- **Garmin import: COALESCE upsert**: re-importing merges new fields without overwriting existing ones; safe to run multiple times

---

## Session: 2026-07-06 (earlier)

### Completed

**feat/dojo-training-calendar — merged to main (4c569c5)**

- `DojoPage.tsx`: full rewrite — picker collapses when a plan is active
- `ActivePlanBar`: compact strip showing dojo name, current phase/week number, goal race, editable start date, "Change plan" button
- `TrainingCalendar`: week-by-week grid grouped by calendar month; calls `engine.renderWeek()` with full `WeekContext` (goalRace, tuneupRaces, lifeEvents) for every program week
- `WeekRow`: phase dot (colour-coded base/build/peak/taper), phaseName from engine, km target, "← now" indicator on current week, goal race accent banner
- `DayCell`: 7-column grid per week; session type badge (E/L/T/I/RP/X/S/—), distance, life event markers, tuneup race markers, past-day muted opacity
- Macrocycle overview bar: coloured phase blocks across all weeks with legend
- "No goal race set" advisory when races table is empty
- New DB queries: loadCalendarData() — parallel fetch of goalRace, tuneupRaces, lifeEvents, capacity settings
- `showPicker` state: false = calendar view; true = picker; "Change plan" toggles back

**feat/data/nz-races — merged to main (c87e8bd, ba859fb)**

- `src/data/nz-races-2026.ts`: 49 NZ half marathon + marathon events Jul 2026–Jun 2027
- Sourced from runningcalendar.co.nz; macron-safe slug() function derives event URLs
- Every race has `url` (primary → originator page) and `searchUrl` (Google fallback for slug 404s)
- `NZ_HALF_MARATHONS` and `NZ_MARATHONS` exports for use in CalendarPage race-add UI

**feat/gear-page — merged to main (c84490f)**

- Migration 0006: `gear_items` table (name, category, brand, model, description, size, quantity, is_watchlist, target_price, url); ALTER `shoes` adds `description` and `size` columns
- `src/lib/strava/types.ts`: `StravaShoe`, `StravaBike`, `StravaAthleteGear` types added
- `src/lib/strava/client.ts`: `fetchAthleteGear()` — calls `GET /athlete`, returns shoes + bikes
- `src/routes/gear/GearPage.tsx` (new):
  - **Import banner**: one-click Strava import — upserts all shoes by strava_gear_id, timestamps last import
  - **Shoe rotation analysis**: Race shoe / Trail / Daily trainer / Near limit badges derived from best pace, activity type split, km% used; avg and best pace per shoe from joined activities
  - **Deal search**: "Find deals" per shoe/item → Google `{brand} {model} sale NZ running`
  - **Gear sections**: Clothing, Backpacks, Hardware, Food — manual add form per category
  - **Watchlist**: target price, size, product URL per item; deal search button; "waiting for a sale" intent
  - Retired shoes collapsible via ChevronDown toggle
- `src/App.tsx`: `/gear` route added; `/shoes` now redirects to `/gear`
- `src/components/nav/TopNav.tsx`: "Shoes" → "Gear"

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
1. Wire NZ race data into CalendarPage — searchable combobox for adding target/tuneup races from `NZ_RACES`
2. Garmin GDPR export import — file picker UI → garmin/mapper.ts → bulk upsert to daily_health_metrics
3. CalendarPage race-add: primary URL + "Search Google" fallback for slug 404s

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness rating)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser
- **Gear: no transactions in GHOST**: deal search opens Google; no cart, no checkout, no affiliate links
- **Shoe rotation advice is computed not queried**: pure JS from aggregated activity stats — no extra table needed

## Session: 2026-07-05

### Completed

**BiometricsCard on Strike — feat/biometrics-card (in progress)**

- `StrikePage.tsx`: added `BiometricsCard` component (Card 5)
  - Queries last 28 days from `daily_health_metrics` + `journal` (HRV/RHR fallback)
  - Uses `resolveDayRows()` + `trendFor()` from `biometrics-pure.ts` for source-priority resolution
  - 4 metric tiles: HRV (ms), Resting HR (bpm), Sleep Score, Body Battery — each with latest value, 28-day avg, and ↑/↓/→ trend arrow
  - HRV 28-day SVG sparkline at card bottom
  - Hidden when no biometrics data logged; `hasAny` guard prevents ghost card
- `StrikePage.tsx`: added `fetchBiometrics(fromIso, toIso)` query helper
- `StrikePage.tsx`: added `biometrics-pure.ts` import (resolveDayRows, trendFor, ResolvedDayMetrics)
- PHASES.md: updated to v0.6.0, 574/574 tests, replaced stale "not yet ported" table with remaining opportunities

**feat/biometrics — merged to main (2026-07-05)**

- Migration 0005: `daily_health_metrics` table (rhr_bpm, hrv_ms, sleep_duration_s, sleep_score, stress_score, body_battery, vo2max_device, weight_kg; UNIQUE(date, source))
- `week-queries.ts`: getTodayBiometrics(), upsertBiometrics(), getRecentBiometrics() helpers
- `CoachLogPage.tsx`: TodayLogForm extended with HRV (ms) + Body Battery (0–100) fields; HRV → journal.hrv, body battery → daily_health_metrics source=manual
- `snapshot-builder.ts`: merges journal.hrv/resting_hr + daily_health_metrics into AI coach context
- `context-pure.ts`: BiometricsSnapshot in AthleteSnapshot; snapshotToText emits biometrics line
- 2 new biometrics tests in context-pure.test.ts

**feat/ai-coach — merged to main (2026-07-04)**

- `SettingsPage.tsx`: BYOK Anthropic key entry (masked, stored as settings.ai.anthropic_key, remove button)
- `CoachLogPage.tsx`: AI Coach Panel — reads key from settings, builds snapshot via buildAthleteSnapshot(), calls claude-haiku-4-5-20251001 direct API
- `snapshot-builder.ts`: created — queries plan/goal/week/activities/biometrics → AthleteSnapshot
- `context-pure.ts`: snapshotToText() serialises to prompt text

**feat/patrol-plan-aware — merged to main (2026-07-04)**

- PatrolPage: plan-aware rewrite — 7-day compliance matrix, "tonight's mission" card, dojo-specific FrameworkStatsRow
- `week-queries.ts`: getActivePlanPeriod() — joins plan_periods+plans, parses params_json, queries races WHERE is_goal=1

**Plan engines — merged to main (2026-07-04)**

- 9 engines: hansons, lydiard, daniels, pfitzinger, higdon, polarised, norwegian-singles, ultra (stub), custom
- calendar-blocks.ts, plans/index.ts, program-phase.ts, intensity-distribution.ts, framework-stats.ts
- Engine snapshot tests (54) + framework-stats tests unblocked; 574 total passing

**feat/compliance-and-pmc — merged to main**

- `PatrolPage.tsx`: replaced `buildMinimalCompliance()` shim with `evaluateWeek(template, asActivities(activities))` — real per-session flag evaluation (ok/fast/slow/short/none) now feeds `getFrameworkStats()`
- `snapshot-builder.ts`: added CTL/ATL/TSB computation — queries last 56 days, uses `computeActivityLoad()` + `computeEwma()` + `classifyForm()` + `rollupConfidence()`. `state` now populated when ≥7 activities exist; null otherwise.

**fix/coach-log-form-state — merged to main (34f7757)**

- `CoachLogPage.tsx`: added `hrv: ''` and `bodyBattery: ''` to `InlineEditForm` useState initialiser — CI type error from missing fields added by feat/biometrics.

**fix/strike-trend-type — merged to main (8d0b410)**

- `StrikePage.tsx`: extended `trend` type in BiometricsCard metrics array to include `mean: number | null` — CI `tsc -b` caught `mean` property missing from inline type.
- `PatrolPage.tsx`: removed orphaned `WeekCompliance` type import — was unused after shim deletion; `tsc -b` treats unused imports as TS6133 errors.

**feat/patrol-compliance-flags — merged to main (9fa3e63)**

- `PatrolPage.tsx`: exposed `compliance` from `derived` useMemo return; passed to `WeekPlanGrid` as prop
- Added `COMPLIANCE_FLAG` lookup table: `fast` → amber FAST, `slow` → muted SLOW, `short` → amber SHORT; `ok/none/warn/miss` produce no badge (handled by status dot)
- `WeekPlanGrid`: reads `compliance.days` per-DOW; renders flag badges beneath actual run row, guard `status === 'done' && sessionFlags.length > 0`
- Updated PHASES.md: marked two completed remaining items; added patrol-compliance-flags as done

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
1. Consider Garmin Connect OAuth sync — Garmin developer registration → Cloudflare Worker → OAuth flow → upsert to daily_health_metrics (mapper already exists)
2. Alternatively: Garmin Connect JSON file import (lower effort, no OAuth) — file picker → mapper → bulk insert historical biometrics

## Key decisions

- **OPFS over IDBMirrorVFS**: wa-sqlite v1.0.0 renamed VFS; OPFS gives true file persistence without COOP/COEP headers
- **MemoryVFS fallback**: non-fatal OPFS failure (Safari, private browsing) — data survives the session, not the tab close
- **4-batch deploy cadence**: kept CI usage to ~4 builds / ~12 GH Actions minutes against 500 builds/month Cloudflare limit
- **Biometrics split storage**: HRV → journal table (was already there but never exposed); body battery → daily_health_metrics (device metric, not wellness rating)
- **BYOK AI coach**: Anthropic key stored in settings table, never leaves device; direct API call from browser

## Files changed (biometrics-card)
- `src/routes/strike/StrikePage.tsx`
- `PHASES.md`, `PROGRESS.md`

## Files changed (biometrics)
- `src/db/migrations.ts`
- `src/lib/analysis/week-queries.ts`
- `src/lib/ai/context-pure.ts`, `context-pure.test.ts`
- `src/lib/ai/snapshot-builder.ts`
- `src/routes/coach-log/CoachLogPage.tsx`

## Files changed (ai-coach)
- `src/routes/settings/SettingsPage.tsx`
- `src/routes/coach-log/CoachLogPage.tsx`
- `src/lib/ai/snapshot-builder.ts`
- `src/lib/ai/context-pure.ts`

## Files changed (patrol-plan-aware)
- `src/routes/patrol/PatrolPage.tsx`
- `src/lib/analysis/week-queries.ts`
