/**
 * Mid-program entry assessment — pure module.
 *
 * When a user activates a plan that started weeks ago (e.g. they set up
 * VELOCITY on week 3 of a 20-week build), the plan engine correctly
 * places them on the right week via race-date back-calculation. But
 * the training load prescribed for that week may not match their actual
 * fitness level — they haven't done the earlier weeks.
 *
 * This module detects that situation and produces a structured assessment
 * so the UI can surface it once, clearly, without shouting every session.
 *
 * Detection: period was created ≤7 days ago AND weekNumber > 2
 * (past the 2-week transition ramp — at that point load is real).
 *
 * Verdict:
 *   ok      — chronic load is ≥90% of week target; proceed as prescribed.
 *   caution — 70-89%; run easy sessions conservatively, don't force sub-T.
 *   warning — <70%; week target significantly exceeds recent fitness.
 */

export type MidEntryVerdict = 'ok' | 'caution' | 'warning';

export interface MidEntryInput {
  /** Current program week number (1-indexed). */
  weekNumber: number;
  /** Total program length in weeks. */
  programWeeks: number;
  /** 6-week trailing average weekly run km. */
  chronicKm: number;
  /** Engine's entry-load expectation for the athlete's level. */
  entryLoadKm: number;
  /** This week's prescribed total km from the engine. */
  weekKmTarget: number;
  /** ISO YYYY-MM-DD — when the plan_periods row was created. */
  periodCreatedIso: string;
  /** ISO YYYY-MM-DD — today's date. */
  todayIso: string;
}

export interface MidEntryAssessment {
  /** True if this looks like a fresh mid-program activation (within 7 days, past wk 2). */
  isNewMidEntry: boolean;
  weekNumber: number;
  /** Transition/ramp weeks the user bypassed (weekNumber - 1 for weeks 1..N-1). */
  weeksSkipped: number;
  chronicKm: number;
  weekKmTarget: number;
  /** chronicKm − weekKmTarget. Negative = below target. */
  fitnessDelta: number;
  verdict: MidEntryVerdict;
  /** One-line banner headline. */
  headline: string;
  /** 2-3 sentence body assessment. */
  body: string;
  /** Actionable suggestion, or null when verdict is ok. */
  suggestedAction: string | null;
}

export function assessMidProgramEntry(input: MidEntryInput): MidEntryAssessment {
  const {
    weekNumber,
    programWeeks,
    chronicKm,
    entryLoadKm,
    weekKmTarget,
    periodCreatedIso,
    todayIso,
  } = input;

  const daysSincePeriodCreated = dayDiff(periodCreatedIso, todayIso);
  const isNewMidEntry = weekNumber > 2 && daysSincePeriodCreated <= 7;
  const weeksSkipped = weekNumber - 1;
  const fitnessDelta = chronicKm - weekKmTarget;

  // Clamp weekKmTarget at 1 to avoid division by zero for zero-target weeks.
  const ratio = weekKmTarget > 0 ? chronicKm / weekKmTarget : 1;

  let verdict: MidEntryVerdict;
  if (ratio >= 0.90) verdict = 'ok';
  else if (ratio >= 0.70) verdict = 'caution';
  else verdict = 'warning';

  const chronicRounded = Math.round(chronicKm);
  const targetRounded = Math.round(weekKmTarget);
  const gapRounded = Math.round(Math.abs(fitnessDelta));

  let headline: string;
  let body: string;
  let suggestedAction: string | null = null;

  switch (verdict) {
    case 'ok':
      headline = `Load matches week ${weekNumber} — proceed as prescribed`;
      body =
        `You're averaging ${chronicRounded}km/week over the last 6 weeks, which aligns with ` +
        `this week's ${targetRounded}km target. The prescribed sessions should be manageable. ` +
        (weeksSkipped > 1
          ? `Note: you've skipped ${weeksSkipped} transition week${weeksSkipped > 1 ? 's' : ''} — run easy days conservatively for the first week.`
          : 'Run the easy days honestly and the sub-T sessions will land correctly.');
      break;

    case 'caution':
      headline = `Recent load is ${gapRounded}km below week ${weekNumber}'s target`;
      body =
        `Your 6-week average is ${chronicRounded}km/week; week ${weekNumber} prescribes ${targetRounded}km. ` +
        `That ${gapRounded}km gap is manageable if you treat the easy sessions as genuinely easy ` +
        `and don't force the sub-threshold volume. The engine's entry-load expectation for your ` +
        `level is ${Math.round(entryLoadKm)}km/week — you're close.`;
      suggestedAction =
        'Hit the easy days at the lower end of the prescribed range and monitor how the sub-T sessions feel.';
      break;

    case 'warning':
      headline = `Load gap is significant — week ${weekNumber} prescribes ${gapRounded}km more than you've been running`;
      body =
        `Your 6-week average is ${chronicRounded}km/week; week ${weekNumber} prescribes ${targetRounded}km — ` +
        `a ${gapRounded}km gap. Jumping straight to this load skips the transition ramp (weeks 1–2) ` +
        `designed to build the sub-threshold habit before the full session volume arrives. ` +
        `The entry-load expectation for your level is ${Math.round(entryLoadKm)}km/week.`;
      suggestedAction =
        'Consider resetting the plan start date to place you at week 1 or 2 (Calendar → Plan start). ' +
        'If you proceed at week ' + weekNumber + ', treat this week as an easy-only orientation — ' +
        'run the prescribed sessions at 70% effort and build up over the next 2 weeks.';
      break;
  }

  return {
    isNewMidEntry,
    weekNumber,
    weeksSkipped,
    chronicKm,
    weekKmTarget,
    fitnessDelta,
    verdict,
    headline,
    body,
    suggestedAction,
  };
}

/** Days from `fromIso` to `toIso` (positive = toIso is in the future). */
function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z');
  const to = new Date(toIso + 'T00:00:00Z');
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
