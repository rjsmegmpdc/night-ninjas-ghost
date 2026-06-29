/**
 * R2.5 VO2 max - PURE estimation formulas + source resolution.
 *
 * No DB, no server-only. Four observation sources, resolved by priority:
 *
 *   manual-lab > cooper > rockport > device
 *
 * Rationale for the order: a lab test (graded treadmill, gas exchange) is
 * ground truth; the Cooper 12-minute run is a hard field max effort and
 * quite predictive for runners; the Rockport walk test is designed for
 * lower fitness and less accurate for trained athletes; device estimates
 * (Garmin) are convenient but proprietary and noisy.
 *
 * v1 is OBSERVED-ONLY: VO2 max is shown and trended, but does NOT feed
 * back into pace zones or prescriptions. That keeps a noisy estimate from
 * silently moving training targets.
 */

export type Vo2Source = 'manual-lab' | 'cooper' | 'rockport' | 'device';

export const VO2_SOURCE_PRIORITY: Vo2Source[] = ['manual-lab', 'cooper', 'rockport', 'device'];

export function rankVo2Source(s: Vo2Source | string): number {
  const i = (VO2_SOURCE_PRIORITY as string[]).indexOf(s);
  return i === -1 ? VO2_SOURCE_PRIORITY.length : i;
}

/**
 * Cooper 12-minute test.
 *   VO2max = (distance_metres - 504.9) / 44.73
 * Distance is whatever the athlete covered in a maximal 12-minute run.
 */
export function cooperVo2(distanceMetres: number): number {
  return round1((distanceMetres - 504.9) / 44.73);
}

/**
 * Rockport 1-mile walk test.
 *   VO2max = 132.853 - (0.0769 * weightLb) - (0.3877 * age)
 *            + (6.315 * sexFactor) - (3.2649 * timeMin) - (0.1565 * endHr)
 * sexFactor: male = 1, female = 0.
 * Designed for a 1-mile (1609m) brisk walk; time in minutes, HR at finish.
 */
export function rockportVo2(input: {
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  timeMin: number;
  endHr: number;
}): number {
  const weightLb = input.weightKg * 2.20462;
  const sexFactor = input.sex === 'male' ? 1 : 0;
  const v =
    132.853 -
    0.0769 * weightLb -
    0.3877 * input.age +
    6.315 * sexFactor -
    3.2649 * input.timeMin -
    0.1565 * input.endHr;
  return round1(v);
}

/**
 * A rough fitness banding for context, age/sex-adjusted (ACSM-style
 * coarse buckets). Returned as a label only - never used for prescription.
 */
export function vo2FitnessBand(vo2: number, age: number, sex: 'male' | 'female'): string {
  // Coarse thresholds for the "superior" floor by age decade (male).
  // Female floors run ~6-8 points lower; we subtract a flat 7 as an approx.
  const maleSuperiorFloor =
    age < 30 ? 56 : age < 40 ? 53 : age < 50 ? 49 : age < 60 ? 45 : 41;
  const floor = sex === 'male' ? maleSuperiorFloor : maleSuperiorFloor - 7;
  if (vo2 >= floor) return 'superior';
  if (vo2 >= floor - 6) return 'excellent';
  if (vo2 >= floor - 12) return 'good';
  if (vo2 >= floor - 18) return 'fair';
  return 'developing';
}

export interface Vo2Observation {
  /** ISO date 'YYYY-MM-DD' */
  dateIso: string;
  source: Vo2Source;
  /** ml/kg/min */
  value: number;
}

export interface ResolvedVo2 {
  /** Best current estimate by source priority, most recent within source */
  current: number | null;
  currentSource: Vo2Source | null;
  currentDateIso: string | null;
  /** All observations sorted ascending by date, for trend display */
  series: Vo2Observation[];
}

/**
 * Resolve a set of observations into a current value + a trend series.
 *
 * "Current" picks the highest-priority source that has any observation,
 * then the most RECENT observation within that source. This means a fresh
 * Cooper test outranks an old lab test only if you treat recency... no:
 * priority wins first (lab > cooper), then recency within the chosen
 * source. A lab test is ground truth regardless of a newer Cooper.
 *
 * The trend series, by contrast, includes every observation so the chart
 * shows the full history across sources.
 */
export function resolveVo2(observations: Vo2Observation[]): ResolvedVo2 {
  const series = [...observations].sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));

  let current: number | null = null;
  let currentSource: Vo2Source | null = null;
  let currentDateIso: string | null = null;

  for (const source of VO2_SOURCE_PRIORITY) {
    const inSource = series.filter((o) => o.source === source);
    if (inSource.length > 0) {
      const latest = inSource[inSource.length - 1];
      current = latest.value;
      currentSource = source;
      currentDateIso = latest.dateIso;
      break;
    }
  }

  return { current, currentSource, currentDateIso, series };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
