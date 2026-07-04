import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Jack Daniels — VDOT-driven training.
 *
 * Five session types: E (easy), M (marathon), T (threshold), I (interval),
 * R (repetition). Plan structured around T and I work, with E filling rest.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Pace zones derived from your VDOT — a single number that translates current fitness into prescribed paces for every workout type. Quality means quality at the right pace, not as fast as possible.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 80, 120),
    easy:       offset(mp, 45, 80),
    long:       offset(mp, 30, 70),
    marathon:   band(mp, 5),
    threshold:  band(mp - 12, 6),
    interval:   band(mp - 35, 8),
    repetition: band(mp - 55, 10),
  };
}

const DANIELS_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [{ withinDays: 14, factor: 0.85 }, { withinDays: 7, factor: 0.65 }],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: { reducedFactor: 0.55, travelOnlyFactor: 0.3, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 2, recoveryDays: 1 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 80;
  const longCap = params.longRunCapKm ?? 32;

  const inQualityPhase = weekNumber > programWeeks / 2;
  const phaseName = inQualityPhase ? 'Quality' : 'Base';

  const easy: DayPlan = {
    dow: 0,
    sessions: [{ label: 'E pace', type: 'easy', paceZone: zones.easy, distanceKmMin: 6, distanceKmMax: 10 }],
  };

  const recovery: DayPlan = {
    dow: 4,
    sessions: [{ label: 'Recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 4, distanceKmMax: 7 }],
  };

  const tueQuality: DayPlan = inQualityPhase
    ? { dow: 1, sessions: [{ label: 'T pace cruise intervals', type: 'tempo', paceZone: zones.threshold, distanceKmMin: 8, distanceKmMax: 12 }] }
    : { ...easy, dow: 1 };

  const thuQuality: DayPlan = inQualityPhase
    ? { dow: 3, sessions: [{ label: 'I pace intervals', type: 'interval', paceZone: zones.interval, distanceKmMin: 6, distanceKmMax: 9 }] }
    : { ...easy, dow: 3 };

  const days: DayPlan[] = [
    easy,
    tueQuality,
    { dow: 2, sessions: [{ label: 'E pace', type: 'easy', paceZone: zones.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
    thuQuality,
    recovery,
    { dow: 5, sessions: [{ label: 'E pace + strides', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }] },
    { dow: 6, sessions: [{ label: 'Long run with M pace section', type: 'long', paceZone: zones.long, distanceKmMin: longCap * 0.7, distanceKmMax: longCap }] },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days,
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, DANIELS_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 30;
    case 'intermediate': return 45;
    case 'advanced':     return 60;
  }
}

export const daniels: PlanEngine = {
  dojo: 'daniels',
  stateProfile: {
    tsbFloor: { base: -15, build: -22, peak: -22, taper: -8 },
    protectedTypes: ['tempo'],
    preferIntensityCut: false,
  },
  displayName: 'Daniels Running Formula',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 32,
  status: 'scaffold',
  calendarConfig: DANIELS_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
