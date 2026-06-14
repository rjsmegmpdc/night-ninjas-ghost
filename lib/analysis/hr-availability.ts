import 'server-only';

/**
 * HR-data availability check.
 *
 * Norwegian Singles lives or dies on accurate HR zoning, so before/while
 * an athlete runs it we need to know two things from their actual data:
 *   1. Do their recent Strava activities carry heart-rate data at all?
 *   2. Is a measured max HR set (vs falling back to the 220-age estimate)?
 *
 * This reader answers both, plus surfaces the highest HR observed across
 * recent activities - a useful starting figure for a max-HR estimate (a
 * dedicated max test is still better, but an observed peak beats 220-age).
 */

import { getActivitiesInRange } from './week-queries';
import { getAthleteProfile } from '@/lib/store/settings';
import { classifySport, isRunning } from './sport-classifier';

export interface HrAvailability {
  /** Number of running activities examined in the window */
  runCount: number;
  /** How many of those carried avg HR */
  withHrCount: number;
  /** Fraction 0..1 of runs with HR */
  hrCoverage: number;
  /** Highest activity max HR observed, or null */
  observedMaxHr: number | null;
  /** Whether a measured max HR is set in the profile */
  hasMeasuredMaxHr: boolean;
  /** Profile age, for the 220-age fallback messaging */
  age: number | null;
  /** Overall verdict for the UI */
  status: 'good' | 'partial' | 'missing' | 'no-activities';
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getHrAvailability(days = 42): Promise<HrAvailability> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const [acts, profile] = await Promise.all([
    getActivitiesInRange(isoDay(start), isoDay(end)),
    getAthleteProfile(),
  ]);

  let runCount = 0;
  let withHrCount = 0;
  let observedMaxHr: number | null = null;

  for (const a of acts) {
    const category = classifySport(a.sportType ?? a.type ?? null, a.name);
    if (!isRunning(category)) continue;
    runCount++;
    if (a.avgHr != null) withHrCount++;
    if (a.maxHr != null) observedMaxHr = observedMaxHr === null ? a.maxHr : Math.max(observedMaxHr, a.maxHr);
  }

  const hrCoverage = runCount > 0 ? withHrCount / runCount : 0;
  const hasMeasuredMaxHr = profile.maxHr !== null;

  let status: HrAvailability['status'];
  if (runCount === 0) status = 'no-activities';
  else if (hrCoverage >= 0.8) status = 'good';
  else if (hrCoverage > 0) status = 'partial';
  else status = 'missing';

  return {
    runCount,
    withHrCount,
    hrCoverage,
    observedMaxHr,
    hasMeasuredMaxHr,
    age: profile.age,
    status,
  };
}
