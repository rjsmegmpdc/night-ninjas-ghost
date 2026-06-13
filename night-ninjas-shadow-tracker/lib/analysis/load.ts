/**
 * Load model — duration × sport baseline × intensity factor → Daniels points.
 *
 * Why this metric: every credible coaching framework (Daniels, Lydiard,
 * Coogan) reasons about training stress as time spent at categorised
 * intensity, calibrated by athlete-specific physiological anchors. The
 * volume-led methods (Hansons, Higdon) lean on distance because for
 * their target athletes distance is a reasonable proxy for time-at-easy.
 * Modern sport-science (Banister TRIMP, TrainingPeaks TSS) formalised
 * what coaches were already doing — it's the same idea calibrated.
 *
 * We use Daniels' point system as the unit because it's
 *   1) physiologically grounded — points-per-minute reflect energy-system
 *      stress within established zones
 *   2) widely cited in coaching literature — runners may already know it
 *   3) compositional — sum a week's points for weekly stress, exponentially
 *      weight to derive CTL/ATL/TSB
 *
 * Two-tier resolution:
 *
 *   Tier 1 — calibrated:  HR-zone or pace-zone classification using
 *                         athlete-specific anchors (max HR, threshold pace).
 *                         Output confidence: 'calibrated'.
 *
 *   Tier 2 — proxy:       activity has HR but no athlete-specific max,
 *                         falls back to age-predicted max (220 - age) with
 *                         the well-known ±15 BPM caveat. Output confidence:
 *                         'pace-only' (when pace was used) or 'estimated'
 *                         (when neither HR nor pace classification was
 *                         possible — e.g. strength sessions).
 *
 * Confidence is reported alongside every load value so consumers know how
 * trustworthy the number is. Phase 5 (athlete profile / calibration) will
 * progressively transition more activities from 'estimated' → 'calibrated'.
 *
 * No HR + no useful pace → assume easy intensity. This biases low for
 * non-run activities like a tempo cycling session that lacks both HR
 * and pace context. Acceptable for v1; calibration data trumps assumption
 * once it's in.
 */

import type { Activity } from '@/lib/db/schema';
import { classifySport, isRunning, type SportCategory } from './sport-classifier';

/* ----------------------------------------------------------------------------
 * Sport baseline — points-per-minute floor for the sport itself, before
 * intensity factor applies.
 *
 * Derived from comparative HR-reserve and energy-expenditure literature.
 * Sums to "1 minute of easy running = 0.20 Daniels points (E-zone)";
 * other sports are scaled from there based on cardiovascular intensity
 * and biomechanical/CNS load per minute.
 *
 * NOT athlete-specific. These are population-average ratios that produce
 * sensible cross-sport comparisons. Athlete calibration shifts intensity
 * factor, not these baselines.
 * ------------------------------------------------------------------------- */
const SPORT_BASELINE: Record<SportCategory, number> = {
  run: 1.0,
  'trail-run': 1.05, // terrain CNS load slight uplift
  'virtual-run': 1.0,
  ride: 0.65, // no impact, supported weight
  'virtual-ride': 0.65,
  mtb: 0.75, // technical CNS overhead
  swim: 0.85, // whole-body, no impact, high metabolic demand
  walk: 0.45,
  hike: 0.45,
  weights: 0.55, // CNS + connective load, low cardio continuous
  workout: 0.55,
  crossfit: 0.7, // mixed-modal — higher CV than pure weights
  yoga: 0.3, // recovery-adjacent
  pilates: 0.35, // slight uplift over yoga for control demands
  mobility: 0.25, // recovery-adjacent
  other: 0.5, // conservative default for unknown
};

/* ----------------------------------------------------------------------------
 * Daniels intensity zones, points-per-minute.
 * https://en.wikipedia.org/wiki/Jack_Daniels_(coach)#VDOT
 * ------------------------------------------------------------------------- */
export type IntensityZone =
  | 'easy' // E
  | 'marathon' // M
  | 'threshold' // T
  | 'interval' // I (V̇O2max)
  | 'repetition'; // R (anaerobic)

export const POINTS_PER_MIN: Record<IntensityZone, number> = {
  easy: 0.2,
  marathon: 0.4,
  threshold: 0.6,
  interval: 1.0,
  repetition: 1.5,
};

/**
 * HR-reserve thresholds (Karvonen formula percentile) for zone boundaries.
 * Boundaries are inclusive of the lower bound, exclusive of the upper.
 *   Easy: 0-70%
 *   Marathon: 70-82%
 *   Threshold: 82-88%
 *   Interval: 88-95%
 *   Repetition: 95%+
 */
const HR_RESERVE_BOUNDS: Array<[IntensityZone, number]> = [
  ['easy', 0.7],
  ['marathon', 0.82],
  ['threshold', 0.88],
  ['interval', 0.95],
  ['repetition', 1.0],
];

/* ----------------------------------------------------------------------------
 * Inputs the consumer provides
 * ------------------------------------------------------------------------- */

export interface AthleteCalibration {
  /** Measured or estimated max HR in bpm. Required for Tier 1 HR-aware classification. */
  maxHr?: number;
  /** Resting HR in bpm. Used for Karvonen HR-reserve. Defaults to 50 if absent. */
  restingHr?: number;
  /** Threshold pace in seconds per km. Used for run pace-based classification. */
  thresholdPaceSpk?: number;
  /** Athlete age — only used to derive age-predicted max HR when not measured. */
  age?: number;
}

