/**
 * Phase 3b part 2 - training monotony (PURE).
 *
 * Foster's monotony: the day-to-day sameness of training load over a rolling
 * week. monotony = mean(daily load) / SD(daily load). HIGH monotony (little
 * variation - moderately hard every day, no genuine easy days, no rest) is an
 * independent predictor of illness / injury / non-functional overreaching even
 * when total weekly load is unremarkable. Strain = monotony x weekly load.
 *
 * Rest days matter: they are the zero-load days that create the variation that
 * KEEPS monotony low. A week of 7 similar moderate days has near-zero SD and so
 * very high monotony; the healthy response is to add a recovery/rest day to
 * break the sameness - which is exactly the adjustment this trigger proposes.
 *
 * OBSERVED / ADVISORY: this informs an add-recovery proposal; it never silently
 * rewrites the plan. No DB, no I/O - pure math so vitest can exercise it.
 */

/** Foster: monotony >= ~2.0 is high (little variation). Tunable. */
export const MONOTONY_THRESHOLD = 2.0;
/**
 * Minimum training days in the window for monotony to be meaningful. A near
 * rest week is not "monotonous" in the harmful sense - it is just light.
 */
export const MONOTONY_MIN_ACTIVE_DAYS = 5;
/** Gentle add-recovery nudge (same magnitude family as 'overreached'). */
export const MONOTONY_MAGNITUDE = 0.1;
/** Cap so a degenerate zero-variance week stays bounded and JSON-safe. */
export const MONOTONY_CAP = 5;

/** Population standard deviation. Returns 0 for an empty series. */
export function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/**
 * The last `days` calendar days of load, ending at (and including) asOfIso.
 * Missing days contribute 0 - rest days are real and create the variation.
 *
 * UTC-anchored day walk to match the dailyLoad Map keys (plain 'YYYY-MM-DD'
 * sliced from startDateLocal); a local-construct + toISOString() readback would
 * shift the keys back one day in NZ (UTC+12). Mirrors computeEwma().
 */
export function dailyLoadSeries(
  dailyLoad: Map<string, number>,
  asOfIso: string,
  days: number
): number[] {
  const series: number[] = [];
  const start = new Date(asOfIso + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - (days - 1));
  for (let d = 0; d < days; d++) {
    const dayDate = new Date(start);
    dayDate.setUTCDate(dayDate.getUTCDate() + d);
    const dayIso = dayDate.toISOString().slice(0, 10);
    series.push(dailyLoad.get(dayIso) ?? 0);
  }
  return series;
}

/**
 * Foster monotony = mean / SD over the series. Zero total load -> 0 (no
 * training, no monotony). Zero variance with load present -> capped maximum
 * (every day identical is maximally monotonous).
 */
export function monotony(loads: number[]): number {
  if (loads.length === 0) return 0;
  const sum = loads.reduce((s, x) => s + x, 0);
  if (sum <= 0) return 0;
  const mean = sum / loads.length;
  const sd = stdev(loads);
  if (sd <= 1e-9) return MONOTONY_CAP;
  return Math.min(MONOTONY_CAP, Math.round((mean / sd) * 100) / 100);
}

export interface MonotonyResult {
  monotony: number;
  /** monotony x weekly load - Foster strain. */
  strain: number;
  weeklyLoad: number;
  activeDays: number;
  shouldTrigger: boolean;
  magnitude: number;
}

/**
 * Evaluate a daily-load series for the monotony trigger. Fires only when
 * monotony is high AND there were enough training days for it to mean
 * something (a light week with one spike has high variation, low monotony).
 */
export function evaluateMonotony(
  loads: number[],
  opts: { threshold?: number; minActiveDays?: number; magnitude?: number } = {}
): MonotonyResult {
  const threshold = opts.threshold ?? MONOTONY_THRESHOLD;
  const minActiveDays = opts.minActiveDays ?? MONOTONY_MIN_ACTIVE_DAYS;
  const magnitude = opts.magnitude ?? MONOTONY_MAGNITUDE;

  const weeklyLoad = Math.round(loads.reduce((s, x) => s + x, 0));
  const activeDays = loads.filter((x) => x > 0).length;
  const m = monotony(loads);
  const strain = Math.round(m * weeklyLoad);
  const shouldTrigger = m >= threshold && activeDays >= minActiveDays;

  return { monotony: m, strain, weeklyLoad, activeDays, shouldTrigger, magnitude };
}
