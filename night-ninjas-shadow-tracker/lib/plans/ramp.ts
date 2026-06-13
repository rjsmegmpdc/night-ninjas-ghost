import type { AthleteState } from '@/lib/analysis/athlete-state';

/**
 * Ramp planner.
 *
 * When an athlete is between programs (pre-program base maintenance) and
 * has a coached program scheduled in the future, the question becomes:
 * can they comfortably bridge from their current chronic load to the
 * program's expected entry load in the time available?
 *
 * The classic safety rule is "no more than 10% volume increase per week"
 * - the ACWR (acute-chronic workload ratio) literature supports this,
 * with bumps over 1.3-1.5 sharply increasing injury risk.
 *
 * Athlete state can shift the headroom:
 * - Fresh + on-form + good compliance -> the engine has confidence the
 *   athlete is adapting well, so a 15% week is acceptable for an
 *   experienced runner who's been running consistently above this load
 *   recently
 * - Loaded or recently inverted intensity -> stick to 10%
 * - Overreached -> recommend NO increase, just maintain
 *
 * This module is engine-agnostic and pure (no DB). The caller fetches
 * the inputs and presents the output on whichever surface needs it.
 */

export interface RampPlan {
  /** Severity verdict for the proposed ramp. */
  severity: 'safe' | 'stretch' | 'caution' | 'at-risk' | 'no-target';
  /** Human-readable rationale. */
  message: string;
  /** Current chronic load in km/week (typically derived from CTL). */
  currentChronicKm: number;
  /** Target entry load in km/week (from the dojo's entryWeeklyLoadKm). */
  targetEntryKm: number;
  /** Weeks remaining until the program starts. */
  weeksAvailable: number;
  /** Per-week progressive targets. Length = weeksAvailable. */
  weeklyTargets: number[];
  /** Largest week-over-week increase as a percentage. */
  peakWeeklyIncreasePct: number;
  /** Maximum weekly ramp ceiling we used (10% conservative, 15% if state strong). */
  ceilingPct: number;
}

/**
 * Decide the per-week ramp ceiling based on athlete state.
 *
 * Default 10%. We allow 15% only when ALL of these hold:
 * - TSB indicates fresh or on-form (not loaded, not overreached)
 * - Confidence is calibrated or pace-only (not 'estimated')
 *   - Estimated state isn't trustworthy enough to authorise more risk
 * - CTL is meaningfully non-zero (>= 5 points means there IS established
 *   training to assess, not someone returning from injury)
 *
 * If state is overreached, we DROP the ceiling to 0% - meaning the ramp
 * plan flatlines at the current load and the verdict will warn loudly.
 */
function decideRampCeiling(state: AthleteState | null): number {
  if (!state) return 0.10;
  if (state.formClass === 'overreached') return 0; // do not increase
  if (
    (state.formClass === 'fresh' || state.formClass === 'on-form') &&
    state.confidence !== 'estimated' &&
    state.ctl >= 5
  ) {
    return 0.15;
  }
  return 0.10;
}

/**
 * Compute a per-week ramp plan to bridge `currentChronicKm` to
 * `targetEntryKm` over `weeksAvailable` weeks, respecting a state-aware
 * weekly ceiling.
 *
 * If `targetEntryKm` is 0 (custom dojo, no expectation), returns a
 * 'no-target' plan with the current load held flat.
 */
