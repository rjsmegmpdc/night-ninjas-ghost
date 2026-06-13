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
 * Jack Daniels — VDOT-driven training.
 *
 * Daniels' system reduces every workout to a pace zone derived from your
 * VDOT (a stand-in for VO2max). Five session types: E (easy), M (marathon),
 * T (threshold), I (interval), R (repetition). The plan is structured
 * around weekly sessions of T and I work, with E filling the rest.
 *
 * Currently SCAFFOLD — the pace zones and weekly structure are correct,
 * but the per-week-number progression follows a generic build pattern
 * rather than Daniels' specific 18/24-week marathon programs.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Pace zones derived from your VDOT — a single number that translates current fitness into prescribed paces for every workout type. Quality means quality at the right pace, not as fast as possible.';

function paceZones(params: PlanParams): PaceZones {
  // Daniels: T (threshold) is faster than Hansons' tempo (which is at MP).
  // Threshold ≈ pace you could hold for an hour all-out.
  const mp = marathonPaceSpk(params);
  return {
    recovery: offset(mp, 80, 120),
    easy: offset(mp, 45, 80),    // E pace
    long: offset(mp, 30, 70),
    marathon: band(mp, 5),       // M pace
    threshold: band(mp - 12, 6), // T pace, ~12 sec/km faster than MP
    interval: band(mp - 35, 8),  // I pace, ~3K-5K race
    repetition: band(mp - 55, 10), // R pace, neuromuscular
  };
}

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 80;
  const longCap = params.longRunCapKm ?? 32;

  // Phase rough-cut: first half is base, second half is quality
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
    ? {
        dow: 1,
        sessions: [{
          label: 'T pace cruise intervals',
          type: 'tempo',
          paceZone: zones.threshold,
          distanceKmMin: 8,
          distanceKmMax: 12,
        }],
      }
    : { ...easy, dow: 1 };

  const thuQuality: DayPlan = inQualityPhase
    ? {
        dow: 3,
        sessions: [{
          label: 'I pace intervals',
          type: 'interval',
          paceZone: zones.interval,
          distanceKmMin: 6,
          distanceKmMax: 9,
        }],
      }
    : { ...easy, dow: 3 };

  const days: DayPlan[] = [
    easy,
    tueQuality,
    { dow: 2, sessions: [{ label: 'E pace', type: 'easy', paceZone: zones.easy, distanceKmMin: 6, distanceKmMax: 10 }] },
    thuQuality,
    recovery,
    { dow: 5, sessions: [{ label: 'E pace + strides', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }] },
    {
      dow: 6,
      sessions: [{
        label: 'Long run with M pace section',
        type: 'long',
        paceZone: zones.long,
        distanceKmMin: longCap * 0.7,
        distanceKmMax: longCap,
      }],
    },
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

const DANIELS_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 14, factor: 0.85 },
      { withinDays: 7, factor: 0.65 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: {
    reducedFactor: 0.55,
    travelOnlyFactor: 0.3,
    noTrainingZeroesOut: true,
  },
  tuneups: {
    enabled: true,
    taperDays: 2,
    recoveryDays: 1,
  },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};


/**
 * Entry weekly load: Daniels assumes mileage matches goal pace zones; tables in Running Formula Ch.13.
 */
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
    // VDOT dosing assumes recovery between quality - moderate floors.
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
