import type {
  PaceZones,
  PlanEngine,
  PlanParams,
  WeekTemplate,
  WeekContext,
  CalendarConfig,
  DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Custom dojo.
 *
 * The user defines their own weekly structure via the wizard and edits it
 * later in /dojo. Pace zones default to a reasonable middle ground (between
 * Hansons and Lydiard); the user can adjust each band manually.
 *
 * The custom week JSON is stored on the active plan row; this engine reads
 * it back. If no customWeekJson exists yet, we render a sensible default.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Your plan, your rules. Define your own weekly session pattern, set pace zones manually, and adjust as you learn what works for your body.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery: offset(mp, 90, 130),
    easy: offset(mp, 50, 90),
    long: offset(mp, 30, 70),
    marathon: band(mp, 5),
    threshold: band(mp - 10, 7),
    interval: band(mp - 32, 9),
    repetition: band(mp - 50, 11),
  };
}

function defaultWeek(params: PlanParams): DayPlan[] {
  const z = paceZones(params);
  return [
    { dow: 0, sessions: [{ label: 'Mon easy', type: 'easy', paceZone: z.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
    { dow: 1, sessions: [{ label: 'Tue quality', type: 'tempo', paceZone: z.threshold, distanceKmMin: 8, distanceKmMax: 12 }] },
    { dow: 2, sessions: [{ label: 'Wed rest/cross', type: 'cross', durationMinMin: 30, durationMinMax: 60 }] },
    { dow: 3, sessions: [{ label: 'Thu easy', type: 'easy', paceZone: z.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
    { dow: 4, sessions: [{ label: 'Fri rest', type: 'rest' }] },
    { dow: 5, sessions: [{ label: 'Sat moderate', type: 'easy', paceZone: z.easy, distanceKmMin: 8, distanceKmMax: 14 }] },
    { dow: 6, sessions: [{ label: 'Sun long', type: 'long', paceZone: z.long, distanceKmMin: 16, distanceKmMax: 24 }] },
  ];
}

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  // For custom dojo, the same week structure repeats every week unless
  // the user has saved variations. Volume cap respects user setting.
  const cap = params.weeklyVolumeCapKm ?? 70;
  const longCap = params.longRunCapKm ?? 24;
  const zones = paceZones(params);

  const raw: WeekTemplate = {
    weekNumber,
    phaseName: 'Custom',
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days: defaultWeek(params),
    notes: 'Custom plan. Edit your weekly structure in the Dojo screen.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, CUSTOM_CALENDAR);
}

/* ----------------------------------------------------------------------------
 * Custom calendar opinion.
 *
 * Conservative defaults — small taper, gentle scaling. Eventually the
 * Dojo screen will let users edit this themselves.
 * -------------------------------------------------------------------------- */
const CUSTOM_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 7, factor: 0.7 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: {
    reducedFactor: 0.5,
    travelOnlyFactor: 0.3,
    noTrainingZeroesOut: true,
  },
  tuneups: {
    enabled: true,
    taperDays: 1,
    recoveryDays: 1,
  },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};


/**
 * Entry weekly load: Custom returns 0 - the ramp UI treats 0 as "no expected entry, no warning".
 */
function entryWeeklyLoadKm(_level: 'beginner' | 'intermediate' | 'advanced'): number {
  return 0;
}

export const custom: PlanEngine = {
  dojo: 'custom',
  stateProfile: {
    // No philosophy to honour - conservative defaults.
    tsbFloor: { base: -15, build: -20, peak: -20, taper: -5 },
    protectedTypes: ['long'],
    preferIntensityCut: false,
  },
  displayName: 'Custom',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 16,
  defaultLongRunCapKm: 24,
  status: 'full',
  calendarConfig: CUSTOM_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
