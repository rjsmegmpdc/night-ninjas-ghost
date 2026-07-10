/**
 * fitness-assessment.ts
 *
 * Pure helpers for entry fitness assessment — best-pace extraction from
 * race-distance efforts and historical training-volume profiling.
 *
 * PURE: no DB access, no browser APIs, no worker imports.
 * Safe to import in Vitest node environment.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawActivity {
  distanceM: number;
  movingTimeS: number;
  avgSpeedMs: number; // m/s
  startDate: string;  // ISO
  type: string;
}

export interface WeeklyVolume {
  weekIso: string; // 'YYYY-WW'
  km: number;
}

export interface BestPaces {
  fiveK: number | null;        // sec/km — null if < 2 qualifying activities
  tenK: number | null;
  halfMarathon: number | null;
  marathon: number | null;
}

export interface TrainingProfile {
  currentWeeklyKm: number;    // last 7 days
  avgWeeklyKm8wk: number;     // 8-week rolling average
  peakWeekKm: number;         // highest single week in last 52 weeks
  peakWeekDate: string;       // ISO date of that week's Monday
  weeksActiveOfLast12: number; // weeks with any run in last 12 weeks (0–12)
  totalActivities: number;    // all-time run count
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Format seconds-per-km as 'M:SS' string.
 */
function formatSpk(spk: number): string {
  const m = Math.floor(spk / 60);
  const s = Math.round(spk % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * TSB-based form classification — mirrors classifyForm() in athlete-state-pure.ts
 * without importing it (keeps this module pure and dependency-free).
 *
 *   TSB > 25   → fresh
 *   TSB > 10   → on-form
 *   TSB >= -10 → maintained
 *   TSB >= -25 → loaded
 *   TSB < -25  → overreached
 */
function classifyFormLocal(tsb: number): string {
  if (tsb > 25) return 'fresh';
  if (tsb > 10) return 'on-form';
  if (tsb >= -10) return 'maintained';
  if (tsb >= -25) return 'loaded';
  return 'overreached';
}

/**
 * Return the median value from a sorted (ascending) numeric array.
 * Returns null if the array is empty.
 */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Parse a 'YYYY-WW' string into the ISO date of that week's Monday.
 *
 * Uses the ISO 8601 week convention: week 01 contains Jan 4.
 * Algorithm: find Jan 4 of the year, rewind to Monday, then advance
 * (weekNumber - 1) weeks.
 */
function weekIsoToMonday(weekIso: string): string {
  const [yearStr, weekStr] = weekIso.split('-');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Jan 4 is always in week 1 of its year (ISO 8601)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  // Day-of-week: Mon=0, …, Sun=6 (UTC)
  const dowJan4 = (jan4.getUTCDay() + 6) % 7;
  // Monday of week 1
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dowJan4);
  // Monday of target week
  const targetMon = new Date(week1Mon);
  targetMon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);

  return targetMon.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Exported pure functions
// ---------------------------------------------------------------------------

/**
 * Extract best race-distance paces from a set of activities.
 *
 * For each bracket, takes the top-3 average speeds (fastest), then returns
 * the MEDIAN of those — avoiding one freak result from skewing the number.
 * Returns null if fewer than 2 qualifying activities exist for a bracket.
 */
export function getBestPaces(activities: RawActivity[]): BestPaces {
  type Bracket = { min: number; max: number };

  const brackets: Record<keyof BestPaces, Bracket> = {
    fiveK:        { min: 4000,  max: 6500  },
    tenK:         { min: 8500,  max: 12000 },
    halfMarathon: { min: 18000, max: 23000 },
    marathon:     { min: 38000, max: 46000 },
  };

  function bestPaceForBracket(b: Bracket): number | null {
    const qualifying = activities
      .filter(
        (a) =>
          a.distanceM >= b.min &&
          a.distanceM <= b.max &&
          a.avgSpeedMs > 0,
      )
      .map((a) => a.avgSpeedMs);

    if (qualifying.length < 2) return null;

    // Top-3 speeds (fastest first), then median
    const top3 = qualifying.sort((x, y) => y - x).slice(0, 3);
    // Sort ascending for median
    top3.sort((x, y) => x - y);
    const medianSpeedMs = median(top3);
    if (medianSpeedMs == null || medianSpeedMs <= 0) return null;
    return 1000 / medianSpeedMs;
  }

  return {
    fiveK:        bestPaceForBracket(brackets.fiveK),
    tenK:         bestPaceForBracket(brackets.tenK),
    halfMarathon: bestPaceForBracket(brackets.halfMarathon),
    marathon:     bestPaceForBracket(brackets.marathon),
  };
}

/**
 * Build a training volume profile from raw activities + pre-aggregated weekly volumes.
 */
export function buildTrainingProfile(
  activities: RawActivity[],
  weeklyVolumes: WeeklyVolume[],
): TrainingProfile {
  const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);

  // currentWeeklyKm: sum of run distance in last 7 days
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - sevenDaysMs;
  const currentWeeklyKm = activities
    .filter(
      (a) =>
        RUN_TYPES.has(a.type) &&
        new Date(a.startDate).getTime() >= cutoffMs,
    )
    .reduce((sum, a) => sum + a.distanceM / 1000, 0);

  // avgWeeklyKm8wk: mean of last 8 WeeklyVolume entries, padded with 0 for missing weeks
  const last8 = weeklyVolumes.slice(-8);
  const paddedKm = Array.from({ length: 8 }, (_, i) => last8[i]?.km ?? 0);
  const avgWeeklyKm8wk = paddedKm.reduce((s, v) => s + v, 0) / 8;

  // peakWeekKm + peakWeekDate: max km week in weeklyVolumes
  let peakWeekKm = 0;
  let peakWeekIso = weeklyVolumes[0]?.weekIso ?? '2000-01';
  for (const wv of weeklyVolumes) {
    if (wv.km > peakWeekKm) {
      peakWeekKm = wv.km;
      peakWeekIso = wv.weekIso;
    }
  }
  const peakWeekDate = weekIsoToMonday(peakWeekIso);

  // weeksActiveOfLast12: count of last 12 WeeklyVolume entries where km > 0
  const last12 = weeklyVolumes.slice(-12);
  const weeksActiveOfLast12 = last12.filter((wv) => wv.km > 0).length;

  // totalActivities: all-time run count
  const totalActivities = activities.filter((a) => RUN_TYPES.has(a.type)).length;

  return {
    currentWeeklyKm,
    avgWeeklyKm8wk,
    peakWeekKm,
    peakWeekDate,
    weeksActiveOfLast12,
    totalActivities,
  };
}

