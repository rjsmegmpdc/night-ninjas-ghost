## Branch
main (feat/sync-e2e-encryption merged)

## Session: 2026-07-07

### Completed

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
