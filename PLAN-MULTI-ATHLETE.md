# PLAN-MULTI-ATHLETE.md — Multi-Athlete Strava Connect (Standard Tier, ≤10)

**Agent brief for Hanzo. Read CLAUDE.md startup ritual first. Branch: `feat/multi-user-oauth`. Never commit to `main`.**

## Mission

Make GHOST safe for any club member (not just Matt) to connect their own Strava account.
The architecture is already multi-user (shared client ID, Worker token swap, per-user tokens
in each user's IndexedDB). This work closes the gaps that break or embarrass us the moment
athlete #2 connects, and positions us for the >10 capacity review later.

## Context (verified 2026-07-04)

- Strava app `166708`, Standard Tier, athlete cap 1 → Matt self-upgrades to 10 via the
  API settings dashboard ("Upgrade your API" button). **Manual step, not Hanzo's.**
- After upgrade: rate limits 200 read/15 min, 2,000 read/day — **shared across all athletes**.
- `POST https://www.strava.com/oauth/revoke` is live now; `oauth/deauthorize` dies 2027-06-01.
- Base URL moves to `https://www.api-v3.strava.com` (live 2027-01-04, mandatory 2027-06-01).
  Not actionable yet — just keep the base URL a single constant.
- Club endpoint deprecations (2026-09-01) do NOT affect GHOST — ClubPage reads local DB only.

## Pre-flight (Matt, manual — do not block on these for code work)

- [ ] Confirm Strava subscription active on the account owning app 166708 (required since 2026-06-30)
- [ ] Click "Upgrade your API" → capacity 10
- [ ] Confirm Authorization Callback Domain covers `night-ninjas-ghost.pages.dev` (and `localhost` for dev)

## Work items (in order)

### 1. CSRF `state` param on OAuth flow
**Files:** `src/routes/setup/SetupPage.tsx`
- `buildStravaAuthUrl()`: generate random state via `crypto.getRandomValues` (32 hex chars),
  persist in `sessionStorage` (NOT the DB — it's pre-auth), append `state=` to the authorize URL.
- Callback effect: reject with a clear error if `searchParams.get('state')` doesn't match
  stored value; clear stored state after check (single-use).

### 2. Verify granted scope on callback
**Files:** `src/routes/setup/SetupPage.tsx`
- Strava returns `?scope=` alongside `?code=`. Parse it before exchanging.
- If `activity:read_all` missing but `activity:read` present: proceed, but store
  `strava_scope` setting and show a persistent notice on Setup: "Private activities won't
  sync — reconnect and tick the box to include them."
- If neither read scope granted: treat as denial, don't exchange.

### 3. Rate-limit-aware, resumable sync
**Files:** `src/lib/db/sync.ts`, `src/lib/strava/client.ts`, `src/routes/setup/SetupPage.tsx`
- `fetchActivitiesPage`: on 429, throw a typed `RateLimitError` (not a generic Error).
- `syncActivities`: persist a cursor (`strava_sync_after` = max `start_date` epoch of
  upserted rows, updated per page) so an interrupted backfill resumes instead of restarting.
- On `RateLimitError`: save cursor, surface progress phase `'paused'` with a
  "Strava limit reached — resumes automatically" message; retry after 15 min
  (`setTimeout`, cancel on unmount) or on next app open.
- New `SyncPhase` member `'paused'`; update SetupPage progress UI to render it calmly
  (StatsHunters-style "importing gradually — be patient", no red error state).

### 4. Disconnect = revoke + local wipe
**Files:** `oauth-worker/src/index.ts`, `src/lib/strava/client.ts`, `src/routes/setup/SetupPage.tsx`, `src/lib/db/settings.ts`
- Worker: add `POST /revoke` → forwards `{ token }` to `https://www.strava.com/oauth/revoke`
  (use the NEW endpoint, never `deauthorize`). Same CORS/origin rules as existing routes.
- Client: `revokeToken(accessToken, workerUrl)`.
- `handleDisconnect()`: call revoke (best-effort — proceed with local wipe even if the
  network call fails), then snapshot settings to `athlete_profiles` (see item 7), then
  `clearTokens()` and clear the live `strava_scope`/`strava_sync_after` settings.
  Ask user to confirm before wiping (dialog), per Strava data-handling rules.
- **Do NOT delete activity rows without an explicit user confirmation step.**

### 5. Brand compliance (prep for >10 review, cheap to do now)
**Files:** `src/routes/setup/SetupPage.tsx`, `public/`, activity views (e.g. `src/routes/patrol/PatrolPage.tsx`)
- Replace the connect button with the official "Connect with Strava" button asset
  (orange, 48px height variant) from Strava's brand kit → `public/strava/`.
- Add "View on Strava" link on activity detail rows: `https://www.strava.com/activities/{strava_id}`.
- Footer/Setup: "Powered by Strava" logo per brand guidelines.

### 6. Athlete identity in settings
**Files:** `src/lib/db/settings.ts`, `src/routes/setup/SetupPage.tsx`
- Also store `strava_athlete_id` from the token exchange response (needed for support/debug
  when 10 different people report sync issues; display it on Setup under the athlete name).

### 7. Settings persistence across reconnects (last-known settings restore)
**Files:** `src/lib/db/settings.ts`, `src/lib/db/migrations.ts`, `src/routes/setup/SetupPage.tsx`, `src/lib/db/sync.ts`
The app must know the athlete's last settings the next time they connect.
- New migration: `athlete_profiles` table —
  `athlete_id INTEGER PRIMARY KEY, athlete_name TEXT, scope TEXT, sync_after INTEGER,
   last_sync TEXT, settings_json TEXT, updated_at TEXT`.
  `settings_json` snapshots non-token preferences (training plan selection, units,
  any Setup choices) as a single JSON blob so new preferences persist without schema churn.
- **On disconnect (extends item 4):** BEFORE `clearTokens()`, upsert the current settings
  snapshot into `athlete_profiles` keyed by `strava_athlete_id`. Tokens are always wiped;
  settings snapshot is always kept (it contains no credentials).
- **On connect/reconnect:** after token exchange, look up `athlete_profiles` by the
  `athlete.id` from the exchange response:
  - Match found → restore scope notice, sync cursor (`sync_after`), last-sync display and
    `settings_json` preferences; sync resumes incrementally instead of full re-backfill.
    Show "Welcome back, {name} — restored your previous settings."
  - No match (new or different athlete on this device) → start with defaults; if activities
    from a DIFFERENT athlete_id exist locally, warn and require explicit confirmation before
    mixing or clearing data (never auto-delete — Matt approves deletions).
- Pure helper `settings-snapshot-pure.ts` (build/parse the snapshot object) + Vitest tests.

## Ground rules (from CLAUDE.md — non-negotiable)

- Branch `feat/multi-user-oauth`; Matt merges. Update `PROGRESS.md` at stop ritual.
- All DB access async via `query`/`exec` worker bridge. No sync DB calls.
- Pure logic in `*-pure.ts` only if it has no browser APIs; the retry/cursor arithmetic
  is a good candidate for a pure helper + Vitest test.
- UTC date arithmetic everywhere.
- Keep `STRAVA_API` base URL as the single constant in `src/lib/strava/client.ts`.

## Acceptance criteria

- [ ] `npm run build` green, `npm test` ≥ 474 passing (no regressions)
- [ ] New Vitest coverage: state generation/validation, scope parsing, cursor resume logic
- [ ] OAuth round-trip works on `localhost` dev with state check active
- [ ] Simulated 429 (mock fetch) → sync pauses with cursor saved, resumes, completes
- [ ] Disconnect revokes on Strava (verify app disappears from strava.com/settings/apps),
      wipes tokens, leaves activities intact unless user confirms deletion
- [ ] Setup page shows official Connect with Strava button; activity views link to Strava
- [ ] Disconnect → reconnect as the same athlete restores previous settings and resumes
      sync from cursor (no full re-backfill); different athlete gets defaults + data warning
- [ ] `PROGRESS.md` updated; branch pushed

## Out of scope (later phases)

- Tauri desktop OAuth (deep-link callback, `tauri://localhost` CORS) — separate feat branch
- >10 athlete capacity review submission (needs this work shipped + screenshots)
- Webhooks — not applicable; GHOST is local-first, poll-on-open is the design
- Base URL migration to `api-v3.strava.com` — Jan 2027, one-line change
