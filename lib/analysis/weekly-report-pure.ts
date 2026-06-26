/**
 * weekly-report-pure.ts — Weekly push report computation.
 *
 * Pure module: no DB imports, no Next.js imports. Only `import type` is used
 * for compile-time type safety without runtime dependencies.
 *
 * All date arithmetic is UTC-only. We accept ISO date strings and a `today`
 * Date argument; callers must not rely on local-time Date methods here.
 *
 * DOW convention (matches DayCompliance.dow):
 *   Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
 */

import type { WeekCompliance } from '@/lib/analysis/compliance';

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export type DayReport = {
  /** ISO date derived from weekStart + day.dow (UTC arithmetic). */
  date: string;
  /** Human-readable session label from the plan template, or null on rest. */
  prescribed: string | null;
  /** Actual pace / distance summary from compliance, or null when nothing logged. */
  actual: string | null;
  /** Roll-up of all session flags for this day. */
  status: 'compliant' | 'missed' | 'partial' | 'rest';
};

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  /** Plan phase label, e.g. "Hansons — Week 12" or "No active plan". */
  phase: string;
  overallCompliance: 'green' | 'amber' | 'red';
  days: DayReport[];
  /** Actual total km run this week. */
  volumeKm: number;
  /** Target weekly km from the plan template. */
  volumeTargetKm: number;
  /** True when the long run actual km meets or exceeds the target. */
  longRunCompliant: boolean;
  /** ISO date of the next scheduled report (next occurrence of chosenDow). */
  nextReportDate: string;
};

/* -------------------------------------------------------------------------- */
/* Date helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * UTC day-of-week for an ISO date string, in Mon=0..Sun=6 convention.
 */
function utcDow(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z');
  const jsDow = d.getUTCDay(); // Sun=0..Sat=6
  return (jsDow + 6) % 7;     // Mon=0..Sun=6
}

/**
 * Add `n` UTC days to an ISO date and return the resulting ISO date string.
 */
export function addUtcDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Exported functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the ISO date string of the most recent Monday in UTC.
 * If `today` is already Monday, returns today's date.
 *
 * @param today  - The reference date (UTC midnight is extracted internally).
 */
export function getThisMondayIso(today: Date): string {
  // Build a UTC ISO string for today and then back-calculate Monday.
  const todayIso = today.toISOString().slice(0, 10);
  const dow = utcDow(todayIso); // Mon=0..Sun=6
  // dow already tells us how many days to subtract to reach Monday.
  return addUtcDays(todayIso, -dow);
}

/**
 * Determines whether a new weekly report should be generated.
 *
 * Conditions for true (all must hold):
 *   1. today's UTC DOW >= chosenDow  (the chosen day of week has arrived)
 *   2. lastGeneratedWeekStart !== getThisMondayIso(today)  (not already done this week)
 *
 * @param today                  - Current date.
 * @param chosenDow              - User-selected report day (Mon=0..Sun=6).
 * @param lastGeneratedWeekStart - ISO date of the Monday that was last reported, or null.
 */
export function shouldGenerateReport(
  today: Date,
  chosenDow: number,
  lastGeneratedWeekStart: string | null,
): boolean {
  const todayIso = today.toISOString().slice(0, 10);
  const todayDow = utcDow(todayIso);

  // Condition 1: the chosen day must have arrived this week.
  if (todayDow < chosenDow) return false;

  // Condition 2: we must not have already generated a report for this week.
  const thisMondayIso = getThisMondayIso(today);
  if (lastGeneratedWeekStart === thisMondayIso) return false;

  return true;
}

/**
 * Session-flag → day-status roll-up logic.
 *
 *   any 'ok'                              → compliant
 *   any 'miss' or 'none' (and no 'ok')   → missed
 *   any 'fast'|'slow'|'short'|'warn'     → partial
 *   no sessions AND rest prescribed       → rest
 *
 * Priority: compliant > partial > missed > rest.
 */
function rollUpDayStatus(
  sessions: Array<{ flag: string; target: { type: string } }>,
): 'compliant' | 'missed' | 'partial' | 'rest' {
  if (sessions.length === 0) return 'rest';

  // Check if all sessions are rest-type.
  const allRest = sessions.every((s) => s.target.type === 'rest');
  if (allRest) return 'rest';

  const flags = sessions.map((s) => s.flag);
  if (flags.some((f) => f === 'ok')) return 'compliant';
  if (flags.some((f) => f === 'fast' || f === 'slow' || f === 'short' || f === 'warn')) return 'partial';
  // 'miss' or 'none'
  return 'missed';
}

