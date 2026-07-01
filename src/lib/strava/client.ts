import type { StravaActivity, StravaTokenResponse, StravaRefreshResponse } from './types';

const STRAVA_API = 'https://www.strava.com/api/v3';

export async function exchangeCode(
  code: string,
  workerUrl: string,
): Promise<StravaTokenResponse> {
  const res = await fetch(`${workerUrl}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
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
): Promise<StravaRefreshResponse> {
  const res = await fetch(`${workerUrl}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<StravaRefreshResponse>;
}

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
  if (res.status === 429) throw new Error('Strava rate limit — try again in 15 min');
  if (!res.ok) throw new Error(`Strava API error ${res.status}`);
  return res.json() as Promise<StravaActivity[]>;
}
