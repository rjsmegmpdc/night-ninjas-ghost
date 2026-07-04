import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Custom plan — repeating default week, fully user-defined.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'You define the structure. Each week repeats your configured default week. Use this if you follow a coach\'s plan or prefer to control the layout yourself.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 80, 120),
    easy:       offset(mp, 45, 80),
    long:       offset(mp, 30, 70),
    marathon:   band(mp, 6),
    threshold:  band(mp - 10, 8),
    interval:   band(mp - 30, 10),
    repetition: band(mp - 50, 12),
  };
}

const CUSTOM_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [{ withinDays: 14, factor: 0.85 }, { withinDays: 7, factor: 0.65 }],
    raceWeekStyle: 'two-day-rest',
  },
  volumeScale: { reducedFactor: 0.5, travelOnlyFactor: 0.3, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 1, recoveryDays: 1 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const cap = params.weeklyVolumeCapKm ?? 50;
  const longCap = params.longRunCapKm ?? 25;

  const raw: WeekTemplate = {
    weekNumber,
    phaseName: 'Custom',
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days: [
      { dow: 0, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 5, distanceKmMax: 10 }] },
      { dow: 1, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }] },
      { dow: 2, sessions: [{ label: 'Rest', type: 'rest' }] },
      { dow: 3, sessions: [{ label: 'Quality workout', type: 'tempo', paceZone: zones.threshold, distanceKmMin: 8, distanceKmMax: 14 }] },
      { dow: 4, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
      { dow: 5, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
      { dow: 6, sessions: [{ label: 'Long run', type: 'long', paceZone: zones.long, distanceKmMin: longCap * 0.8, distanceKmMax: longCap }] },
    ],
    notes: 'Custom plan: repeating default week. Adjust sessions in your plan settings.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, CUSTOM_CALENDAR);
}

function entryWeeklyLoadKm(_level: 'beginner' | 'intermediate' | 'advanced'): number {
  return 0;
}

export const custom: PlanEngine = {
  dojo: 'custom',
  displayName: 'Custom',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 16,
  defaultLongRunCapKm: 25,
  status: 'full',
  calendarConfig: CUSTOM_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
