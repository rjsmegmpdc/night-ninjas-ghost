/**
 * Phase 8 - additive session matching (PURE).
 *
 * Layered ON TOP of the day-of-week compliance engine (compliance.ts) - it does
 * NOT rewrite it. Given the week's planned sessions + the activities that
 * happened, it surfaces two messy-reality signals the strict per-day evaluator
 * misses:
 *
 *   - SHIFTED: a planned session with no same-day activity, but a same-kind
 *     activity on an adjacent day (+/-1) - "Tuesday's tempo was done Wednesday".
 *   - EXTRAS: run/cross/strength activities that match no planned session on
 *     their day or an adjacent one - genuine extra work, not a compliance miss.
 *
 * Greedy, bounded: same-day claims first, then a single adjacent-day pass.
 * No DB, no I/O.
 */

import type { SessionType } from '@/lib/plans/types';

export type MatchKind = 'run' | 'cross' | 'strength';

export interface PlannedSlot {
  dow: number; // Mon=0..Sun=6
  type: SessionType;
}

export interface ActivityLite {
  dow: number;
  /** Strava activity type, e.g. 'Run', 'Ride', 'WeightTraining'. */
  type: string;
}

export interface ShiftedSession {
  plannedDow: number;
  plannedType: SessionType;
  doneDow: number;
}

export interface MatchExtra {
  dow: number;
  kind: MatchKind;
}

export interface WeekMatchSummary {
  shifted: ShiftedSession[];
  extras: MatchExtra[];
}

/** The training kind a planned session belongs to; null for rest. */
export function plannedKind(type: SessionType): MatchKind | null {
  switch (type) {
    case 'easy':
    case 'long':
    case 'tempo':
    case 'interval':
    case 'repetition':
    case 'recovery':
      return 'run';
    case 'cross':
      return 'cross';
    case 'strength':
      return 'strength';
    case 'rest':
      return null;
  }
}

/** The training kind an activity counts as; null for things we don't match (walks etc). */
export function activityKind(type: string): MatchKind | null {
  switch (type) {
    case 'Run':
    case 'VirtualRun':
    case 'TrailRun':
      return 'run';
    case 'Ride':
    case 'VirtualRide':
    case 'MountainBikeRide':
    case 'Swim':
    case 'Workout':
      return 'cross';
    case 'WeightTraining':
      return 'strength';
    default:
      return null; // Walk, Hike, Yoga, etc. - not matched, not flagged extra
  }
}

export function analyzeWeekMatching(planned: PlannedSlot[], activities: ActivityLite[]): WeekMatchSummary {
  // Trainable slots only, in dow order.
  const slots = planned
    .map((p) => ({ dow: p.dow, type: p.type, kind: plannedKind(p.type) }))
    .filter((s): s is { dow: number; type: SessionType; kind: MatchKind } => s.kind !== null)
    .sort((a, b) => a.dow - b.dow);

  // Matchable activities only.
  const acts = activities
    .map((a) => ({ dow: a.dow, kind: activityKind(a.type) }))
    .filter((a): a is { dow: number; kind: MatchKind } => a.kind !== null);

  const claimedAct = new Set<number>();
  const coveredSlot = new Set<number>();

  // Pass 1 - same day, same kind (normal compliance; not shifted, not extra).
  slots.forEach((slot, si) => {
    const ai = acts.findIndex((a, i) => !claimedAct.has(i) && a.dow === slot.dow && a.kind === slot.kind);
    if (ai !== -1) {
      claimedAct.add(ai);
      coveredSlot.add(si);
    }
  });

  // Pass 2 - adjacent day (+/-1), same kind -> shifted.
  const shifted: ShiftedSession[] = [];
  slots.forEach((slot, si) => {
    if (coveredSlot.has(si)) return;
    const ai = acts.findIndex(
      (a, i) => !claimedAct.has(i) && a.kind === slot.kind && Math.abs(a.dow - slot.dow) === 1
    );
    if (ai !== -1) {
      claimedAct.add(ai);
      coveredSlot.add(si);
      shifted.push({ plannedDow: slot.dow, plannedType: slot.type, doneDow: acts[ai].dow });
    }
  });

  // Remaining unclaimed matchable activities -> extras.
  const extras: MatchExtra[] = acts
    .filter((_, i) => !claimedAct.has(i))
    .map((a) => ({ dow: a.dow, kind: a.kind }));

  return { shifted, extras };
}
