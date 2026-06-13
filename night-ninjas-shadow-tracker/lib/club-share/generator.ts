/**
 * Pure schedule generator.
 *
 * Takes the inputs (parkrun ID, window option, week templates, activities,
 * goal race, generation timestamp) and produces a ClubSchedulePayload.
 * No I/O, no database access - all of that lives in the server action
 * that calls this.
 *
 * Pure = testable. The vitest file exercises the windowing logic,
 * the completed-session strip, the pace-stripping, and the stale-after
 * calculation against known fixtures.
 */

import type {
  ClubSchedulePayload,
  SharedSession,
  SharedSessionType,
  SharedWindow,
  ClubWindowOption,
} from './types';
import { SCHEDULE_SCHEMA_VERSION } from './types';
import type { WeekTemplate, SessionType, Dow } from '@/lib/plans/types';

const DAY_LABELS: SharedSession['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Map internal SessionType to the externally-published SharedSessionType.
 *
 * "interval" and "repetition" collapse to "intervals" - the internal
 * distinction (VO2max vs neuromuscular focus) is coaching detail that
 * doesn't belong in a public schedule.
 */
function mapSessionType(internal: SessionType): SharedSessionType {
  switch (internal) {
    case 'interval':
    case 'repetition':
      return 'intervals';
    case 'easy':
    case 'long':
    case 'tempo':
    case 'recovery':
    case 'cross':
    case 'strength':
    case 'rest':
      return internal;
  }
}

/**
 * Strip pace-revealing content from notes.
 *
 * Internal session labels look like "Tue tempo @ MP" or "6x800m @ R-pace".
 * We strip the pace component since it leaks fitness signal. What remains
 * is the bare session description.
 *
 * Patterns stripped:
 *   "@ MP", "@ T", "@ R", "@ I", "@ R-pace" etc - everything after @
 *   Specific paces like "(4:15/km)" or "[5:30/km]"
 *   HR zone references like "Z3", "zone 4"
 */
function sanitiseNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  let cleaned = note;
  // Strip "@ pace-zone" patterns
  cleaned = cleaned.replace(/\s*@\s*\S+/g, '');
  // Strip specific paces in brackets or parens
  cleaned = cleaned.replace(/[\(\[]\s*\d+:\d+\s*\/?\s*km\s*[\)\]]/g, '');
  // Strip HR zone references
  cleaned = cleaned.replace(/\s*Z[1-5]\b/gi, '');
  cleaned = cleaned.replace(/\s*zone\s*[1-5]\b/gi, '');
  cleaned = cleaned.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Compute ISO date 'YYYY-MM-DD' for the given week-Monday + day-of-week.
 * dow is 0..6 (Mon..Sun in the internal model).
 */
function dateForDow(weekStartIso: string, dow: number): string {
  const d = new Date(weekStartIso + 'T00:00:00');
  d.setDate(d.getDate() + dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a single DayPlan into the public-facing SharedSession array.
 * One DayPlan can contain multiple sessions (e.g. easy + strength on the
 * same day); each becomes its own SharedSession row.
 */
function dayPlanToSharedSessions(
  weekStartIso: string,
  dow: Dow,
  sessions: WeekTemplate['days'][number]['sessions']
): SharedSession[] {
  if (sessions.length === 0) return [];
  const date = dateForDow(weekStartIso, dow);
  const day = DAY_LABELS[dow];
  return sessions.map((session) => {
    const out: SharedSession = {
      date,
      day,
      type: mapSessionType(session.type),
    };
    if (session.distanceKmMin !== undefined) {
      const mid =
        session.distanceKmMax !== undefined
          ? Math.round(((session.distanceKmMin + session.distanceKmMax) / 2) * 10) / 10
          : session.distanceKmMin;
      out.distance_km = mid;
    }
    if (session.durationMinMin !== undefined) {
      const midDur =
        session.durationMinMax !== undefined
          ? Math.round((session.durationMinMin + session.durationMinMax) / 2)
          : session.durationMinMin;
      out.duration_min = midDur;
    }
    const cleanedNotes = sanitiseNote(session.notes ?? session.label);
    if (cleanedNotes) out.notes = cleanedNotes;
    return out;
  });
}

/**
 * Input to the pure generator.
 */
export interface GenerateInput {
  parkrunId: string;
  windowOption: ClubWindowOption;
  /**
   * Sequence of weeks to include, oldest first. Each entry has the
   * Monday-anchored date and the rendered template for that week.
   * Caller is responsible for pre-resolving these.
   */
  weeks: { weekStartIso: string; template: WeekTemplate }[];
  /** ISO date for "today" - used to strip completed sessions */
  todayIso: string;
  /**
   * Set of date+dow pairs for sessions that the compliance evaluator
   * marked as 'ok' or 'soft' (=hit or partial). Stripped from output.
   *
   * Key format: "YYYY-MM-DD:N" where N is the dow.
   */
  completedSessionKeys: Set<string>;
  /**
   * ISO date+dow pairs that have ANY logged activity. Used for today's
   * session: if today has activity, today's planned session is stripped
   * (assumes athlete already ran).
   */
  dayHasActivity: Set<string>;
  generatedAt: Date;
  /** Optional - reason athlete extended window */
  extensionReason?: string;
}

/**
 * Compute the stale-after date: 5 days from generation.
 */
function staleAfterIso(generatedAt: Date): string {
  const d = new Date(generatedAt);
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

/**
 * The main pure generator. Returns the JSON-serialisable payload.
 */
export function generateSchedulePayload(input: GenerateInput): ClubSchedulePayload {
  const { parkrunId, windowOption, weeks, todayIso, completedSessionKeys, dayHasActivity, generatedAt, extensionReason } = input;

  if (weeks.length === 0) {
    throw new Error('Cannot generate schedule with empty weeks list');
  }

  const startIso = weeks[0].weekStartIso;
  const lastWeek = weeks[weeks.length - 1];
  // weekStart is Monday; end is Sunday = +6 days
  const endDate = new Date(lastWeek.weekStartIso + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const endIso = endDate.toISOString().slice(0, 10);

  const window: SharedWindow = {
    start_iso: startIso,
    end_iso: endIso,
    option: windowOption,
    weeks: weeks.length,
    stale_after_iso: staleAfterIso(generatedAt),
    ...(extensionReason ? { extension_reason: extensionReason } : {}),
  };

  const schedule: SharedSession[] = [];

  for (const week of weeks) {
    for (const day of week.template.days) {
      const date = dateForDow(week.weekStartIso, day.dow);

      // Strip past completed sessions
      const completedKey = `${date}:${day.dow}`;
      if (completedSessionKeys.has(completedKey)) continue;

      // For today: strip if any activity is already logged
      if (date === todayIso && dayHasActivity.has(date)) continue;

      // Past days with no activity: also strip - they're stale, not pending
      if (date < todayIso) continue;

      const sharedSessions = dayPlanToSharedSessions(week.weekStartIso, day.dow, day.sessions);
      for (const s of sharedSessions) {
        // Suppress 'rest' entries since they aren't actionable to club app viewers
        if (s.type === 'rest') continue;
        schedule.push(s);
      }
    }
  }

  // Sort by date ascending - the order weeks contributed should already
  // be correct, but be explicit since downstream consumers expect it.
  schedule.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    version: SCHEDULE_SCHEMA_VERSION,
    parkrun_id: parkrunId,
    generated_at: generatedAt.toISOString(),
    window,
    schedule,
  };
}

/**
 * Build the canonical filename for the share file. Self-describing -
 * parkrun ID and window-starting date make it easy for the consumer to
 * route by filename if needed.
 */
export function buildShareFilename(parkrunId: string, windowStartIso: string): string {
  // Sanitise parkrun ID to filename-safe characters
  const safe = parkrunId.replace(/[^A-Za-z0-9_-]/g, '');
  return `velocity-schedule-${safe}-${windowStartIso}.json`;
}
