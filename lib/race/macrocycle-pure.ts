/**
 * Phase 6 part 2 - macrocycle / multi-block awareness (PURE).
 *
 * Context that only emerges across blocks: "this is your Nth marathon block
 * this year" and a year-over-year self-comparison for the same training week.
 * No DB, no I/O - the server layer (macrocycle.ts) feeds it queried data.
 */

export interface PeriodLite {
  startDate: string; // YYYY-MM-DD
  goalDistanceKm: number | null;
}

/**
 * How many program blocks started in `year` targeted (about) `distanceKm` -
 * i.e. which number the current block is. A goal distance counts when it is
 * within 10% (min 2km) of the target, so a 42.2km marathon block and a 42.0km
 * one count together but a half-marathon block does not.
 */
export function blockNumberForYear(periods: PeriodLite[], year: number, distanceKm: number): number {
  const tol = Math.max(2, distanceKm * 0.1);
  return periods.filter(
    (p) =>
      p.goalDistanceKm != null &&
      Math.abs(p.goalDistanceKm - distanceKm) <= tol &&
      p.startDate.slice(0, 4) === String(year)
  ).length;
}

export interface WeekStatsLite {
  totalKm: number;
  avgPaceSpk: number | null;
}

export interface WeekCompare {
  thisYearKm: number;
  lastYearKm: number;
  deltaKmPct: number | null;
  thisYearPaceSpk: number | null;
  lastYearPaceSpk: number | null;
  /** sec/km; negative = faster this year. Null when either pace is missing. */
  paceDeltaSpk: number | null;
}

/** Compare this training week against the same week last year. */
export function compareWeeks(thisYear: WeekStatsLite, lastYear: WeekStatsLite): WeekCompare {
  const deltaKmPct =
    lastYear.totalKm > 0 ? Math.round(((thisYear.totalKm - lastYear.totalKm) / lastYear.totalKm) * 100) : null;
  const paceDeltaSpk =
    thisYear.avgPaceSpk != null && lastYear.avgPaceSpk != null
      ? Math.round(thisYear.avgPaceSpk - lastYear.avgPaceSpk)
      : null;
  return {
    thisYearKm: Math.round(thisYear.totalKm),
    lastYearKm: Math.round(lastYear.totalKm),
    deltaKmPct,
    thisYearPaceSpk: thisYear.avgPaceSpk,
    lastYearPaceSpk: lastYear.avgPaceSpk,
    paceDeltaSpk,
  };
}

/**
 * The Monday of the same ISO week one year earlier. Subtracts exactly 52 weeks
 * (364 days) so the weekday is preserved - a clean "same point in the season
 * last year". UTC-anchored to match the app's plain-date keys.
 */
export function sameWeekLastYearMonday(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 364);
  return d.toISOString().slice(0, 10);
}

/** Friendly label for a race distance. */
export function distanceLabel(distanceKm: number): string {
  if (Math.abs(distanceKm - 42.195) <= 1) return 'marathon';
  if (Math.abs(distanceKm - 21.0975) <= 0.6) return 'half marathon';
  if (Math.abs(distanceKm - 10) <= 0.3) return '10K';
  if (Math.abs(distanceKm - 5) <= 0.2) return '5K';
  return `${Math.round(distanceKm)}km`;
}
