/** Phase lifecycle kinds for a training program. */
export type ProgramPhaseKind =
  | 'pre-program'
  | 'program-week-N'
  | 'post-race'
  | 'off-season';

/**
 * Describes which phase of a training plan the athlete is currently in,
 * plus race-proximity context for display layer decisions.
 */
export interface ProgramPhase {
  kind: ProgramPhaseKind;
  /** 1-based week number within the active plan period. */
  programWeekNumber: number;
  /** Total weeks in the plan. */
  programWeeks: number;
  /** Days until the goal race. Null when no goal race is set. */
  daysToRace: number | null;
  /** Days since the most recent race. Null when no recent race. */
  daysSinceRace: number | null;
  /** Weeks until the plan starts (negative = plan has started). Null when no plan. */
  weeksToProgramStart: number | null;
  /** Human-readable phase label, e.g. 'Base phase'. */
  label: string;
  /** Secondary display line, e.g. 'Week 5 of 20'. */
  subline: string;
}
