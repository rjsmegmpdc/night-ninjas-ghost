import { query } from '@/db/client';

// ---------------------------------------------------------------------------
// Column indices for the main activity SELECT — order must match the query.
// ---------------------------------------------------------------------------
const C_TYPE = 0;
const C_DISTANCE = 1;   // meters
const C_MOVING = 2;     // seconds
const C_AVG_HR = 3;     // bpm | null
const C_AVG_SPD = 4;    // m/s | null
const C_NAME = 5;
const C_DATE = 6;

export interface GhostActivity {
  type: string;
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
  avgSpeedMs: number | null;
  name: string;
  startDate: string;
}

export async function getActivitiesInRange(fromIso: string, toIso: string): Promise<GhostActivity[]> {
  const rows = await query(
    `SELECT type, distance, moving_time, average_heartrate, average_speed, name, start_date
     FROM activities
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date ASC`,
    [fromIso, toIso + 'T99:99:99'],
  );
  return rows.map((r) => ({
    type: r[C_TYPE] as string,
    distanceM: (r[C_DISTANCE] as number) ?? 0,
    movingTimeS: (r[C_MOVING] as number) ?? 0,
    avgHr: r[C_AVG_HR] as number | null,
    avgSpeedMs: r[C_AVG_SPD] as number | null,
    name: r[C_NAME] as string,
    startDate: r[C_DATE] as string,
  }));
}

export async function getTotalActivityCount(): Promise<number> {
  const rows = await query('SELECT COUNT(*) FROM activities');
  return (rows[0]?.[0] as number) ?? 0;
}

export async function getNextRace(todayIso: string): Promise<{
  date: string; name: string; distanceKm: number;
} | null> {
  const rows = await query(
    `SELECT date, name, distance_km FROM races WHERE date >= ? ORDER BY date ASC LIMIT 1`,
    [todayIso],
  );
  if (!rows.length) return null;
  return {
    date: rows[0][0] as string,
    name: rows[0][1] as string,
    distanceKm: rows[0][2] as number,
  };
}

// ---------------------------------------------------------------------------
// Pure aggregation — works on any GhostActivity[]
// ---------------------------------------------------------------------------

export interface WeekStats {
  totalKm: number;
  longRunKm: number;
  totalMovingTimeS: number;
  totalSessions: number;
  avgPaceSpk: number | null;
  avgHr: number | null;
}

const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);

export function aggregateWeekStats(activities: GhostActivity[]): WeekStats {
  const runs = activities.filter((a) => RUN_TYPES.has(a.type));

  const totalKm = runs.reduce((s, a) => s + a.distanceM / 1000, 0);
  const longRunKm = runs.length ? Math.max(...runs.map((a) => a.distanceM / 1000)) : 0;
  const totalMovingTimeS = runs.reduce((s, a) => s + a.movingTimeS, 0);

  const avgPaceSpk = totalKm > 0 && totalMovingTimeS > 0
    ? totalMovingTimeS / totalKm
    : null;

  const hrActs = activities.filter((a) => a.avgHr != null && a.movingTimeS > 0);
  let avgHr: number | null = null;
  if (hrActs.length > 0) {
    const num = hrActs.reduce((s, a) => s + (a.avgHr ?? 0) * a.movingTimeS, 0);
    const den = hrActs.reduce((s, a) => s + a.movingTimeS, 0);
    avgHr = den > 0 ? num / den : null;
  }

  return { totalKm, longRunKm, totalMovingTimeS, totalSessions: activities.length, avgPaceSpk, avgHr };
}
