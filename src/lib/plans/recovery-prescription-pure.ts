/**
 * Phase 8 - rest-day recovery prescription (PURE).
 *
 * No DB, no I/O. Turns the PRIOR day's training load (in Daniels points) into a
 * tuned rest-day prescription: how hard to back off, plus the concrete recovery
 * actions (mobility, fuel, sleep) that match the dose of work just absorbed.
 *
 * The load scale is Daniels points = minutes * POINTS_PER_MIN * sport baseline,
 * so a 60-min easy run is ~12 points, a 60-min threshold run ~36, and a hard
 * interval session 30-45+. A full rest day is 0. The thresholds below are tuned
 * to that scale and exported so they can be re-calibrated without touching logic.
 */

export type RecoveryIntensity = 'full-rest' | 'light' | 'active';

export interface RecoveryPrescription {
  intensity: RecoveryIntensity;
  headline: string;
  items: string[];
}

/** At or above this prior-day load, prescribe a genuine full-rest day. */
export const HIGH_LOAD = 30;
/** At or above this (and below HIGH_LOAD), prescribe a light recovery day. */
export const MODERATE_LOAD = 12;

/** Default sleep target, in hours. Overridable via opts. */
export const SLEEP_TARGET_HOURS = 8;
/** Default mobility / stretching budget, in minutes. Overridable via opts. */
export const MOBILITY_MINUTES = 20;

/**
 * Rest-day recovery prescription tuned to the PRIOR day's training load.
 *
 * Hard days earn a full rest with mobility, fuelling and a sleep target;
 * moderate days earn an optional easy Z1 spin with halved mobility; light or
 * zero days are genuine rest or optional easy cross-training. Negative or NaN
 * load is treated as 0 (the active band) so bad input degrades safely.
 */
export function recoveryPrescription(
  priorDayLoadPoints: number,
  opts?: { sleepTargetHours?: number; mobilityMinutes?: number },
): RecoveryPrescription {
  // Guard: negative / NaN load collapses to 0 (the active band).
  const load =
    Number.isFinite(priorDayLoadPoints) && priorDayLoadPoints > 0 ? priorDayLoadPoints : 0;

  const sleepTargetHours = opts?.sleepTargetHours ?? SLEEP_TARGET_HOURS;
  const mobilityMinutes = opts?.mobilityMinutes ?? MOBILITY_MINUTES;

  if (load >= HIGH_LOAD) {
    return {
      intensity: 'full-rest',
      headline: 'Full recovery',
      items: [
        'No running today - the work is done, let it absorb',
        `${mobilityMinutes}min mobility / light stretching`,
        'Hydrate and refuel well',
        `Sleep target: ${sleepTargetHours}h`,
      ],
    };
  }

  if (load >= MODERATE_LOAD) {
    return {
      intensity: 'light',
      headline: 'Easy recovery',
      items: [
        'Optional 20-30min Z1 - easy spin, walk or jog if you feel like moving',
        `${Math.round(mobilityMinutes / 2)}min mobility`,
        `Sleep target: ${sleepTargetHours}h`,
      ],
    };
  }

  return {
    intensity: 'active',
    headline: 'Rest or easy cross',
    items: [
      'Genuine rest, or optional easy cross-training if you are keen',
      'A few minutes of light mobility',
    ],
  };
}
