/**
 * Sport-type classifier.
 *
 * Single source of truth for translating Strava sport_type strings into
 * the categorical buckets the rest of the app reasons about:
 *
 *   - run / trail-run / virtual-run    — the core distance-running modalities
 *   - ride / virtual-ride / mtb        — cycling family
 *   - swim                              — single bucket
 *   - walk / hike                       — low-intensity locomotion
 *   - weights                           — barbell / dumbbell / resistance
 *   - workout                           — generic / mixed (Strava's "Workout")
 *   - crossfit                          — distinct enough to track
 *   - yoga                              — mobility / flexibility-led
 *   - pilates                           — control / mobility / strength hybrid
 *   - mobility                          — fallback for stretching, foam roll, etc.
 *   - other                             — anything we don't have a bucket for
 *
 * Two derived predicates surface frequently: `isRunning(category)` and
 * `isAuxiliary(category)`. Running activities feed compliance, intensity
 * distribution, and run-specific load. Auxiliary activities feed total
 * load (with the appropriate sport baseline) but not running intensity
 * distribution.
 *
 * Lives outside lib/analysis so non-analysis code (streak counter, cell
 * rendering) can use it without dragging analysis dependencies.
 */

export type SportCategory =
  | 'run'
  | 'trail-run'
  | 'virtual-run'
  | 'ride'
  | 'virtual-ride'
  | 'mtb'
  | 'swim'
  | 'walk'
  | 'hike'
  | 'weights'
  | 'workout'
  | 'crossfit'
  | 'yoga'
  | 'pilates'
  | 'mobility'
  | 'other';

/**
 * Map a Strava sport_type (or fall-back type) to a canonical category.
 * Strava's sport_type list is documented at:
 *   https://developers.strava.com/docs/reference/#api-models-SportType
 *
 * Pilates isn't a distinct Strava sport_type — it falls under "Workout"
 * or "StrengthTraining" depending on how the athlete logs it. We
 * recognise it from activity name when set explicitly. Same applies to
 * mobility / stretching.
 */
export function classifySport(
  sportType: string | null | undefined,
  activityName: string | null | undefined = null
): SportCategory {
  // Try to recognise pilates / mobility from activity name first since
  // Strava doesn't give them their own sport_type
  if (activityName) {
    const lower = activityName.toLowerCase();
    if (/\bpilates\b/.test(lower)) return 'pilates';
    if (/\b(mobility|stretching|stretch|foam.?roll)\b/.test(lower)) return 'mobility';
  }

  if (!sportType) return 'other';

  switch (sportType) {
    case 'Run':
      return 'run';
    case 'TrailRun':
      return 'trail-run';
    case 'VirtualRun':
      return 'virtual-run';
    case 'Ride':
    case 'EBikeRide':
    case 'GravelRide':
      return 'ride';
    case 'VirtualRide':
      return 'virtual-ride';
    case 'MountainBikeRide':
      return 'mtb';
    case 'Swim':
      return 'swim';
    case 'Walk':
      return 'walk';
    case 'Hike':
      return 'hike';
    case 'WeightTraining':
      return 'weights';
    case 'Workout':
      return 'workout';
    case 'Crossfit':
    case 'CrossFit':
      return 'crossfit';
    case 'Yoga':
      return 'yoga';
    case 'StrengthTraining':
      // Strava uses StrengthTraining as a separate sport_type — frequently
      // logged for pilates/yoga sessions. We can't disambiguate from
      // sport_type alone, so default to weights and rely on activityName
      // to upgrade to pilates/mobility when explicitly named.
      return 'weights';
    default:
      return 'other';
  }
}

/** True if the activity is a running modality (counts toward run mileage). */
export function isRunning(c: SportCategory): boolean {
  return c === 'run' || c === 'trail-run' || c === 'virtual-run';
}

/** True if the activity is auxiliary (strength, mobility, cross-training). */
export function isAuxiliary(c: SportCategory): boolean {
  return (
    c === 'weights' ||
    c === 'workout' ||
    c === 'crossfit' ||
    c === 'yoga' ||
    c === 'pilates' ||
    c === 'mobility'
  );
}

/** True if the activity is locomotion-based but not running. */
export function isAerobicCross(c: SportCategory): boolean {
  return (
    c === 'ride' ||
    c === 'virtual-ride' ||
    c === 'mtb' ||
    c === 'swim' ||
    c === 'walk' ||
    c === 'hike'
  );
}
