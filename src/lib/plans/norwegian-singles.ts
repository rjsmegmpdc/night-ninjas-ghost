import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Norwegian Singles (Sub-threshold).
 *
 * Three quality sessions per week at sub-threshold (zone 2/3 ceiling).
 * All quality is single-session — no doubles. 22% of weekly volume is
 * quality (QUALITY_FRACTION locked spec).
 *
 * 3-week rotation of sub-threshold shapes:
 *   Week 1: short reps (4x6 min)
 *   Week 2: medium reps (3x8 min)
 *   Week 3: long reps (2x12 min)
 * -------------------------------------------------------------------------- */

const QUALITY_FRACTION = 0.22;

const PHILOSOPHY =
  'Three sub-threshold sessions per week, run as singles. Quality stays at or below the ventilatory threshold — never red-lining. Volume is polarised around these three sessions. 22% quality cap is non-negotiable.';

const SUBT_SHAPES = [
  { reps: 4, repMin: 6,  label: 'Short reps (4 × 6 min sub-T)' },
  { reps: 3, repMin: 8,  label: 'Medium reps (3 × 8 min sub-T)' },
  { reps: 2, repMin: 12, label: 'Long reps (2 × 12 min sub-T)' },
] as const;

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 90, 130),
    easy:       offset(mp, 60, 100),
    long:       offset(mp, 45, 85),
    marathon:   band(mp, 6),
    threshold:  band(mp - 8, 6),
    interval:   band(mp - 28, 8),
    repetition: band(mp - 48, 10),
  };
}

const NS_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [{ withinDays: 14, factor: 0.85 }, { withinDays: 7, factor: 0.65 }],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: { reducedFactor: 0.55, travelOnlyFactor: 0.35, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 2, recoveryDays: 1 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 70;
  const longCap = params.longRunCapKm ?? 28;

  const phaseName = weekNumber > programWeeks - 3 ? 'Taper' : 'Sub-threshold build';

  const rotIndex = (weekNumber - 1) % 3;
  const shape = SUBT_SHAPES[rotIndex];

  const qualityKm = Math.round(cap * QUALITY_FRACTION);

  const subTSession = {
    label: shape.label,
    type: 'tempo' as const,
    paceZone: zones.threshold,
    distanceKmMin: qualityKm * 0.3,
    distanceKmMax: qualityKm * 0.4,
    notes: `${shape.reps} × ${shape.repMin} min at sub-threshold. HR ceiling ~VT1 + 5 bpm. Short recoveries.`,
  };

  const days: DayPlan[] = [
    { dow: 0, sessions: [{ label: 'Easy aerobic', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }] },
    { dow: 1, sessions: [subTSession] },
    { dow: 2, sessions: [{ label: 'Easy / recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 6, distanceKmMax: 10 }] },
    { dow: 3, sessions: [subTSession] },
    { dow: 4, sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }] },
    { dow: 5, sessions: [subTSession] },
    {
      dow: 6,
      sessions: [{ label: 'Long run', type: 'long', paceZone: zones.long, distanceKmMin: longCap * 0.75, distanceKmMax: longCap }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days,
    notes: `Rotation ${rotIndex + 1}/3: ${shape.label}. Quality cap = ${Math.round(QUALITY_FRACTION * 100)}% of weekly volume.`,
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, NS_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 25;
    case 'intermediate': return 40;
    case 'advanced':     return 55;
  }
}

export const norwegianSingles: PlanEngine = {
  dojo: 'norwegian-singles',
  stateProfile: {
    tsbFloor: { base: -15, build: -20, peak: -20, taper: -6 },
    protectedTypes: ['tempo'],
    preferIntensityCut: false,
  },
  displayName: 'Norwegian Singles (Sub-threshold)',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 28,
  status: 'scaffold',
  calendarConfig: NS_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