/* ----------------------------------------------------------------------------
 * Outputs
 * ------------------------------------------------------------------------- */

export type LoadConfidence =
  | 'calibrated' // athlete-specific max HR (or threshold pace) drove classification
  | 'pace-only' // pace classification used (run with goal pace but no HR)
  | 'estimated'; // age-predicted HR or default-easy assumption used

export interface ActivityLoad {
  /** Daniels points for this activity. */
  points: number;
  /** Intensity zone determined or assumed. */
  zone: IntensityZone;
  /** Sport baseline applied. */
  sportBaseline: number;
  /** How trustworthy this number is — see LoadConfidence. */
  confidence: LoadConfidence;
  /** Sport category that drove the baseline. Useful for grouping. */
  category: SportCategory;
}

/* ----------------------------------------------------------------------------
 * The main computation
 * ------------------------------------------------------------------------- */

/**
 * Compute training load for a single activity.
 *
 * Returns load in Daniels points along with the zone, sport baseline,
 * confidence, and category.
 *
 * Activities with no movingTimeS or duration <= 0 return null — there's
 * nothing to apply duration-based stress to.
 */
export function computeActivityLoad(
  activity: Pick<
    Activity,
    'sportType' | 'type' | 'name' | 'movingTimeS' | 'avgHr' | 'avgSpeedMs'
  >,
  calibration: AthleteCalibration = {}
): ActivityLoad | null {
  const durationMin =
    activity.movingTimeS != null && activity.movingTimeS > 0
      ? activity.movingTimeS / 60
      : null;

  if (!durationMin) return null;

  const category = classifySport(
    activity.sportType ?? activity.type ?? null,
    activity.name
  );
  const sportBaseline = SPORT_BASELINE[category];

  const { zone, confidence } = classifyIntensity(activity, calibration, category);

  const points = durationMin * sportBaseline * POINTS_PER_MIN[zone];

  return {
    points: round1(points),
    zone,
    sportBaseline,
    confidence,
    category,
  };
}

/**
 * Determine which intensity zone an activity falls into.
 *
 * Resolution order:
 *   1. HR + max-HR known → Tier 1, calibrated, HR-reserve based
 *   2. HR + age known (no measured max) → Tier 2, age-predicted max
 *   3. Run with avg speed + threshold pace known → Tier 1 pace-based
 *   4. Otherwise → assume easy, confidence 'estimated'
 *
 * Non-run sports without HR data default to easy. This understates load
 * for hard cycling sessions etc. Acceptable for v1 — calibration trumps
 * assumption once it's in.
 */
function classifyIntensity(
  activity: Pick<Activity, 'avgHr' | 'avgSpeedMs'>,
  calibration: AthleteCalibration,
  category: SportCategory
): { zone: IntensityZone; confidence: LoadConfidence } {
  const avgHr = activity.avgHr;

  // Tier 1: HR + measured max → calibrated
  if (avgHr && calibration.maxHr) {
    const restingHr = calibration.restingHr ?? 50;
    const reserve = (avgHr - restingHr) / (calibration.maxHr - restingHr);
    return { zone: zoneFromHrReserve(reserve), confidence: 'calibrated' };
  }

  // Tier 2: HR + age-predicted max → estimated
  if (avgHr && calibration.age) {
    const ageMaxHr = 220 - calibration.age;
    const restingHr = calibration.restingHr ?? 50;
    const reserve = (avgHr - restingHr) / (ageMaxHr - restingHr);
    return { zone: zoneFromHrReserve(reserve), confidence: 'estimated' };
  }

  // Tier 3: Pace classification (runs only)
  if (
    isRunning(category) &&
    activity.avgSpeedMs &&
    activity.avgSpeedMs > 0 &&
    calibration.thresholdPaceSpk
  ) {
    const paceSpk = 1000 / activity.avgSpeedMs;
    return {
      zone: zoneFromPace(paceSpk, calibration.thresholdPaceSpk),
      confidence: 'pace-only',
    };
  }

  // Fallback: assume easy
  return { zone: 'easy', confidence: 'estimated' };
}

function zoneFromHrReserve(reserve: number): IntensityZone {
  // Clamp out-of-range values (e.g. avgHr > maxHr from a max-effort session)
  const clamped = Math.max(0, Math.min(1, reserve));
  for (const [zone, upperBound] of HR_RESERVE_BOUNDS) {
    if (clamped < upperBound) return zone;
  }
  return 'repetition';
}

/**
 * Map run pace (seconds per km) to a Daniels zone using threshold pace
 * as the anchor.
 *
 * Threshold pace is the canonical reference. Faster than threshold by
 * meaningful margins → interval/repetition. Slower → marathon/easy.
 *
 * Bounds chosen from Daniels' VDOT tables — the gap between T pace and
 * I pace is roughly 6-12 seconds/km depending on athlete level; we use
 * 8 sec/km as the canonical T-I boundary, 22 sec/km as I-R.
 *
 * On the slower side: M pace is roughly T + 12 sec/km, E pace is T +
 * 30+ sec/km.
 */
function zoneFromPace(paceSpk: number, thresholdSpk: number): IntensityZone {
  const delta = paceSpk - thresholdSpk;

  if (delta <= -22) return 'repetition';
  if (delta <= -8) return 'interval';
  if (delta <= 5) return 'threshold';
  if (delta <= 18) return 'marathon';
  return 'easy';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
