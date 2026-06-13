import 'server-only';
import { getValidAccessToken } from '@/lib/sources/strava';

/* ----------------------------------------------------------------------------
 * Strava API client — paginated `/athlete/activities` fetcher.
 *
 * Rate limits: Strava enforces 200 requests / 15 min AND 2,000 / day.
 * We watch the X-ReadRateLimit-Usage and X-ReadRateLimit-Limit headers and
 * surface a structured RateLimitError when we hit the cap, so the runner
 * can pause the job rather than crash.
 *
 * Page size: 200 (Strava's max). Pages move BACKWARDS in time using the
 * `before` cursor, since we typically pull from now → history.
 * -------------------------------------------------------------------------- */

const STRAVA_API = 'https://www.strava.com/api/v3';
const PAGE_SIZE = 200;

export interface StravaActivity {
  id: number;
  external_id?: string | null;
  name: string;
  type: string;       // 'Run', 'Ride', 'Workout', etc — legacy field
  sport_type: string; // 'Run', 'TrailRun', 'VirtualRide' etc — preferred
  start_date: string;       // ISO 8601 UTC
  start_date_local: string; // ISO 8601 with no offset, athlete's local TZ
  distance: number;       // metres
  moving_time: number;    // seconds
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number; // m/s
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  suffer_score?: number;
  kudos_count: number;
  gear_id?: string | null;
  // (We capture full payload as JSON in raw_json; this interface is just the
  // typed subset we map into our own columns.)
}

export interface FetchPageResult {
  activities: StravaActivity[];
  rateLimit: {
    /** "X,Y" where X = requests used in 15min, Y = used today */
    usage: string | null;
    /** "X,Y" where X = 15min limit, Y = daily limit */
    limit: string | null;
    /** Calculated: percentage of 15min limit used */
    fifteenMinPercent: number | null;
  };
}

export class StravaRateLimitError extends Error {
  constructor(
    public readonly resetsAt: Date,
    public readonly response: Response
  ) {
    super(`Strava rate limit exceeded — resumes at ${resetsAt.toISOString()}`);
    this.name = 'StravaRateLimitError';
  }
}

/**
 * Fetch a single page of activities.
 *
 * @param before  unix seconds — only fetch activities started before this time
 * @param after   unix seconds — only fetch activities started after this time
 *                (used by incremental syncs; pass null for backwards sweeps)
 */
export async function fetchActivityPage(opts: {
  before?: number | null;
  after?: number | null;
  page?: number;
}): Promise<FetchPageResult> {
  const token = await getValidAccessToken();

  const params = new URLSearchParams();
  if (opts.before) params.set('before', String(opts.before));
  if (opts.after) params.set('after', String(opts.after));
  params.set('per_page', String(PAGE_SIZE));
  if (opts.page) params.set('page', String(opts.page));

  const url = `${STRAVA_API}/athlete/activities?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  // Capture rate-limit headers regardless of response status
  const usage = res.headers.get('X-ReadRateLimit-Usage') || res.headers.get('X-RateLimit-Usage');
  const limit = res.headers.get('X-ReadRateLimit-Limit') || res.headers.get('X-RateLimit-Limit');
  const fifteenMinPercent = parseFifteenMinPercent(usage, limit);

  if (res.status === 429) {
    // Strava returns Retry-After in seconds. If absent, default to 15 min
    // because that's the rate-limit window.
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '900', 10);
    const resetsAt = new Date(Date.now() + retryAfter * 1000);
    throw new StravaRateLimitError(resetsAt, res);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }

  const activities = (await res.json()) as StravaActivity[];
  return {
    activities,
    rateLimit: { usage, limit, fifteenMinPercent },
  };
}

function parseFifteenMinPercent(usage: string | null, limit: string | null): number | null {
  if (!usage || !limit) return null;
  // Both are formatted "shortTermUsage,dailyUsage" / "shortTermLimit,dailyLimit"
  const u = parseInt(usage.split(',')[0], 10);
  const l = parseInt(limit.split(',')[0], 10);
  if (!isFinite(u) || !isFinite(l) || l === 0) return null;
  return Math.round((u / l) * 100);
}

/** Page size — exposed for math elsewhere (estimating total pages, etc). */
export { PAGE_SIZE };

/* ----------------------------------------------------------------------------
 * Gear fetching — Strava /gear/{id}
 *
 * Returns shoe / bike details. We cache the result per gear_id; gear data
 * doesn't change often, so we only re-fetch on backfill or when a new
 * gear_id is seen during sync.
 * -------------------------------------------------------------------------- */
export interface StravaGear {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  primary?: boolean;
  retired?: boolean;
  resource_state?: number;
  distance?: number; // metres — Strava's tracked distance for this gear
  description?: string;
  /** 'bike' or 'shoes' depending on Strava's classification of this gear. */
  frame_type?: string;
}

export async function fetchGear(gearId: string): Promise<StravaGear> {
  const token = await getValidAccessToken();
  const url = `${STRAVA_API}/gear/${gearId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '900', 10);
    throw new StravaRateLimitError(new Date(Date.now() + retryAfter * 1000), res);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava /gear/${gearId} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as StravaGear;
}

/**
 * Fetch a single activity by ID. Used by the gear backfill — the list
 * endpoint omits gear_id, so we have to GET each activity individually
 * to populate it on historical rows.
 */
export interface StravaActivityDetail {
  id: number;
  gear_id: string | null;
}

export async function fetchActivityDetail(activityId: number | string): Promise<StravaActivityDetail> {
  const token = await getValidAccessToken();
  const url = `${STRAVA_API}/activities/${activityId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '900', 10);
    throw new StravaRateLimitError(new Date(Date.now() + retryAfter * 1000), res);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava /activities/${activityId} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return {
    id: json.id,
    gear_id: json.gear_id ?? null,
  };
}
