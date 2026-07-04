import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Pete Pfitzinger — Advanced Marathoning.
 *
 * Signature elements:
 *   1. Long runs INCLUDE marathon-pace segments (e.g. 28K with 16K @ MP)
 *   2. Tune-up races are explicitly scheduled
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Long runs that include race-pace work. Built for runners who want to feel marathon pace under fatigue. Notable for explicitly scheduling tune-up races as part of the build.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 80, 120),
    easy:       offset(mp, 45, 85),
    long:       offset(mp, 25, 65),
    marathon:   band(mp, 4),
    threshold:  band(mp - 10, 6),
    interval:   band(mp - 32, 8),
    repetition: band(mp - 50, 10),
  };
}

const PFITZ_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 21, factor: 0.85 },
      { withinDays: 14, factor: 0.7 },
      { withinDays: 7, factor: 0.55 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: { reducedFactor: 0.55, travelOnlyFactor: 0.3, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 2, recoveryDays: 2 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 95;
  const longCap = params.longRunCapKm ?? 35;

  const phaseName = (() => {
    if (weekNumber <= 5) return 'Endurance';
    if (weekNumber <= 10) return 'Lactate Threshold';
    if (weekNumber <= programWeeks - 3) return 'Race Prep';
    return 'Taper';
  })();

  const isQuality = phaseName === 'Lactate Threshold' || phaseName === 'Race Prep';

  const longRunSession = phaseName === 'Race Prep' && weekNumber % 3 === 0
    ? { label: 'Long run with MP segment', type: 'long' as const, paceZone: zones.marathon, distanceKmMin: longCap * 0.85, distanceKmMax: longCap }
    : { label: 'Long run', type: 'long' as const, paceZone: zones.long, distanceKmMin: longCap * 0.75, distanceKmMax: longCap };

  const days: DayPlan[] = [
    { dow: 0, sessions: [{ label: 'Recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 5, distanceKmMax: 8 }] },
    {
      dow: 1,
      sessions: [
        isQuality
          ? { label: 'Lactate threshold', type: 'tempo', paceZone: zones.threshold, distanceKmMin: 12, distanceKmMax: 16 }
          : { label: 'General aerobic', type: 'easy', paceZone: zones.easy, distanceKmMin: 12, distanceKmMax: 15 },
      ],
    },
    { dow: 2, sessions: [{ label: 'Recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 8, distanceKmMax: 10 }] },
    { dow: 3, sessions: [{ label: 'Medium-long run', type: 'easy', paceZone: zones.easy, distanceKmMin: 16, distanceKmMax: 20 }] },
    { dow: 4, sessions: [{ label: 'Rest', type: 'rest' }] },
    { dow: 5, sessions: [{ label: 'General aerobic + strides', type: 'easy', paceZone: zones.easy, distanceKmMin: 10, distanceKmMax: 14 }] },
    { dow: 6, sessions: [longRunSession] },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days,
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, PFITZ_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 30;
    case 'intermediate': return 50;
    case 'advanced':     return 70;
  }
}

export const pfitzinger: PlanEngine = {
  dojo: 'pfitzinger',
  stateProfile: {
    tsbFloor: { base: -18, build: -25, peak: -25, taper: -8 },
    protectedTypes: ['tempo', 'long'],
    preferIntensityCut: false,
  },
  displayName: 'Pfitzinger Advanced Marathoning',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 35,
  status: 'scaffold',
  calendarConfig: PFITZ_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
