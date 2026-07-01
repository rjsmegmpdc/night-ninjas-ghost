import { exec } from '@/db/client';
import { fetchActivitiesPage, refreshAccessToken } from '@/lib/strava/client';
import type { StravaActivity } from '@/lib/strava/types';
import {
  getSetting,
  setSetting,
  getStoredTokens,
  storeTokens,
  setLastSync,
} from './settings';

export type SyncPhase = 'token' | 'fetching' | 'writing' | 'done' | 'error';

export interface SyncProgress {
  phase: SyncPhase;
  fetched: number;
  inserted: number;
  error?: string;
}

export type ProgressCallback = (p: SyncProgress) => void;

const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function ensureFreshToken(): Promise<string> {
  const tokens = await getStoredTokens();
  if (!tokens) throw new Error('Not connected to Strava');

  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt > nowSec + 60) return tokens.accessToken;

  const fresh = await refreshAccessToken(tokens.refreshToken, WORKER_URL);
  await storeTokens({
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token,
    expiresAt: fresh.expires_at,
    athleteName: tokens.athleteName,
  });
  return fresh.access_token;
}

// ---------------------------------------------------------------------------
// Activity upsert
// ---------------------------------------------------------------------------

async function upsertActivity(a: StravaActivity): Promise<void> {
  await exec(
    `INSERT INTO activities (
       strava_id, name, type, sport_type, start_date,
       distance, moving_time, elapsed_time, total_elevation,
       average_speed, max_speed, average_heartrate, max_heartrate,
       suffer_score, gear_id, raw_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(strava_id) DO UPDATE SET
       name              = excluded.name,
       start_date        = excluded.start_date,
       distance          = excluded.distance,
       moving_time       = excluded.moving_time,
       elapsed_time      = excluded.elapsed_time,
       total_elevation   = excluded.total_elevation,
       average_speed     = excluded.average_speed,
       max_speed         = excluded.max_speed,
       average_heartrate = excluded.average_heartrate,
       max_heartrate     = excluded.max_heartrate,
       suffer_score      = excluded.suffer_score,
       gear_id           = excluded.gear_id,
       raw_json          = excluded.raw_json,
       synced_at         = datetime('now')`,
    [
      a.id, a.name, a.type, a.sport_type, a.start_date,
      a.distance, a.moving_time, a.elapsed_time, a.total_elevation_gain,
      a.average_speed, a.max_speed,
      a.average_heartrate ?? null,
      a.max_heartrate ?? null,
      a.suffer_score ?? null,
      a.gear_id ?? null,
      JSON.stringify(a),
    ],
  );
}

// ---------------------------------------------------------------------------
// Full / incremental sync
// ---------------------------------------------------------------------------

export async function syncActivities(onProgress: ProgressCallback): Promise<void> {
  try {
    onProgress({ phase: 'token', fetched: 0, inserted: 0 });
    const accessToken = await ensureFreshToken();

    // Incremental: only fetch activities after last successful sync epoch
    const lastEpochStr = await getSetting('strava_last_sync_epoch');
    const afterEpoch = lastEpochStr ? Number(lastEpochStr) : undefined;

    let page = 1;
    let totalFetched = 0;
    let totalInserted = 0;
    let latestEpoch = afterEpoch ?? 0;

    while (true) {
      onProgress({ phase: 'fetching', fetched: totalFetched, inserted: totalInserted });

      const activities = await fetchActivitiesPage(accessToken, page, 200, afterEpoch);
      if (activities.length === 0) break;

      onProgress({ phase: 'writing', fetched: totalFetched + activities.length, inserted: totalInserted });

      for (const a of activities) {
        await upsertActivity(a);
        totalInserted++;
        const epoch = Math.floor(new Date(a.start_date).getTime() / 1000);
        if (epoch > latestEpoch) latestEpoch = epoch;
      }

      totalFetched += activities.length;
      page++;
      if (activities.length < 200) break;
    }

    if (latestEpoch > 0) {
      await setSetting('strava_last_sync_epoch', String(latestEpoch));
    }
    await setLastSync(new Date().toISOString());

    onProgress({ phase: 'done', fetched: totalFetched, inserted: totalInserted });
  } catch (e) {
    onProgress({
      phase: 'error',
      fetched: 0,
      inserted: 0,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
