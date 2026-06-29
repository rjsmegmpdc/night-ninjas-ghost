/**
 * Phase 6 - race execution (PURE).
 *
 * No DB, no I/O. Turns a goal race (distance + target time) and athlete weight
 * into the three execution plans a runner needs on the day:
 *   - pacing  : per-5km splits for even / negative / progressive strategies
 *   - fuelling: carbs / fluid / sodium per hour + gel count and cadence
 *   - carb-load: the final-3-days carbohydrate ramp
 *
 * All guidance is evidence-based and deliberately conservative. Heat / sweat
 * adjustments arrive with Phase 7 (weather); this is the sea-level baseline.
 */

export type PaceStrategy = 'even' | 'negative' | 'progressive';

export interface PaceSegment {
  fromKm: number;
  toKm: number;
  segmentKm: number;
  /** Seconds per km for this segment. */
  paceSpk: number;
  /** Time for this segment, seconds. */
  segmentTimeS: number;
  cumulativeKm: number;
  cumulativeTimeS: number;
}

export interface PacePlan {
  strategy: PaceStrategy;
  goalPaceSpk: number;
  totalTimeS: number;
  segments: PaceSegment[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Per-5km pacing plan for a target finish time. Segment multipliers shape the
 * effort, then every plan is rescaled so the cumulative time lands exactly on
 * the target - the strategy changes the distribution, never the finish.
 */
export function pacePlan(distanceKm: number, targetTimeS: number, strategy: PaceStrategy): PacePlan {
  const goalPaceSpk = targetTimeS / distanceKm;
  const SEG = 5;

  const bounds: Array<[number, number]> = [];
  let k = 0;
  while (k < distanceKm - 1e-9) {
    const to = Math.min(k + SEG, distanceKm);
    bounds.push([k, to]);
    k = to;
  }
  const n = bounds.length;

  // Multiplier on goal pace per segment (>1 = slower). frac runs 0..1 across
  // the race; the three strategies differ only in this shape.
  const mult = (i: number): number => {
    const frac = n > 1 ? i / (n - 1) : 0;
    if (strategy === 'even') return 1;
    if (strategy === 'negative') return frac < 0.5 ? 1.015 : 0.985;
    return 1.02 - 0.04 * frac; // progressive: +2% -> -2%
  };

  const rawTimes = bounds.map(([from, to], i) => (to - from) * goalPaceSpk * mult(i));
  const rawTotal = rawTimes.reduce((s, t) => s + t, 0);
  const scale = rawTotal > 0 ? targetTimeS / rawTotal : 1;

  const segments: PaceSegment[] = [];
  let cumKm = 0;
  let cumT = 0;
  bounds.forEach(([from, to], i) => {
    const segKm = to - from;
    const segT = rawTimes[i] * scale;
    cumKm = to;
    cumT += segT;
    segments.push({
      fromKm: round2(from),
      toKm: round2(to),
      segmentKm: round2(segKm),
      paceSpk: segT / segKm,
      segmentTimeS: segT,
      cumulativeKm: round2(cumKm),
      cumulativeTimeS: cumT,
    });
  });

  return { strategy, goalPaceSpk, totalTimeS: targetTimeS, segments };
}

export interface FuelingPlan {
  durationS: number;
  carbsPerHrG: number;
  fluidMlPerHr: number;
  sodiumMgPerHr: number;
  totalCarbsG: number;
  totalFluidMl: number;
  /** Number of ~25 g gels to cover total carbs. */
  gelCount: number;
  /** Minutes between gels, evenly spaced across the effort. */
  gelIntervalMin: number;
}

const GEL_CARB_G = 25;

/**
 * Race-day fuelling from predicted duration. Carb intake follows the
 * evidence-based ladder (30 g/hr for <1h, 60 for moderate, 90 for 2.5h+ gut-
 * trained efforts). Fluid/sodium are sea-level baselines pending Phase 7.
 */
export function fuelingPlan(durationS: number): FuelingPlan {
  const hours = durationS / 3600;
  const carbsPerHrG = hours <= 1 ? 30 : hours <= 2.5 ? 60 : 90;
  const fluidMlPerHr = 500;
  const sodiumMgPerHr = 500;
  const totalCarbsG = Math.round(carbsPerHrG * hours);
  const totalFluidMl = Math.round(fluidMlPerHr * hours);
  const gelCount = Math.round(totalCarbsG / GEL_CARB_G);
  const gelIntervalMin = gelCount > 0 ? Math.round(durationS / 60 / gelCount) : 0;
  return {
    durationS,
    carbsPerHrG,
    fluidMlPerHr,
    sodiumMgPerHr,
    totalCarbsG,
    totalFluidMl,
    gelCount,
    gelIntervalMin,
  };
}

export interface CarbLoadDay {
  daysOut: number;
  gramsCarb: number;
  approxCalories: number;
}

export interface CarbLoadPlan {
  weightKg: number;
  gramsPerKg: number;
  days: CarbLoadDay[];
  guidance: string;
}

/**
 * Final-3-days carbohydrate load. ~9 g/kg/day sits in the evidence-based
 * 8-12 g/kg band and is practical to actually eat. 4 kcal per gram.
 */
export function carbLoadPlan(weightKg: number): CarbLoadPlan {
  const gramsPerKg = 9;
  const gramsCarb = Math.round(weightKg * gramsPerKg);
  const days: CarbLoadDay[] = [3, 2, 1].map((daysOut) => ({
    daysOut,
    gramsCarb,
    approxCalories: gramsCarb * 4,
  }));
  return {
    weightKg,
    gramsPerKg,
    days,
    guidance: `Roughly ${gramsPerKg} g/kg/day across the final three days for a ${Math.round(weightKg)}kg athlete. Favour easy-to-digest carbs, ease back on fibre and fat, and hydrate well.`,
  };
}
