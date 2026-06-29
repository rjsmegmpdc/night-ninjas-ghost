/**
 * Phase 9 — pure coach voice trigger engine.
 *
 * Maps an athlete's current plan position to a list of pre-written coach
 * messages. No I/O — just position → messages. Testable and side-effect-free.
 *
 * Trigger logic:
 *   block-start  weeks 1–2: foundation reminder
 *   mid-block    centre-third of the program: fatigue acknowledgement
 *   taper-start  exact entry week of taper: trust-the-drop message
 *   block-end    final 2 weeks: finishing straight reminder
 */

export type CoachTrigger = 'block-start' | 'mid-block' | 'taper-start' | 'block-end';

export interface CoachMessage {
  trigger: CoachTrigger;
  headline: string;
  body: string;
}

export interface PlanPosition {
  weekNumber: number;
  programWeeks: number;
  dojo: string;
}

/** First week of taper — 3 weeks out for most marathon programs. */
export function taperStartWeek(programWeeks: number): number {
  return Math.max(1, programWeeks - 2);
}

/** Proportional centre-third of the block — where mid-block fatigue lands. */
function midBlockRange(programWeeks: number): { start: number; end: number } {
  return {
    start: Math.round(programWeeks * 0.38),
    end: Math.round(programWeeks * 0.58),
  };
}

export function getCoachMessages(pos: PlanPosition): CoachMessage[] {
  const { weekNumber, programWeeks } = pos;
  const messages: CoachMessage[] = [];

  // Block start — first 2 weeks
  if (weekNumber <= 2) {
    messages.push({
      trigger: 'block-start',
      headline: 'The block starts here.',
      body: `Week ${weekNumber} of ${programWeeks}. Build the foundation, not the ceiling. Run easy, keep the volume honest, and resist the urge to prove fitness now. The race is months away.`,
    });
  }

  // Mid-block — centre-third of the program
  const mid = midBlockRange(programWeeks);
  if (weekNumber >= mid.start && weekNumber <= mid.end) {
    messages.push({
      trigger: 'mid-block',
      headline: 'This is the hard middle.',
      body: `Week ${weekNumber} of ${programWeeks}. Most blocks feel hardest here — volume is high, the race is still far enough away to feel abstract. This is exactly where fitness is built. Hold the line.`,
    });
  }

  // First taper week — fires once on the exact entry week
  const taperEntry = taperStartWeek(programWeeks);
  if (weekNumber === taperEntry) {
    messages.push({
      trigger: 'taper-start',
      headline: 'Volume drops this week. Trust it.',
      body: `Taper begins now — week ${weekNumber} of ${programWeeks}. The mileage reduction is intentional. Your body is converting accumulated work into race-day capacity. Resist the urge to add miles. The work is done.`,
    });
  }

  // Block end — final 2 weeks
  if (weekNumber >= programWeeks - 1) {
    messages.push({
      trigger: 'block-end',
      headline: 'The block is nearly complete.',
      body: `Week ${weekNumber} of ${programWeeks}. You're in the final stretch. Stay consistent, sleep well, and trust the work. What you built in training doesn't leave you.`,
    });
  }

  return messages;
}