/**
 * Format the assessment data into a readable context block for the coach.
 */
export function formatAssessmentContext(
  profile: TrainingProfile,
  bestPaces: BestPaces,
  ctl: number | null,
  atl: number | null,
  tsb: number | null,
): string {
  const ctlStr = ctl != null ? ctl.toFixed(1) : 'not yet computed';
  const atlStr = atl != null ? atl.toFixed(1) : 'not yet computed';
  const tsbStr = tsb != null ? tsb.toFixed(1) : 'not yet computed';
  const formStr = tsb != null ? classifyFormLocal(tsb) : 'unknown';

  const { fiveK, tenK, halfMarathon, marathon } = bestPaces;

  return [
    '--- Entry fitness assessment data ---',
    `Training load: CTL ${ctlStr} | ATL ${atlStr} | TSB ${tsbStr} (form: ${formStr})`,
    `Current weekly volume: ${profile.currentWeeklyKm.toFixed(1)}km | 8-week avg: ${profile.avgWeeklyKm8wk.toFixed(1)}km/wk`,
    `Peak week (last 52 weeks): ${profile.peakWeekKm.toFixed(1)}km (${profile.peakWeekDate})`,
    `Consistency: ${profile.weeksActiveOfLast12}/12 active weeks`,
    `Total Strava runs: ${profile.totalActivities}`,
    '',
    'Best paces from race-distance efforts:',
    `  5k:            ${fiveK        != null ? formatSpk(fiveK)        : 'no data'}/km`,
    `  10k:           ${tenK         != null ? formatSpk(tenK)         : 'no data'}/km`,
    `  Half marathon: ${halfMarathon != null ? formatSpk(halfMarathon) : 'no data'}/km`,
    `  Marathon:      ${marathon     != null ? formatSpk(marathon)     : 'no data'}/km`,
  ].join('\n');
}
