import { query } from '@/db/client';

// ---------------------------------------------------------------------------
// Column indices — order must match the SELECT below.
// ---------------------------------------------------------------------------
const C_TYPE      = 0;
const C_DISTANCE  = 1;   // meters
const C_MOVING    = 2;   // seconds
const C_AVG_HR    = 3;   // bpm | null
const C_AVG_SPD   = 4;   // m/s | null
const C_NAME      = 5;
const C_DATE      = 6;
const C_STRAVA_ID = 7;
const C_ELEVATION = 8;   // meters | null

export interface GhostActivity {
  stravaId: number;
  type: string;
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
  avgSpeedMs: number | null;
  name: string;
  startDate: string;
  elevationGainM: number;
}

export async function getActivitiesInRange(fromIso: string, toIso: string): Promise<GhostActivity[]> {
  const rows = await query(
    `SELECT type, distance, moving_time, average_heartrate, average_speed, name, start_date, strava_id, total_elevation
     FROM activities
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date ASC`,
    [fromIso, toIso + 'T99:99:99'],
  );
  return rows.map((r) => ({
    stravaId:       (r[C_STRAVA_ID] as number) ?? 0,
    type:           r[C_TYPE] as string,
    distanceM:      (r[C_DISTANCE] as number) ?? 0,
    movingTimeS:    (r[C_MOVING] as number) ?? 0,
    avgHr:          r[C_AVG_HR] as number | null,
    avgSpeedMs:     r[C_AVG_SPD] as number | null,
    name:           r[C_NAME] as string,
    startDate:      r[C_DATE] as string,
    elevationGainM: (r[C_ELEVATION] as number | null) ?? 0,
  }));
}

export interface ActivePlanPeriod {
  dojo: string;
  startDate: string;
  programWeeks: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  goalRaceDate: string | null;
  goalRaceName: string | null;
  goalDistanceKm: number | null;
  goalTimeS: number | null;
}

function parseGoalTime(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

export async function getActivePlanPeriod(): Promise<ActivePlanPeriod | null> {
  const rows = await query(
    `SELECT p.dojo, p.params_json, pp.start_date
     FROM plan_periods pp
     JOIN plans p ON p.id = pp.plan_id
     WHERE pp.end_date IS NULL
     ORDER BY pp.start_date DESC
     LIMIT 1`,
    []
  );
  if (!rows.length) return null;

  const dojo = rows[0][0] as string;
  const startDate = rows[0][2] as string;
  let level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
  let programWeeks = 18;
  try {
    const params = JSON.parse(rows[0][1] as string);
    if (params.level) level = params.level;
    if (params.programWeeks) programWeeks = params.programWeeks;
  } catch { /* ignore */ }

  const goalRows = await query(
    `SELECT date, name, distance_km, goal_time
     FROM races WHERE is_goal = 1 ORDER BY date ASC LIMIT 1`,
    []
  );

  return {
    dojo,
    startDate,
    programWeeks,
    level,
    goalRaceDate:   goalRows.length ? (goalRows[0][0] as string) : null,
    goalRaceName:   goalRows.length ? (goalRows[0][1] as string) : null,
    goalDistanceKm: goalRows.length ? (goalRows[0][2] as number) : null,
    goalTimeS:      goalRows.length ? parseGoalTime(goalRows[0][3] as string | null) : null,
  };
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
    date:       rows[0][0] as string,
    name:       rows[0][1] as string,
    distanceKm: rows[0][2] as number,
  };
}

// ---------------------------------------------------------------------------
// Pure aggregation
// ---------------------------------------------------------------------------

export interface WeekStats {
  totalKm: number;
  longRunKm: number;
  totalMovingTimeS: number;
  totalSessions: number;
  avgPaceSpk: number | null;
  avgHr: number | null;
  totalElevationGainM: number;
  backToBackKm: number;
}

const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);

function dowOfDate(startDate: string): number {
  const s = startDate.includes('T') ? startDate : startDate + 'T00:00:00';
  return (new Date(s).getDay() + 6) % 7;
}

export function aggregateWeekStats(activities: GhostActivity[]): WeekStats {
  const runs = activities.filter((a) => RUN_TYPES.has(a.type));

  const totalKm          = runs.reduce((s, a) => s + a.distanceM / 1000, 0);
  const longRunKm        = runs.length ? Math.max(...runs.map((a) => a.distanceM / 1000)) : 0;
  const totalMovingTimeS = runs.reduce((s, a) => s + a.movingTimeS, 0);
  const totalElevationGainM = runs.reduce((s, a) => s + (a.elevationGainM ?? 0), 0);

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

  const kmByDow = new Map<number, number>();
  for (const a of runs) {
    const d = dowOfDate(a.startDate);
    kmByDow.set(d, (kmByDow.get(d) ?? 0) + a.distanceM / 1000);
  }
  let backToBackKm = 0;
  for (let d = 0; d <= 5; d++) {
    const pair = (kmByDow.get(d) ?? 0) + (kmByDow.get(d + 1) ?? 0);
    if (pair > backToBackKm) backToBackKm = pair;
  }

  return {
    totalKm, longRunKm, totalMovingTimeS, totalSessions: activities.length,
    avgPaceSpk, avgHr, totalElevationGainM, backToBackKm,
  };
}
