import type { WeekEvent } from '@/lib/plans/types';

/**
 * Per-day calendar event entry, condensed for matrix cell display.
 * Each day with one or more events gets a list of these entries; days
 * with no events get null.
 *
 * Trimmed to the fields the matrix cell renderer needs - the full
 * WeekEvent shape is preserved server-side for any consumer that needs
 * impact level or full date ranges.
 */
export interface DayEvent {
  /** Original event type, drives icon selection. */
  type: 'sickness' | 'holiday' | 'work-trip' | 'other';
  /** Optional notes / event title - shown in the hover-card. */
  notes?: string;
  /** Inclusive ISO start - used by hover-card to display range. */
  startDate: string;
  /** Inclusive ISO end - same source. */
  endDate: string;
}

/**
 * Distribute a week's events into a 7-slot array indexed Mon..Sun.
 *
 * Multi-day events (e.g. a week-long holiday, a 3-day work trip) appear
 * on EVERY day of their span that falls inside the week. So a Tuesday-
 * Friday work trip appears on slots 1, 2, 3, 4 - giving the matrix row
 * a visible streak of icons that conveys the shape of the interruption
 * at a glance.
 *
 * Day-of-week math: weekStartIso is the Monday. We iterate through
 * each event's startDate -> endDate range (inclusive on both ends),
 * filter to dates within the week, and add an entry to the matching
 * dow slot.
 */
export function distributeEventsByDay(
  events: WeekEvent[],
  weekStartIso: string
): (DayEvent[] | null)[] {
  const slots: (DayEvent[] | null)[] = [null, null, null, null, null, null, null];

  const weekStart = new Date(weekStartIso + 'T00:00:00');
  const weekStartMs = weekStart.getTime();
  const dayMs = 86_400_000;

  for (const event of events) {
    const eventStart = new Date(event.startDate + 'T00:00:00');
    const eventEnd = new Date(event.endDate + 'T00:00:00');

    // Walk every day in the event's range
    for (let cursor = eventStart.getTime(); cursor <= eventEnd.getTime(); cursor += dayMs) {
      const offsetDays = Math.round((cursor - weekStartMs) / dayMs);
      if (offsetDays < 0 || offsetDays > 6) continue;

      const entry: DayEvent = {
        type: event.type,
        notes: event.notes,
        startDate: event.startDate,
        endDate: event.endDate,
      };

      if (slots[offsetDays] === null) slots[offsetDays] = [];
      slots[offsetDays]!.push(entry);
    }
  }

  return slots;
}