/**
 * Build a human-readable "prescribed" label from the first non-rest session target.
 */
function prescribedLabel(sessions: Array<{ target: { type: string; label?: string | null } }>): string | null {
  const nonRest = sessions.find((s) => s.target.type !== 'rest');
  if (!nonRest) return null;
  const t = nonRest.target;
  return (t.label as string | undefined) ?? t.type;
}

/**
 * Build a human-readable "actual" summary from session compliance data.
 */
function actualSummary(sessions: Array<{ flag: string; actualKm?: number; actualMins?: number; actualPaceSpk?: number; message: string }>): string | null {
  const active = sessions.filter((s) => s.flag !== 'ok' || s.actualKm !== undefined || s.actualMins !== undefined);
  if (active.length === 0) {
    // Check if any flag is not 'ok' and not 'rest'
    const anyRecorded = sessions.some((s) => s.actualKm !== undefined || s.actualMins !== undefined);
    if (!anyRecorded) return null;
  }
  // Return first meaningful message
  const best = sessions.find((s) => s.actualKm !== undefined || s.actualMins !== undefined);
  if (best) {
    if (best.actualKm !== undefined) return `${best.actualKm.toFixed(1)} km`;
    if (best.actualMins !== undefined) return `${best.actualMins.toFixed(0)} min`;
  }
  const flagged = sessions.find((s) => s.flag !== 'ok');
  return flagged ? flagged.message : null;
}

/**
 * Compute the next occurrence of `chosenDow` (Mon=0..Sun=6) strictly after
 * `today`, in UTC. If today IS chosenDow, the next occurrence is +7 days.
 */
function nextOccurrenceAfterToday(today: Date, chosenDow: number): string {
  const todayIso = today.toISOString().slice(0, 10);
  const todayDow = utcDow(todayIso);
  // Days until next occurrence (always 1–7)
  const daysUntil = ((chosenDow - todayDow + 7) % 7) || 7;
  return addUtcDays(todayIso, daysUntil);
}

/**
 * Builds a WeeklyReport from a WeekCompliance object.
 *
 * @param weekCompliance     - The output of `evaluateWeek` for the target week.
 * @param weekStart          - ISO date of Monday (the week start).
 * @param volumeTargetKm     - Target weekly km from the plan template.
 * @param longRunTargetKm    - Target long-run km; used to evaluate `longRunCompliant`.
 * @param phase              - Human-readable plan phase label.
 * @param today              - Current date (used for generatedAt and nextReportDate).
 * @param chosenDow          - User-selected report day (Mon=0..Sun=6).
 */
export function buildWeeklyReport(
  weekCompliance: WeekCompliance,
  weekStart: string,
  volumeTargetKm: number,
  longRunTargetKm: number,
  phase: string,
  today: Date,
  chosenDow: number,
): WeeklyReport {
  const weekEnd = addUtcDays(weekStart, 6);
  const generatedAt = today.toISOString();

  // Build DayReport array: derive each day's ISO date from weekStart + dow.
  const days: DayReport[] = weekCompliance.days.map((day) => {
    // day.dow is Mon=0..Sun=6; weekStart is always a Monday.
    const date = addUtcDays(weekStart, day.dow);
    const status = rollUpDayStatus(day.sessions);
    const prescribed = prescribedLabel(day.sessions);
    const actual = actualSummary(day.sessions);
    return { date, prescribed, actual, status };
  });

  // Overall compliance roll-up.
  let overallCompliance: 'green' | 'amber' | 'red';
  if (days.length === 0) {
    overallCompliance = 'green';
  } else {
    const anyMissed = days.some((d) => d.status === 'missed');
    const allCompliantOrRest = days.every(
      (d) => d.status === 'compliant' || d.status === 'rest',
    );
    if (anyMissed) {
      overallCompliance = 'red';
    } else if (allCompliantOrRest) {
      overallCompliance = 'green';
    } else {
      overallCompliance = 'amber';
    }
  }

  const volumeKm = weekCompliance.totalKmActual;
  const longRunCompliant = weekCompliance.longRunKmActual >= longRunTargetKm;
  const nextReportDate = nextOccurrenceAfterToday(today, chosenDow);

  return {
    weekStart,
    weekEnd,
    generatedAt,
    phase,
    overallCompliance,
    days,
    volumeKm,
    volumeTargetKm,
    longRunCompliant,
    nextReportDate,
  };
}
