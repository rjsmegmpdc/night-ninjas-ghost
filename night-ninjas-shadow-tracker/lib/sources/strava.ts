import 'server-only';
import {
  getStravaClientSecret,
  setStravaTokens,
  getStravaTokens,
} from '@/lib/store/secrets';
import { getStravaClientId } from '@/lib/store/settings';

/* ----------------------------------------------------------------------------
 * Strava API client.
 *
 * NOTE: This is a working scaffold. Full activity sync (paginated fetch,
 * rate-limit handling, upsert into DB) is implemented as a stub today —
 * the structure is right, the details land next iteration.
 * -------------------------------------------------------------------------- */

const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';

export function getRedirectUri(): string {
  // Always loops back to ourselves on the configured port (default 3000).
  const port = process.env.NN_OAUTH_PORT ?? '3000';
  return `http://localhost:${port}/api/strava/callback`;
}

/** Build the Strava authorisation URL the user is sent to. */
export async function buildAuthUrl(): Promise<string> {
  const clientId = await getStravaClientId();
  if (!clientId) throw new Error('Strava client_id not configured. Run setup wizard.');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'activity:read_all',
    approval_prompt: 'auto',
  });
  return `${STRAVA_AUTH}?${params.toString()}`;
}

/** Exchange an OAuth `code` for tokens, persist to keychain. */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const [clientId, clientSecret] = await Promise.all([
    getStravaClientId(),
    getStravaClientSecret(),
  ]);
  if (!clientId || !clientSecret) {
    throw new Error('Strava credentials not configured.');
  }

  const resp = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Strava token exchange failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  await setStravaTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });
}

/** Get a valid access token, refreshing if expired. */
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getStravaTokens();
  if (!tokens) throw new Error('Strava not connected. Run setup wizard.');

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - 60 > now) return tokens.accessToken;

  // Refresh
  const [clientId, clientSecret] = await Promise.all([
    getStravaClientId(),
    getStravaClientSecret(),
  ]);
  if (!clientId || !clientSecret) {
    throw new Error('Strava credentials not configured.');
  }

  const resp = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    throw new Error(`Strava token refresh failed: ${resp.status}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  await setStravaTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });
  return data.access_token;
}

/* ----------------------------------------------------------------------------
 * Activity sync — see lib/sources/sync-runner.ts for the real implementation.
 *
 * sync-runner provides:
 *   - createInitial90dJob() — wizard's first sync
 *   - createExtendedHistoryJob() — pull older data
 *   - createIncrementalJob() — pull new since last sync
 *   - runJob() — execute paginated sync with rate limit handling
 *   - resumeJob() — pick up a paused/rate_limited job
 *
 * This file keeps OAuth handshake + token management only.
 * -------------------------------------------------------------------------- */
