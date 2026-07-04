import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Hal Higdon — accessible structured plans for first-time and intermediate
 * marathoners. Maps level to Higdon's published variants.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Accessible plans built around weekly long runs and gentle progression. The most-used marathon training plan worldwide. Three levels — Novice, Intermediate, Advanced — selected automatically from your level setting.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 90, 130),
    easy:       offset(mp, 50, 90),
    long:       offset(mp, 30, 70),
    marathon:   band(mp, 6),
    threshold:  band(mp - 8, 8),
    interval:   band(mp - 25, 10),
    repetition: band(mp - 45, 12),
  };
}

interface HigdonVariant {
  name: string;
  notesLevel: string;
  peakWeeklyKm: number;
  baseLongKm: number;
  longGrowthKm: number;
  longCapKm: number;
  tueLabel: string;
  tueType: 'easy' | 'tempo';
  thuLabel: string;
  thuType: 'easy' | 'tempo';
}

function higdonVariant(level?: string): HigdonVariant {
  switch (level) {
    case 'beginner':
      return {
        name: 'Novice 1', notesLevel: 'first-time marathoners',
        peakWeeklyKm: 60, baseLongKm: 10, longGrowthKm: 1.6, longCapKm: 32,
        tueLabel: 'Easy', tueType: 'easy', thuLabel: 'Easy', thuType: 'easy',
      };
    case 'advanced':
      return {
        name: 'Advanced 1', notesLevel: 'experienced',
        peakWeeklyKm: 90, baseLongKm: 14, longGrowthKm: 1.8, longCapKm: 35,
        tueLabel: 'Tempo', tueType: 'tempo', thuLabel: 'Tempo', thuType: 'tempo',
      };
    case 'intermediate':
    default:
      return {
        name: 'Intermediate 1', notesLevel: 'second-time marathoners',
        peakWeeklyKm: 75, baseLongKm: 12, longGrowthKm: 1.7, longCapKm: 32,
        tueLabel: 'Tempo', tueType: 'tempo', thuLabel: 'Easy', thuType: 'easy',
      };
  }
}

const HIGDON_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 21, factor: 0.9 },
      { withinDays: 14, factor: 0.75 },
      { withinDays: 7, factor: 0.6 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: { reducedFactor: 0.5, travelOnlyFactor: 0.3, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 1, recoveryDays: 1 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const variant = higdonVariant(params.level);

  const inDownWeek = weekNumber % 4 === 0;
  const phaseName = (() => {
    if (weekNumber > programWeeks - 3) return 'Taper';
    if (inDownWeek) return 'Recovery';
    return 'Build';
  })();

  const longBase = variant.baseLongKm + Math.min(weekNumber, programWeeks - 3) * variant.longGrowthKm;
  const longKm = inDownWeek ? longBase * 0.7 : longBase;
  const cappedLong = Math.min(longKm, params.longRunCapKm ?? variant.longCapKm);
  const totalKm = Math.min(
    variant.peakWeeklyKm * (0.6 + 0.4 * (weekNumber / programWeeks)),
    params.weeklyVolumeCapKm ?? variant.peakWeeklyKm
  );

  const days: DayPlan[] = [
    { dow: 0, sessions: [{ label: 'Cross-train', type: 'cross', durationMinMin: 30, durationMinMax: 60 }] },
    {
      dow: 1,
      sessions: [{
        label: variant.tueLabel, type: variant.tueType,
        paceZone: variant.tueType === 'tempo' ? zones.threshold : zones.easy,
        distanceKmMin: 6, distanceKmMax: 10,
      }],
    },
    { dow: 2, sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 5, distanceKmMax: 8 }] },
    {
      dow: 3,
      sessions: [{
        label: variant.thuLabel, type: variant.thuType,
        paceZone: variant.thuType === 'tempo' ? zones.threshold : zones.easy,
        distanceKmMin: 6, distanceKmMax: 10,
      }],
    },
    { dow: 4, sessions: [{ label: 'Rest', type: 'rest' }] },
    { dow: 5, sessions: [{ label: 'Pace run', type: 'easy', paceZone: zones.marathon, distanceKmMin: 4, distanceKmMax: 8 }] },
    {
      dow: 6,
      sessions: [{ label: 'Long run', type: 'long', paceZone: zones.long, distanceKmMin: cappedLong * 0.95, distanceKmMax: cappedLong }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: Math.round(totalKm),
    longRunKmTarget: Math.round(cappedLong),
    days,
    notes: `${variant.name} — Higdon's plan for ${variant.notesLevel} runners.`,
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, HIGDON_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 20;
    case 'intermediate': return 35;
    case 'advanced':     return 50;
  }
}

export const higdon: PlanEngine = {
  dojo: 'higdon',
  stateProfile: {
    tsbFloor: { base: -12, build: -15, peak: -15, taper: -5 },
    protectedTypes: ['long'],
    preferIntensityCut: false,
  },
  displayName: 'Hal Higdon (Novice/Intermediate/Advanced)',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 32,
  status: 'scaffold',
  calendarConfig: HIGDON_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
