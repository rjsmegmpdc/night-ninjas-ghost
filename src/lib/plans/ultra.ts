import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Ultra Marathon.
 *
 * Back-to-back long runs Saturday + Sunday are the signature element.
 * Hike/walk intervals are prescribed for vertical gain days.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Back-to-back long runs (Saturday + Sunday) condition you for running on tired legs. Elevation gain is a first-class metric. Walk breaks are prescribed, not optional.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 100, 160),
    easy:       offset(mp, 70, 120),
    long:       offset(mp, 60, 120),
    marathon:   band(mp, 8),
    threshold:  band(mp - 10, 8),
    interval:   band(mp - 30, 10),
    repetition: band(mp - 50, 12),
  };
}

const ULTRA_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 28, factor: 0.85 },
      { withinDays: 14, factor: 0.65 },
      { withinDays: 7, factor: 0.5 },
    ],
    raceWeekStyle: 'two-day-rest',
  },
  volumeScale: { reducedFactor: 0.6, travelOnlyFactor: 0.4, noTrainingZeroesOut: true },
  tuneups: { enabled: false, taperDays: 1, recoveryDays: 3 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 24;
  const cap = params.weeklyVolumeCapKm ?? 90;
  const longCap = params.longRunCapKm ?? 50;

  const phaseName = (() => {
    if (weekNumber > programWeeks - 4) return 'Taper';
    if (weekNumber > programWeeks * 0.6) return 'Peak';
    return 'Build';
  })();

  const satKm = phaseName === 'Taper' ? longCap * 0.5 : longCap * 0.7;
  const sunKm = phaseName === 'Taper' ? longCap * 0.35 : longCap * 0.5;

  const days: DayPlan[] = [
    { dow: 0, sessions: [{ label: 'Recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 5, distanceKmMax: 10 }] },
    { dow: 1, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 10, distanceKmMax: 16 }] },
    { dow: 2, sessions: [{ label: 'Rest', type: 'rest' }] },
    { dow: 3, sessions: [{ label: 'Trail run / hike run', type: 'easy', paceZone: zones.easy, distanceKmMin: 10, distanceKmMax: 18, notes: 'Include hill repeats if available.' }] },
    { dow: 4, sessions: [{ label: 'Easy run', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 14 }] },
    {
      dow: 5,
      sessions: [{ label: 'Back-to-back day 1 (long)', type: 'long', paceZone: zones.long, distanceKmMin: satKm * 0.85, distanceKmMax: satKm, notes: 'Simulate race terrain where possible.' }],
    },
    {
      dow: 6,
      sessions: [{ label: 'Back-to-back day 2 (tired legs)', type: 'long', paceZone: zones.long, distanceKmMin: sunKm * 0.85, distanceKmMax: sunKm, notes: 'Run on fatigued legs. Time-on-feet matters more than pace.' }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: cap,
    longRunKmTarget: satKm + sunKm,
    days,
    notes: 'Walk breaks are part of the plan — especially on uphills. Do not ego-run.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, ULTRA_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 40;
    case 'intermediate': return 60;
    case 'advanced':     return 75;
  }
}

export const ultra: PlanEngine = {
  dojo: 'ultra',
  stateProfile: {
    tsbFloor: { base: -20, build: -25, peak: -25, taper: -8 },
    protectedTypes: ['long'],
    preferIntensityCut: true,
  },
  displayName: 'Ultra / Trail',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 24,
  defaultLongRunCapKm: 50,
  status: 'stub',
  calendarConfig: ULTRA_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
