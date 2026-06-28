import 'server-only';
import { and, gte, lte } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import type { Activity } from '@/lib/db/schema';

/* ----------------------------------------------------------------------------
 * Activity queries — used by Patrol, Recon, Strike.
 *
 * All date ranges use start_date_local (ISO YYYY-MM-DD prefix matches the
 * column directly). The local date is what the runner experienced — a 6am
 * run that starts at 17:00 UTC is "today" if you're in NZ.
 * -------------------------------------------------------------------------- */

/**
 * Fetch activities whose local start date falls between fromIso and toIso
 * (inclusive). Both bounds are YYYY-MM-DD.
 */
export async function getActivitiesInRange(
  fromIso: string,
  toIso: string
): Promise<Activity[]> {
  // start_date_local is ISO 8601 like "2026-04-28T06:30:00".
  // Comparing against "2026-04-28" works lexicographically because ISO
  // dates are sortable as strings. Add a final " " to the upper bound
  // to capture "2026-04-28T23:59:59" (T is below all printable digits).
  const lowerBound = fromIso; // '2026-04-28' < '2026-04-28T06:30:00'
  const upperBound = toIso + 'T99:99:99'; // sorts after any real time

  return getDb()
    .select()
    .from(schema.activities)
    .where(
      and(
        gte(schema.activities.startDateLocal, lowerBound),
        lte(schema.activities.startDateLocal, upperBound)
      )
    )
    .all();
}

/**
 * Aggregate stats for a set of activities.
 */
export interface WeekStats {
  totalKm: number;
  longRunKm: number;
  totalMovingTimeS: number;
  totalSessions: number;
  /** Average pace across runs only, in seconds per km. Null if no runs. */
  avgPaceSpk: number | null;
  /** Average HR across activities that recorded it. Null if none did. */
  avgHr: number | null;
  /** Total elevation gain across all runs (metres). */
  totalElevationGainM: number;
  /** Combined km from Saturday + Sunday runs — ultra back-to-back metric. */
  backToBackKm: number;
}

function dowOf(isoLocal: string): number {
  const [y, m, d] = isoLocal.slice(0, 10).split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay(); // Sun=0..Sat=6
  return (js + 6) % 7; // Mon=0..Sun=6
}

/**
 * Average weekly run km over the past `weeks` weeks (default 6).
 * Used by the mid-program entry assessment to compare chronic load
 * against the current week's prescribed target.
 */
export async function getTrailingChronicKm(weeks = 6): Promise<number> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = addUtcDays(todayIso, -(weeks * 7));
  const activities = await getActivitiesInRange(startIso, todayIso);
  const runs = activities.filter(
    (a) => a.type === 'Run' || a.type === 'VirtualRun' || a.type === 'TrailRun'
  );
  const totalKm = runs.reduce((sum, a) => sum + (a.distanceM ?? 0) / 1000, 0);
  return totalKm / weeks;
}

function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Return type alignment with how Patrol displays the metrics. */
export function aggregateWeekStats(activities: Activity[]): WeekStats {
  const runs = activities.filter(
    (a) => a.type === 'Run' || a.type === 'VirtualRun' || a.type === 'TrailRun'
  );

  const totalKm = runs.reduce((sum, a) => sum + (a.distanceM ?? 0) / 1000, 0);
  const longRunKm = runs.length
    ? Math.max(...runs.map((a) => (a.distanceM ?? 0) / 1000))
    : 0;
  const totalMovingTimeS = runs.reduce((sum, a) => sum + (a.movingTimeS ?? 0), 0);
  const totalElevationGainM = runs.reduce((sum, a) => sum + (a.elevationGainM ?? 0), 0);

  // Back-to-back: km from Sat (dow=5) + Sun (dow=6) runs
  const backToBackKm = runs
    .filter((a) => { const dow = dowOf(a.startDateLocal); return dow === 5 || dow === 6; })
    .reduce((sum, a) => sum + (a.distanceM ?? 0) / 1000, 0);

  // Average pace: weighted by distance (a 20km run at 5:00 weighs more than a 5km at 4:30)
  let avgPaceSpk: number | null = null;
  if (totalKm > 0 && totalMovingTimeS > 0) {
    avgPaceSpk = totalMovingTimeS / totalKm;
  }

  // Average HR: weighted by moving time
  const hrActivities = activities.filter((a) => a.avgHr != null && a.movingTimeS != null);
  let avgHr: number | null = null;
  if (hrActivities.length > 0) {
    const numerator = hrActivities.reduce(
      (sum, a) => sum + (a.avgHr ?? 0) * (a.movingTimeS ?? 0),
      0
    );
    const denominator = hrActivities.reduce((sum, a) => sum + (a.movingTimeS ?? 0), 0);
    avgHr = denominator > 0 ? numerator / denominator : null;
  }

  return {
    totalKm,
    longRunKm,
    totalMovingTimeS,
    totalSessions: activities.length,
    avgPaceSpk,
    avgHr,
    totalElevationGainM,
    backToBackKm,
  };
}
