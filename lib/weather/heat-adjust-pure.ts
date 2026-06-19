/**
 * Phase 7 - heat / humidity pace adjustment (PURE).
 *
 * No DB, no I/O, no server-only. Given ambient temperature + relative
 * humidity, estimates how much a runner's pace realistically slows in the
 * heat, plus a short hydration / cooling advisory.
 *
 * This is OBSERVED / ADVISORY ONLY. It informs pacing on a hot day; it does
 * NOT silently rewrite prescriptions or pace zones. The athlete (or a future
 * race-execution view) decides what to do with the number.
 *
 * Model rationale (deliberately conservative, defensible):
 *   - No penalty at or below ~15C. Trained runners are essentially
 *     unaffected below this; thermoregulation keeps up.
 *   - Above 15C, pace slows progressively. Jack Daniels' heat tables put the
 *     cost at roughly 1.5-2% slower per ~5C above the threshold for dry
 *     conditions - i.e. ~0.3-0.4% per degree. We use 0.35%/degC as the dry
 *     baseline.
 *   - Humidity matters because sweat cannot evaporate (and so cannot cool)
 *     when the air is already wet. Below ~50% RH the effect is negligible;
 *     above that it amplifies the heat penalty. We model this as a multiplier
 *     on the per-degree cost that scales with humidity over 50%.
 *   - Rather than a raw air temperature we drive the penalty off an
 *     apparentTempC ("feels like") that nudges the temperature upward when
 *     humidity is high - a simplified heat-index, kept monotonic and bounded.
 *   - The total adjustment is capped at MAX_PACE_ADJUST_PCT (10%). Beyond
 *     that the right call is not "run 12% slower", it is "back off / abort",
 *     which the 'severe' advisory says explicitly.
 *
 * All maths live here, pure and unit-tested, to avoid drift and match the
 * existing pure-engine pattern (vo2max-pure.ts, execution-pure.ts).
 */

/** Below this air temperature there is no heat penalty (degrees C). */
export const HEAT_THRESHOLD_C = 15;

/** Above this relative humidity, evaporative cooling starts to fail (%). */
export const HUMIDITY_THRESHOLD_PCT = 50;

/** Dry-air pace cost per degree C above the threshold (fraction of a %). */
export const DRY_PCT_PER_DEG = 0.35;

/** Hard cap on the pace adjustment - past here the advice is "back off". */
export const MAX_PACE_ADJUST_PCT = 10;

export type HeatSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export interface HeatConditions {
  /** Ambient (dry-bulb) air temperature, degrees C. */
  tempC: number;
  /** Relative humidity, 0-100 (%). */
  humidityPct: number;
}

export interface HeatAdjustment {
  /** Humidity-weighted "feels like" temperature, degrees C. */
  apparentTempC: number;
  /** Suggested pace slowdown as a positive % (0 = no change). */
  paceAdjustPct: number;
  severity: HeatSeverity;
  /** Short hydration / cooling guidance, advisory only. */
  advisory: string;
}

/**
 * A simplified, monotonic "feels like" temperature.
 *
 * We add a humidity surcharge that only kicks in above the humidity
 * threshold AND above the heat threshold (muggy cold air does not feel
 * dangerously hot). The surcharge grows with both how far over 50% RH the
 * air is and how warm it already is, so hotter + wetter always reads higher.
 * Kept simple and bounded rather than the full Rothfusz heat-index regression.
 */
export function apparentTemperature(c: HeatConditions): number {
  const humidity = clampHumidity(c.humidityPct);
  if (c.tempC <= HEAT_THRESHOLD_C) {
    // Cold air: humidity does not make it "feel hotter".
    return round1(c.tempC);
  }
  const humidityExcess = Math.max(0, humidity - HUMIDITY_THRESHOLD_PCT) / 100; // 0..0.5
  const warmth = c.tempC - HEAT_THRESHOLD_C; // degrees over threshold
  // Up to ~0.3 deg of surcharge per degree over threshold at 100% RH.
  const surcharge = warmth * humidityExcess * 0.6;
  return round1(c.tempC + surcharge);
}

/**
 * Core model: temperature + humidity -> pace adjustment + advisory.
 *
 * Drives the penalty off apparentTempC so humidity is already baked in, then
 * applies an extra humidity multiplier on the per-degree slope for the very
 * muggy end. Result is clamped to [0, MAX_PACE_ADJUST_PCT].
 */
export function heatAdjust(c: HeatConditions): HeatAdjustment {
  const humidity = clampHumidity(c.humidityPct);
  const apparentTempC = apparentTemperature({ tempC: c.tempC, humidityPct: humidity });

  let paceAdjustPct = 0;
  if (apparentTempC > HEAT_THRESHOLD_C) {
    const degOver = apparentTempC - HEAT_THRESHOLD_C;
    // Humidity multiplier: 1.0 at/below 50% RH, scaling up to ~1.5 at 100%.
    const humidityExcess = Math.max(0, humidity - HUMIDITY_THRESHOLD_PCT) / 100; // 0..0.5
    const humidityMult = 1 + humidityExcess; // 1.0..1.5
    paceAdjustPct = degOver * DRY_PCT_PER_DEG * humidityMult;
  }

  paceAdjustPct = clampPct(round1(paceAdjustPct));
  const severity = severityFor(paceAdjustPct);

  return {
    apparentTempC,
    paceAdjustPct,
    severity,
    advisory: advisoryFor(severity),
  };
}

/**
 * Apply a heat adjustment to a goal pace (seconds per km). A positive
 * paceAdjustPct yields a LARGER spk (slower pace). Advisory only - callers
 * decide whether to actually pace to this.
 */
export function applyHeatToPaceSpk(goalSpk: number, c: HeatConditions): number {
  const { paceAdjustPct } = heatAdjust(c);
  return round1(goalSpk * (1 + paceAdjustPct / 100));
}

// Severity bands keyed off the resulting pace cost rather than raw temp, so
// the band always agrees with the number shown to the athlete.
function severityFor(paceAdjustPct: number): HeatSeverity {
  if (paceAdjustPct <= 0) return 'none';
  if (paceAdjustPct < 3) return 'mild';
  if (paceAdjustPct < 6) return 'moderate';
  return 'severe';
}

function advisoryFor(severity: HeatSeverity): string {
  switch (severity) {
    case 'none':
      return 'Comfortable conditions - run to plan, drink to thirst.';
    case 'mild':
      return 'Mild heat - ease the early pace, sip fluids regularly, start hydrated.';
    case 'moderate':
      return 'Moderate heat - slow your target, take fluids and electrolytes every aid station, pour water to cool.';
    case 'severe':
      return 'Severe heat - prioritise finishing safely over time. Cool aggressively, drink electrolytes, and stop if you feel dizzy or stop sweating.';
  }
}

function clampHumidity(h: number): number {
  if (Number.isNaN(h)) return 0;
  return Math.min(100, Math.max(0, h));
}

function clampPct(p: number): number {
  if (Number.isNaN(p) || p < 0) return 0;
  return Math.min(MAX_PACE_ADJUST_PCT, p);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
