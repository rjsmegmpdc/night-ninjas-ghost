# Profile Sync — Cloudflare Access setup (one-time, ~10 minutes)

Profile Sync lets a user back up their setup blob (Strava API credentials,
theme, font size, home page, gear sizes) keyed to a verified email, and
restore it on any other device. Identity is **Cloudflare Access with
One-Time PIN** — no external identity provider, no passwords, free for up
to 50 users. Storage is **Workers KV**.

Until these steps are done, the Profile Sync buttons in Setup return a
clean "not configured" error and nothing is stored.

---

## Part 1 — Create the KV namespace

From `oauth-worker/` in a terminal:

```bash
npx wrangler kv namespace create SYNC_KV
```

Wrangler prints a snippet with an `id`. Open `oauth-worker/wrangler.toml`,
uncomment the KV block, and paste the id:

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id      = "<the id wrangler printed>"
```

## Part 2 — Set up Zero Trust (first time only)

1. Go to **https://one.dash.cloudflare.com** and sign in with your
   Cloudflare account.
2. If this is your first visit, it asks you to pick a **team name**
   (e.g. `nightninjas`). This becomes your team domain:
   `nightninjas.cloudflareaccess.com`. Free plan is fine — choose it when
   asked for a plan.
3. Note the team domain — you'll paste it into `wrangler.toml` in Part 5.

## Part 3 — Enable the One-Time PIN login method

> Dashboard note: ignore any banner saying "Single Sign On management has
> moved to Members > Settings" — that is about SSO for logging into the
> Cloudflare dashboard itself, not about Access login methods.

1. In Zero Trust, go to **Integrations → Identity providers** (left
   sidebar). *(Older docs said Settings → Authentication — Cloudflare
   renamed this section.)*
2. Under **Your identity providers**, click **Add new identity provider**.
3. Choose **One-time PIN**. That's it — no configuration. Users will get
   6-digit codes by email.

## Part 4 — Create the Access application for /sync

1. In Zero Trust, go to **Access controls → Applications** → **Add an
   application**. *(Previously Access → Applications.)*
2. Choose **Self-hosted**.
3. Fill in:
   - **Application name**: `GHOST profile sync`
   - **Session duration**: `24 hours` (a restore/backup finishes in
     seconds; short sessions are fine)
   - **Application domain**: click **Add public hostname** and enter
     - Subdomain/domain: `ghost-strava-oauth.<your-account>.workers.dev`
     - Path: `sync/start`

   > **The path must be `sync/start`, not `sync`.** Only the login
   > handoff needs Access. If you protect all of `/sync/`, the app's
   > fetch() calls to `/sync/profile` get bounced to the Access login
   > page (no cookie travels cross-origin) and fail with
   > "Failed to fetch". `/sync/profile` is secured by the worker itself —
   > it fully verifies the Cloudflare-signed JWT (signature, audience,
   > issuer, expiry) on every call.
   > **If the dashboard refuses the workers.dev hostname** (older accounts
   > only see zones from your account): give the worker a custom domain
   > first — Cloudflare dashboard → **Workers & Pages →
   > ghost-strava-oauth → Settings → Domains & Routes → Add → Custom
   > domain** (e.g. `oauth.yourdomain.nz`), then use that hostname here
   > with path `sync`. Also update `VITE_STRAVA_OAUTH_WORKER` to the new
   > URL.
4. Click **Next** to the policy step:
   - **Policy name**: `anyone-with-email`
   - **Action**: `Allow`
   - **Include** rule: selector **Everyone** (it takes no value). The
     One-time PIN still verifies email ownership, each user only ever
     sees their own blob (keyed by verified email), and blobs are
     E2E-encrypted. *(Do not try `Emails ending in` with a bare `@` —
     the API rejects it: `invalid 'include' configuration`.)*
   - To restrict to a closed group instead: use `Emails` with a list of
     addresses, or `Emails ending in` with a real domain
     (e.g. `@yourclub.nz`).
5. **Next** through the setup step (defaults are fine) → **Add application**.
6. Open the application you just created → **Overview** tab → copy the
   **Application Audience (AUD) Tag** — a 64-char hex string. You need it
   in Part 5.

## Part 5 — Configure and deploy the worker

In `oauth-worker/wrangler.toml`, uncomment and fill:

```toml
[vars]
ALLOWED_ORIGIN     = "https://night-ninjas-ghost.pages.dev"
ACCESS_TEAM_DOMAIN = "nightninjas.cloudflareaccess.com"   # from Part 2
ACCESS_AUD         = "<AUD tag from Part 4>"
```

Deploy:

```bash
npx wrangler deploy
```

(Or just push to main — `worker.yml` deploys `oauth-worker/**` changes.
The vars above are plain config, safe to commit; only the optional Strava
secrets stay in `wrangler secret`.)

## Part 6 — Verify

1. Open the app → **Setup** → **Profile Sync** → **Back up this device**.
2. You should land on a Cloudflare Access page asking for an email →
   enter it → check inbox → type the 6-digit code.
3. You bounce back to Setup and see *"Profile backed up."*
4. On another device/browser: Setup → **Restore to this device** → same
   email + code → credentials and preferences install.

## How it works (for future reference)

- `/sync/start` (and only that path) sits behind Access. After the PIN,
  Cloudflare injects a signed JWT (`Cf-Access-Jwt-Assertion`); the worker
  bounces it back to the app in a URL **fragment** — fragments never
  reach servers or logs, and no third-party cookies are involved (mobile
  Safari safe).
- The app then calls `GET/PUT /sync/profile` with `Authorization: Bearer
  <jwt>`. The worker verifies the RS256 signature against
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checks
  `aud`/`iss`/`exp`, and uses the verified email as the KV key
  (`profile:<email>`).
- Blobs are capped at 8 KB and must be JSON.

## Encryption

Blobs are **end-to-end encrypted**: after the email code, the user
chooses a passphrase (min 8 chars); the blob is encrypted on-device
(PBKDF2-SHA256, 310k iterations → AES-256-GCM) before upload. KV — and
therefore the Cloudflare account owner — only ever holds ciphertext.
Safe to offer to club members and other third parties.

There is deliberately **no passphrase reset**: a forgotten passphrase
means backing up again from a device that's already set up. A wrong
passphrase on restore fails decryption cleanly and allows retry without
redoing the email code.

Legacy note: backups made before encryption shipped (v1 plaintext) are
still restorable; the next backup overwrites them with an encrypted v2
envelope.
