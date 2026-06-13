import 'server-only';
import type { StravaActivity } from './strava-api';
import type { NewActivity } from '@/lib/db/schema';

/**
 * Translate a Strava activity payload into the row shape used by our
 * `activities` table. We keep the raw JSON in `raw_json` so future analyses
 * can reach into fields we didn't bother mapping (splits, segment efforts,
 * gear, etc).
 *
 * Important: we capture EVERY activity type — runs, rides, swims, workouts,
 * yoga, etc. Filtering happens at query time. Storage is cheap; freshness
 * across the full picture matters more for analysis.
 */
export function mapStravaActivity(a: StravaActivity): NewActivity {
  return {
    source: 'strava',
    sourceId: String(a.id),

    name: a.name,
    type: a.type,
    sportType: a.sport_type ?? a.type,
    startDateUtc: a.start_date,
    startDateLocal: a.start_date_local,

    distanceM: a.distance ?? null,
    movingTimeS: a.moving_time ?? null,
    elapsedTimeS: a.elapsed_time ?? null,
    elevationGainM: a.total_elevation_gain ?? null,

    avgSpeedMs: a.average_speed ?? null,
    maxSpeedMs: a.max_speed ?? null,
    avgHr: a.average_heartrate ?? null,
    maxHr: a.max_heartrate ?? null,
    avgCadence: a.average_cadence ?? null,
    sufferScore: a.suffer_score ?? null,
    kudos: a.kudos_count ?? null,

    gearId: a.gear_id ?? null,
    // gear_name will be populated separately when the shoe row is created/refreshed
    gearName: null,

    rawJson: JSON.stringify(a),
  };
}
