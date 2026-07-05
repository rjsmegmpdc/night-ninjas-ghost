import type { StravaActivity, StravaTokenResponse, StravaRefreshResponse, StravaAthleteGear } from './types';

export const STRAVA_API = 'https://www.strava.com/api/v3';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  constructor() {
    super('Strava rate limit reached — resumes automatically in 15 min');
    this.name = 'RateLimitError';
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Per-user API app credentials included in token requests. When present, the
 * worker uses these instead of its own baked-in secret — the worker is then
 * just a CORS proxy (Strava blocks browser CORS on /oauth/token).
 */
export interface TokenCredentials {
  clientId: string;
  clientSecret: string;
}

function credentialFields(creds?: TokenCredentials | null): Record<string, string> {
  return creds ? { client_id: creds.clientId, client_secret: creds.clientSecret } : {};
}

export async function exchangeCode(
  code: string,
  workerUrl: string,
  creds?: TokenCredentials | null,
): Promise<StravaTokenResponse> {
  const res = await fetch(`${workerUrl}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, ...credentialFields(creds) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<StravaTokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
  workerUrl: string,
  creds?: TokenCredentials | null,
): Promise<StravaRefreshResponse> {
  const res = await fetch(`${workerUrl}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, ...credentialFields(creds) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<StravaRefreshResponse>;
}

/** Best-effort revoke — local wipe proceeds even if the network call fails. */
export async function revokeToken(accessToken: string, workerUrl: string): Promise<void> {
  try {
    await fetch(`${workerUrl}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });
  } catch {
    // intentionally swallowed — revoke is advisory
  }
}

// ---------------------------------------------------------------------------
// Activity fetch
// ---------------------------------------------------------------------------

export async function fetchActivitiesPage(
  accessToken: string,
  page: number,
  perPage = 200,
  after?: number,
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (after !== undefined) params.set('after', String(after));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error('Strava token expired — reconnect');
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new Error(`Strava API error ${res.status}`);
  return res.json() as Promise<StravaActivity[]>;
}

// ---------------------------------------------------------------------------
// Athlete gear fetch
// ---------------------------------------------------------------------------

/** Fetches the full athlete object from Strava and extracts shoes + bikes. */
export async function fetchAthleteGear(accessToken: string): Promise<StravaAthleteGear> {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error('Strava token expired — reconnect in Settings');
  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) throw new Error(`Strava API error ${res.status}`);
  const athlete = await res.json() as { shoes?: StravaAthleteGear['shoes']; bikes?: StravaAthleteGear['bikes'] };
  return {
    shoes: athlete.shoes ?? [],
    bikes: athlete.bikes ?? [],
  };
}
