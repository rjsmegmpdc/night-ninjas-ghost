/**
 * Dojo card metadata for the picker UI.
 *
 * The PlanEngine itself carries `displayName`, `philosophy`,
 * `defaultProgramWeeks`, `entryWeeklyLoadKm`. This module supplements
 * with picker-specific copy: a short tagline, an optional ribbon, and
 * a list of distinguishing feature lines.
 *
 * Keeping this separate from the engine prevents the engine modules
 * (which contain the prescription logic) from being bloated with UI
 * strings.
 */

import type { Dojo } from '@/lib/plans/types';

export interface DojoCardMeta {
  /** One-line tagline shown under the dojo title. */
  tagline: string;
  /**
   * Optional ribbon text shown at the very top of the card. Use sparingly
   * - only when the dojo has a genuinely distinguishing characteristic
   * worth signposting before the user reads further.
   */
  ribbon: string | null;
  /**
   * 5-6 distinguishing feature lines. These are NOT marketing - they
   * reflect what each engine actually does differently in its renderWeek
   * implementation. Keep each line short enough to scan.
   */
  features: string[];
}

const META: Record<Dojo, DojoCardMeta> = {
  'norwegian-singles': {
    tagline: 'Sub-threshold frequency, ruthless easy-day discipline',
    ribbon: 'Consistency-led',
    features: [
      'Three controlled sub-threshold sessions weekly',
      'Quality capped at ~22% of volume',
      'Reps at LT1 effort - never hammering',
      'Easy days strictly conversational (Z1)',
      'Long run is just a longer easy run',
      'Non-periodised rhythm; race touches late',
    ],
  },
  hansons: {
    tagline: 'Cumulative fatigue marathon programme',
    ribbon: 'Marathon-focused',
    features: [
      'Long runs capped at 26km',
      'Strength workouts mid-week',
      'Six runs per week, no rest weekend',
      'Marathon-pace tempo as signature session',
      'Beginner / intermediate / advanced tracks',
      '18-week structured build',
    ],
  },
  pfitzinger: {
    tagline: 'Lactate-threshold focused for time goals',
    ribbon: 'Best for time goals',
    features: [
      'High-mileage prescriptive plans',
      'Threshold-pace tempos by length',
      'Medium-long runs mid-week',
      'Multiple intensity zones',
      'Race-specific tune-up workouts',
      '12 to 18-week options',
    ],
  },
  daniels: {
    tagline: 'VDOT-calibrated, mathematically precise pacing',
    ribbon: null,
    features: [
      'Seven pace zones from VDOT calculation',
      'Mileage-aware intensity dosing',
      'E / M / T / I / R session types',
      'Recovery built into hard-day spacing',
      'Adaptive to current fitness, not goal alone',
      'Flexible 12-24 week phases',
    ],
  },
  lydiard: {
    tagline: 'Aerobic base then sharpening, classical periodisation',
    ribbon: 'Aerobic base champion',
    features: [
      'Long aerobic base period',
      'Hill phase for strength and economy',
      'Anaerobic conditioning before sharpening',
      'Race-specific peaking phase',
      'Heart-rate-based easy pace',
      'Best for athletes with a long runway',
    ],
  },
  higdon: {
    tagline: 'Approachable, beginner to intermediate',
    ribbon: null,
    features: [
      'Lower weekly volume',
      'Cross-training as an alternative',
      'Five days running max',
      'Gentle progression week-on-week',
      'Novice / intermediate / advanced tracks',
      'Suitable for first-time programs',
    ],
  },
  polarised: {
    tagline: 'Seiler 80/20 - polarised intensity distribution',
    ribbon: '80/20 method',
    features: [
      '80% easy aerobic running',
      '20% hard above lactate threshold',
      'No moderate "grey-zone" work',
      'Two quality sessions per week',
      'High-volume capacity friendly',
      'Distance-agnostic, scale to your goal',
    ],
  },
  ultra: {
    tagline: 'Distance-first for ultra marathons',
    ribbon: null,
    features: [
      'Back-to-back long-run weekends',
      'Time-on-feet over speedwork',
      'Vertical / hill-elevation tracking',
      'Fueling and pacing strategy emphasis',
      'High weekly volume baseline',
      '50K to 100mile distance support',
    ],
  },
  custom: {
    tagline: 'Define your own training week',
    ribbon: 'Build your own',
    features: [
      'Set your own weekly session pattern',
      'Manual pace zone configuration',
      'Day-by-day session editor',
      'Use when no preset fits your reality',
      'Honest with you - no hidden adjustments',
      'Most flexible, most user input required',
    ],
  },
};

export function getDojoCardMeta(dojo: Dojo): DojoCardMeta {
  return META[dojo];
}

/**
 * Display ordering - the picker shows these dojos in this order across
 * its primary row, with custom moved into the secondary "more" group.
 *
 * Primary group: most marathon-relevant, by usage frequency expectation.
 * Secondary: niche or build-your-own.
 */
export const PRIMARY_DOJOS: readonly Dojo[] = ['hansons', 'norwegian-singles', 'pfitzinger', 'daniels', 'lydiard'];
export const SECONDARY_DOJOS: readonly Dojo[] = ['higdon', 'polarised', 'ultra', 'custom'];