export function computeRampPlan({
  currentChronicKm,
  targetEntryKm,
  weeksAvailable,
  athleteState,
}: {
  currentChronicKm: number;
  targetEntryKm: number;
  weeksAvailable: number;
  athleteState: AthleteState | null;
}): RampPlan {
  const ceilingPct = decideRampCeiling(athleteState);

  // No target => flat plan
  if (targetEntryKm <= 0) {
    return {
      severity: 'no-target',
      message:
        'Custom dojo or no entry-load defined. Maintain your current base; no specific ramp target.',
      currentChronicKm,
      targetEntryKm,
      weeksAvailable,
      weeklyTargets: Array(Math.max(0, weeksAvailable)).fill(currentChronicKm),
      peakWeeklyIncreasePct: 0,
      ceilingPct,
    };
  }

  // Already at or above target => maintain (a small drop is fine)
  if (currentChronicKm >= targetEntryKm) {
    return {
      severity: 'safe',
      message:
        'You are already at or above the program entry expectation. Hold your base; no ramp needed.',
      currentChronicKm,
      targetEntryKm,
      weeksAvailable,
      weeklyTargets: Array(Math.max(0, weeksAvailable)).fill(currentChronicKm),
      peakWeeklyIncreasePct: 0,
      ceilingPct,
    };
  }

  // Overreached -> recommend no ramp at all
  if (ceilingPct === 0) {
    return {
      severity: 'at-risk',
      message:
        'Your athlete state shows overreached. Do NOT increase volume - prioritise recovery and reassess in 7-10 days.',
      currentChronicKm,
      targetEntryKm,
      weeksAvailable,
      weeklyTargets: Array(Math.max(0, weeksAvailable)).fill(currentChronicKm),
      peakWeeklyIncreasePct: 0,
      ceilingPct,
    };
  }

  if (weeksAvailable <= 0) {
    // Program is starting now or already started; no ramp window remains
    const gap = targetEntryKm - currentChronicKm;
    const requiredJumpPct = gap / Math.max(1, currentChronicKm);
    return {
      severity: requiredJumpPct > 0.10 ? 'at-risk' : 'caution',
      message:
        'No ramp window left before program start. Either start at your current base ' +
        '(accept that early program weeks may feel undercooked) or push the program back to allow a ramp.',
      currentChronicKm,
      targetEntryKm,
      weeksAvailable,
      weeklyTargets: [],
      peakWeeklyIncreasePct: requiredJumpPct,
      ceilingPct,
    };
  }

  // Build linear-percentage ramp toward target
  // Required weekly multiplier to reach target in weeksAvailable weeks
  const requiredMultiplier = targetEntryKm / currentChronicKm;
  const requiredPerWeekPct = Math.pow(requiredMultiplier, 1 / weeksAvailable) - 1;

  // Decide actual ramp - cap at ceiling unless we'd undershoot dramatically
  const usedPct = Math.min(requiredPerWeekPct, ceilingPct);

  // Project forward
  const weeklyTargets: number[] = [];
  let cur = currentChronicKm;
  for (let w = 0; w < weeksAvailable; w++) {
    cur = Math.min(cur * (1 + usedPct), targetEntryKm);
    weeklyTargets.push(Math.round(cur * 10) / 10);
  }

  // Severity verdict
  const finalKm = weeklyTargets[weeklyTargets.length - 1] ?? currentChronicKm;
  const stateIsStrong =
    athleteState !== null &&
    (athleteState.formClass === 'fresh' || athleteState.formClass === 'on-form');

  let severity: RampPlan['severity'];
  let message: string;

  if (requiredPerWeekPct <= 0.10) {
    severity = 'safe';
    message = `Gap of ${formatKm(targetEntryKm - currentChronicKm)}km over ${weeksAvailable} weeks. ` +
      `Required ramp of ${formatPct(requiredPerWeekPct)} per week is well within the 10% rule.`;
  } else if (requiredPerWeekPct <= 0.15 && stateIsStrong && ceilingPct === 0.15) {
    severity = 'stretch';
    message = `Gap of ${formatKm(targetEntryKm - currentChronicKm)}km over ${weeksAvailable} weeks. ` +
      `Required ramp of ${formatPct(requiredPerWeekPct)} per week is above the 10% baseline ` +
      `but your state (fresh, calibrated) supports a 15% ceiling. Manageable - watch fatigue weekly.`;
  } else if (requiredPerWeekPct <= 0.15) {
    severity = 'caution';
    message = `Gap of ${formatKm(targetEntryKm - currentChronicKm)}km over ${weeksAvailable} weeks. ` +
      `Required ramp of ${formatPct(requiredPerWeekPct)} per week exceeds the 10% rule. ` +
      `Start ramping immediately and monitor TSB - if you trend loaded, pull back.`;
  } else {
    severity = 'at-risk';
    const undershootKm = targetEntryKm - finalKm;
    message = `Gap of ${formatKm(targetEntryKm - currentChronicKm)}km over ${weeksAvailable} weeks ` +
      `requires ${formatPct(requiredPerWeekPct)}/week - exceeds safe limits. ` +
      `Capping at ${formatPct(ceilingPct)}/week leaves you ${formatKm(undershootKm)}km short of entry. ` +
      `Options: start ramping now, push race back, or accept a more conservative goal time.`;
  }

  return {
    severity,
    message,
    currentChronicKm,
    targetEntryKm,
    weeksAvailable,
    weeklyTargets,
    peakWeeklyIncreasePct: usedPct,
    ceilingPct,
  };
}

function formatKm(km: number): string {
  return km.toFixed(1);
}

function formatPct(pct: number): string {
  return (pct * 100).toFixed(1) + '%';
}
