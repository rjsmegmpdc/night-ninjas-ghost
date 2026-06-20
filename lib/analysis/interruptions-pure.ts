/**
 * Phase 4 - interruptions & injury (PURE).
 *
 * No DB, no server-only. Interruptions are athlete-logged breaks in
 * training: injury, illness, travel, or other life events. The pure logic
 * here computes:
 *   - status (active vs resolved) and duration
 *   - return-to-training guidance after a resolved injury/illness (a
 *     graded ramp, not a hard switch back to full load)
 *   - an injury-risk read combining ACWR with logged history
 *
 * Design principle (locked in 3b): athlete-logged injuries NEVER trigger
 * automatic plan adjustments. The athlete drives recovery. This module
 * informs; it does not auto-modify prescriptions. The 3b pipeline reads
 * `hasActiveInjuryOrIllness` to suppress automatic-mode adjustments.
 */

export type InterruptionType = 'injury' | 'illness' | 'travel' | 'other';
export type InterruptionSeverity = 'niggle' | 'moderate' | 'severe';

export interface Interruption {
  id: number;
  type: InterruptionType;
  /** Body region for injuries (e.g. 'calf', 'knee'); null otherwise */
  bodyRegion: string | null;
  severity: InterruptionSeverity;
  /** ISO date the interruption started */
  startDate: string;
  /** ISO date it resolved, or null if ongoing */
  endDate: string | null;
  note: string | null;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00').getTime();
  const b = new Date(bIso + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

export function isActive(i: Interruption): boolean {
  return i.endDate === null;
}

/** Duration in days (inclusive of start). For active ones, through `todayIso`. */
export function durationDays(i: Interruption, todayIso: string): number {
  const end = i.endDate ?? todayIso;
  return Math.max(1, daysBetween(i.startDate, end) + 1);
}

/**
 * Whether any active interruption is an injury or illness - the categories
 * that must suppress automatic plan adjustments. Travel/other don't suppress
 * (the athlete can still train; the plan just shifts).
 */
export function hasActiveInjuryOrIllness(interruptions: Interruption[]): boolean {
  return interruptions.some((i) => isActive(i) && (i.type === 'injury' || i.type === 'illness'));
}

/**
 * Interruptions (of the given types) whose date span OVERLAPS a week window.
 *
 * Overlap = starts on/before the week ends AND (still open OR ends on/after the
 * week starts). Unlike isActive() - which only asks "open right now?" - this is
 * the per-week check the 3b multi-week pipeline needs, so a long-resolved
 * illness does not flag every week and a future-dated travel window flags only
 * the week(s) it actually covers.
 *
 * Dates are plain 'YYYY-MM-DD' strings, compared lexicographically (correct for
 * zero-padded ISO dates).
 */
export function windowsOverlapping(
  interruptions: Interruption[],
  weekStartIso: string,
  weekEndIso: string,
  types: InterruptionType[]
): Interruption[] {
  return interruptions.filter((i) => {
    if (!types.includes(i.type)) return false;
    const startsOnOrBeforeWeekEnd = i.startDate <= weekEndIso;
    const endsOnOrAfterWeekStart = i.endDate === null || i.endDate >= weekStartIso;
    return startsOnOrBeforeWeekEnd && endsOnOrAfterWeekStart;
  });
}

export interface ReturnPhase {
  /** Phase index 1..n */
  phase: number;
  totalPhases: number;
  label: string;
  /** Suggested fraction of normal volume for this phase */
  volumeFraction: number;
  guidance: string;
}

/**
 * Graded return-to-training after a RESOLVED injury or illness.
 *
 * The ramp length scales with how long the athlete was out and the
 * severity: a 2-day niggle needs almost nothing; a 3-week severe injury
 * needs a careful multi-week rebuild. Returns the CURRENT phase given how
 * many days have elapsed since the interruption resolved.
 *
 * This is guidance, not enforcement - the athlete chooses to follow it.
 */
export function returnToTraining(
  i: Interruption,
  todayIso: string
): ReturnPhase | null {
  if (i.type !== 'injury' && i.type !== 'illness') return null;
  if (i.endDate === null) return null; // still active, not returning yet

  const outDays = durationDays(i, todayIso);
  const sinceResolved = daysBetween(i.endDate, todayIso);
  if (sinceResolved < 0) return null;

  // Ramp length in days scales with time out + severity.
  const sevMult = i.severity === 'severe' ? 1.5 : i.severity === 'moderate' ? 1.0 : 0.5;
  const rampDays = Math.round(Math.min(28, Math.max(3, outDays * 0.8 * sevMult)));

  // If we're past the ramp, return is complete.
  if (sinceResolved >= rampDays) return null;

  // Three phases across the ramp: reintroduce, rebuild, normalise.
  const totalPhases = 3;
  const phaseLen = rampDays / totalPhases;
  const phase = Math.min(totalPhases, Math.floor(sinceResolved / phaseLen) + 1);

  const phases: Record<number, { label: string; vol: number; guidance: string }> = {
    1: {
      label: 'Reintroduce',
      vol: 0.4,
      guidance: i.type === 'illness'
        ? 'Easy running only, kept short. No quality. If symptoms return, stop and rest another day.'
        : 'Easy running only, well within pain-free range. No quality work. Any return of the original pain means back off.',
    },
    2: {
      label: 'Rebuild',
      vol: 0.65,
      guidance: 'Build easy volume back toward normal. Reintroduce one light quality session if everything feels clean - nothing near maximal.',
    },
    3: {
      label: 'Normalise',
      vol: 0.85,
      guidance: 'Approaching full load. Resume your normal week, but hold the very hardest sessions until you have a clean week behind you.',
    },
  };

  const p = phases[phase];
  return {
    phase,
    totalPhases,
    label: p.label,
    volumeFraction: p.vol,
    guidance: p.guidance,
  };
}

export type RiskLevel = 'low' | 'elevated' | 'high';

export interface InjuryRisk {
  level: RiskLevel;
  factors: string[];
  body: string;
}

/**
 * Injury-risk read. Combines the acute:chronic workload ratio (the single
 * best-evidenced load-based risk signal) with logged injury history and any
 * active return-to-training state. Deliberately conservative wording - this
 * flags risk, it doesn't diagnose.
 */
export function assessInjuryRisk(input: {
  acwr: number | null;
  interruptions: Interruption[];
  todayIso: string;
}): InjuryRisk {
  const { acwr, interruptions, todayIso } = input;
  const factors: string[] = [];
  let score = 0;

  // ACWR contribution. At/above the 1.5 hard-rail threshold, the load ramp
  // alone is high-risk; the caution band is elevated.
  if (acwr !== null) {
    if (acwr >= 1.5) { score += 3; factors.push(`Load ramp very high (ACWR ${acwr.toFixed(2)})`); }
    else if (acwr >= 1.3) { score += 1; factors.push(`Load ramping faster than base supports (ACWR ${acwr.toFixed(2)})`); }
    else if (acwr < 0.8 && acwr > 0) { factors.push(`Load dropping off (ACWR ${acwr.toFixed(2)}) - detraining, not injury risk`); }
  }

  // Recent injury history - a resolved injury in the last 28 days is a known
  // re-injury risk window.
  const recentInjuries = interruptions.filter((i) => {
    if (i.type !== 'injury') return false;
    const ref = i.endDate ?? todayIso;
    return daysBetween(ref, todayIso) <= 28 && daysBetween(ref, todayIso) >= 0;
  });
  if (recentInjuries.length > 0) {
    score += 1;
    factors.push(`${recentInjuries.length} injury${recentInjuries.length > 1 ? ' events' : ''} in the last 4 weeks`);
  }

  // Active injury = automatically high
  if (hasActiveInjuryOrIllness(interruptions.filter((i) => i.type === 'injury'))) {
    score += 2;
    factors.push('An injury is currently logged as active');
  }

  const level: RiskLevel = score >= 3 ? 'high' : score >= 1 ? 'elevated' : 'low';

  const body =
    level === 'high'
      ? 'Multiple risk signals are stacking. This is the time to be conservative - hold or cut the hardest sessions and prioritise recovery over hitting prescribed numbers.'
      : level === 'elevated'
        ? 'One or more risk signals are present. Worth a cautious week - keep easy days genuinely easy and do not force a hard session that is not feeling right.'
        : 'No major load-based risk signals right now. Keep doing what you are doing and keep easy days easy.';

  return { level, factors, body };
}
