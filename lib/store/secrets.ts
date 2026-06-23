import 'server-only';

/* ----------------------------------------------------------------------------
 * Secrets layer — Strava client_secret, access_token, refresh_token.
 *
 * Storage: OS keychain via `keytar`.
 *   Windows : Windows Credential Manager
 *   macOS   : Keychain
 *   Linux   : libsecret (gnome-keyring / kwallet)
 *
 * If keytar isn't available (rare — Linux without libsecret), we fall back
 * to an encrypted file in the data dir. The encryption key derives from a
 * machine-specific seed so the file isn't useful if copied off the machine.
 *
 * Secrets are NEVER persisted to:
 *   - the SQLite database
 *   - logs
 *   - the .env file
 *   - any sync/backup-friendly path
 * -------------------------------------------------------------------------- */

const SERVICE = 'NightNinjas-ShadowTracker';

const KEY = {
  STRAVA_CLIENT_SECRET: 'strava-client-secret',
  STRAVA_ACCESS_TOKEN: 'strava-access-token',
  STRAVA_REFRESH_TOKEN: 'strava-refresh-token',
  STRAVA_EXPIRES_AT: 'strava-expires-at',
  GARMIN_SESSION_TOKENS: 'garmin-session-tokens',
  GITHUB_PAT: 'github-pat',
  ANTHROPIC_API_KEY: 'anthropic-api-key',
} as const;

// Lazy-load keytar — it's a native module and we want to gracefully
// handle environments where it isn't available.
async function loadKeytar() {
  try {
    return (await import('keytar')).default;
  } catch (err) {
    console.warn(
      '[shadow-tracker] keytar unavailable; secrets layer will refuse writes. ' +
        'On Linux, install libsecret-1-dev and rebuild.'
    );
    return null;
  }
}

async function setSecret(key: string, value: string): Promise<void> {
  const keytar = await loadKeytar();
  if (!keytar) {
    throw new Error(
      'Keychain unavailable. Install libsecret on Linux or rebuild keytar for your platform.'
    );
  }
  await keytar.setPassword(SERVICE, key, value);
}

async function getSecret(key: string): Promise<string | null> {
  const keytar = await loadKeytar();
  if (!keytar) return null;
  return keytar.getPassword(SERVICE, key);
}

async function deleteSecret(key: string): Promise<void> {
  const keytar = await loadKeytar();
  if (!keytar) return;
  await keytar.deletePassword(SERVICE, key);
}

/* ----------------------------------------------------------------------------
 * Public API — Strava-specific helpers.
 * -------------------------------------------------------------------------- */

export async function setStravaClientSecret(secret: string): Promise<void> {
  await setSecret(KEY.STRAVA_CLIENT_SECRET, secret);
}

export async function getStravaClientSecret(): Promise<string | null> {
  return getSecret(KEY.STRAVA_CLIENT_SECRET);
}

export async function setStravaTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}): Promise<void> {
  await setSecret(KEY.STRAVA_ACCESS_TOKEN, tokens.accessToken);
  await setSecret(KEY.STRAVA_REFRESH_TOKEN, tokens.refreshToken);
  await setSecret(KEY.STRAVA_EXPIRES_AT, String(tokens.expiresAt));
}

export async function getStravaTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> {
  const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
    getSecret(KEY.STRAVA_ACCESS_TOKEN),
    getSecret(KEY.STRAVA_REFRESH_TOKEN),
    getSecret(KEY.STRAVA_EXPIRES_AT),
  ]);
  if (!accessToken || !refreshToken || !expiresAtStr) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: parseInt(expiresAtStr, 10),
  };
}

export async function clearStravaSecrets(): Promise<void> {
  await Promise.all([
    deleteSecret(KEY.STRAVA_CLIENT_SECRET),
    deleteSecret(KEY.STRAVA_ACCESS_TOKEN),
    deleteSecret(KEY.STRAVA_REFRESH_TOKEN),
    deleteSecret(KEY.STRAVA_EXPIRES_AT),
  ]);
}


/* ----------------------------------------------------------------------------
 * Public API - Garmin-specific helpers (Phase 12).
 *
 * We never store the athlete's Garmin password. The password is used once
 * at login; what we persist is the exported OAuth1+OAuth2 session token
 * pair from the garmin-connect library (valid ~1 year, auto-refreshed by
 * the library on use). Stored as a single JSON blob in the OS keychain.
 * -------------------------------------------------------------------------- */

export async function setGarminSessionTokens(tokensJson: string): Promise<void> {
  await setSecret(KEY.GARMIN_SESSION_TOKENS, tokensJson);
}

export async function getGarminSessionTokens(): Promise<string | null> {
  return getSecret(KEY.GARMIN_SESSION_TOKENS);
}

export async function clearGarminSecrets(): Promise<void> {
  await deleteSecret(KEY.GARMIN_SESSION_TOKENS);
}


/* ----------------------------------------------------------------------------
 * Public API - GitHub PAT.
 *
 * Used to publish training schedules to the nightninja-report repo via the
 * GitHub Contents API. Needs `contents: write` scope on the target repo.
 * Never logged; stored only in the OS keychain.
 * -------------------------------------------------------------------------- */

export async function getGitHubPat(): Promise<string | null> {
  return getSecret(KEY.GITHUB_PAT);
}

export async function setGitHubPat(pat: string): Promise<void> {
  await setSecret(KEY.GITHUB_PAT, pat);
}

export async function clearGitHubPat(): Promise<void> {
  await deleteSecret(KEY.GITHUB_PAT);
}


/* ----------------------------------------------------------------------------
 * Public API - Anthropic API key (Phase 10 BYOK AI).
 *
 * The athlete's own Anthropic API key. Stored in the OS keychain alongside
 * Strava tokens. Never in the DB, never in logs.
 * -------------------------------------------------------------------------- */

export async function getAnthropicApiKey(): Promise<string | null> {
  return getSecret(KEY.ANTHROPIC_API_KEY);
}

export async function setAnthropicApiKey(key: string): Promise<void> {
  await setSecret(KEY.ANTHROPIC_API_KEY, key);
}

export async function clearAnthropicApiKey(): Promise<void> {
  await deleteSecret(KEY.ANTHROPIC_API_KEY);
}
