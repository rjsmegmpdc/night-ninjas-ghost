/**
 * coach-triggers.ts — SIGNAL's file (stub)
 *
 * This stub satisfies imports on the feat/coaching-ui branch so that
 * the PatrolPage smoke tests can resolve and run. The real implementation
 * is being built by SIGNAL in feat/signal-coach-triggers and will replace
 * this file on merge.
 *
 * All exported functions return empty/falsy values so they are safe to call
 * in a test environment without a real DB.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityForReview {
  stravaId: number;
  name: string;
  date: string;         // ISO date
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
  avgSpeedMs: number | null;
}

export interface ComplianceWeekResult {
  needsCoaching: boolean;
  score: number;        // 0–1
  completed: number;
  planned: number;
  weekStart: string;    // ISO date
}

export interface CoachAdjustment {
  description: string;
  type: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Functions (stubs)
// ---------------------------------------------------------------------------

/**
 * Returns the most recent activity eligible for coach review.
 * STUB — returns null until SIGNAL's implementation lands.
 */
export async function getLatestActivityForReview(): Promise<ActivityForReview | null> {
  return null;
}

/**
 * Converts an ActivityForReview into a coach context string.
 * STUB — returns an empty description.
 */
export function activityToCoachContext(activity: ActivityForReview): string {
  const distKm = (activity.distanceM / 1000).toFixed(2);
  const paceSpk =
    activity.movingTimeS > 0 && activity.distanceM > 0
      ? activity.movingTimeS / (activity.distanceM / 1000)
      : null;
  const paceStr = paceSpk
    ? `${Math.floor(paceSpk / 60)}:${String(Math.round(paceSpk % 60)).padStart(2, '0')}/km`
    : 'unknown pace';
  return [
    `Activity: ${activity.name}`,
    `Date: ${activity.date}`,
    `Distance: ${distKm} km`,
    `Time: ${Math.round(activity.movingTimeS / 60)} min`,
    `Pace: ${paceStr}`,
    activity.avgHr ? `Avg HR: ${Math.round(activity.avgHr)} bpm` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Checks last week's compliance against the training plan.
 * STUB — returns needsCoaching: false until SIGNAL's implementation lands.
 */
export async function checkLastWeekCompliance(): Promise<ComplianceWeekResult> {
  return {
    needsCoaching: false,
    score: 1.0,
    completed: 0,
    planned: 0,
    weekStart: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Parses a [ADJUST] marker from a coach response string.
 * STUB — returns null until SIGNAL's implementation lands.
 */
export function parseAdjustmentMarker(_response: string): CoachAdjustment | null {
  return null;
}
