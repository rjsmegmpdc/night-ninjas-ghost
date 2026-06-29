/**
 * Phase 6 part 2 - post-race recovery protocol (PURE).
 *
 * After a goal race the athlete needs a graded return, not a hard switch back
 * to training. This produces the recovery phases scaled to race distance and
 * marks which phase the athlete is currently in. No DB, no I/O.
 *
 * The shape mirrors the Phase 4 returnToTraining ramp (reintroduce -> rebuild
 * -> normalise) but is race-effort driven rather than injury driven.
 */

export interface RecoveryPhase {
  index: number; // 1-based
  totalPhases: number;
  label: string;
  fromDay: number; // inclusive, days since race
  toDay: number; // inclusive
  dayRange: string;
  guidance: string;
  active: boolean;
}

export interface RecoveryProtocol {
  windowDays: number;
  phases: RecoveryPhase[];
  /** 1-based index of the active phase, or null when the window has passed. */
  currentIndex: number | null;
}

const MARATHON_KM = 42.195;

// Marathon-calibrated inclusive end-day boundaries for each phase.
const BASE_TO_DAY = [3, 7, 14, 21];
const LABELS = ['Full rest', 'Active recovery', 'Reintroduce', 'Rebuild'];
const GUIDANCE = [
  'No running. Walk, eat well, sleep. Let the muscle damage and the immune dip settle - the urge to "test the legs" is the enemy here.',
  'Easy walking, plus optional gentle cross-training (bike, swim, yoga). Still no running. Movement aids recovery; load does not.',
  'Short easy runs every other day, all conversational. If anything feels off, give it another day. You are rebooting, not training.',
  'Bring easy volume back toward normal. Hold all quality work until you feel fully bounced back and genuinely keen to train again.',
];

function dayRange(fromDay: number, toDay: number): string {
  return fromDay === toDay ? `Day ${fromDay}` : `Days ${fromDay}-${toDay}`;
}

/**
 * Recovery protocol for a race of `distanceKm`, given how many days have
 * elapsed since race day. Shorter races recover faster, so the window scales
 * down (floored so each phase keeps at least a day).
 */
export function recoveryProtocol(daysSinceRace: number, distanceKm: number): RecoveryProtocol {
  const factor = Math.max(0.45, Math.min(1, distanceKm / MARATHON_KM));

  let prev = 0;
  const phases: RecoveryPhase[] = BASE_TO_DAY.map((base, i) => {
    const fromDay = prev + 1;
    const toDay = Math.max(fromDay, Math.round(base * factor));
    prev = toDay;
    return {
      index: i + 1,
      totalPhases: BASE_TO_DAY.length,
      label: LABELS[i],
      fromDay,
      toDay,
      dayRange: dayRange(fromDay, toDay),
      guidance: GUIDANCE[i],
      active: false,
    };
  });

  let currentIndex: number | null = null;
  for (const p of phases) {
    if (daysSinceRace >= p.fromDay && daysSinceRace <= p.toDay) {
      p.active = true;
      currentIndex = p.index;
    }
  }

  return { windowDays: phases[phases.length - 1].toDay, phases, currentIndex };
}
