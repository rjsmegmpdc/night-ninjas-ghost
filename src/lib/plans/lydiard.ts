import type {
  PaceZones, PlanEngine, PlanParams, WeekTemplate, WeekContext, CalendarConfig, DayPlan, SessionTarget,
} from './types';
import { band, marathonPaceSpk, offset } from './derive';
import { applyStructuredCalendar } from './calendar-blocks';

/* ----------------------------------------------------------------------------
 * Arthur Lydiard Method.
 *
 * Periodised aerobic-base focus. Phases:
 *   1. Marathon Conditioning — high-volume aerobic, weeks 1–10
 *   2. Hill Resistance — 4 weeks of hill bounding/springing
 *   3. Anaerobic — 4 weeks of intervals/repetitions
 *   4. Coordination — 2-week sharpening with race-pace work
 *   5. Taper — final 2 weeks
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Periodised. 10 weeks of high-volume aerobic conditioning, then 4 weeks of hill resistance, 4 weeks of anaerobic work, 2 weeks of coordination, 2-week taper. Long Sunday runs (25–35 km) are non-negotiable. Most days are effort-based (aerobic ceiling), not pace-prescribed.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery:   offset(mp, 100, 150),
    easy:       offset(mp, 60, 110),
    long:       offset(mp, 60, 100),
    marathon:   band(mp, 5),
    threshold:  band(mp - 12, 8),
    interval:   band(mp - 35, 10),
    repetition: band(mp - 55, 12),
  };
}

function getPhase(weekNumber: number, programWeeks: number): {
  name: string; isAerobic: boolean; isHill: boolean; isAnaerobic: boolean; isCoordination: boolean; isTaper: boolean;
} {
  const aerobicEnd = Math.floor(programWeeks * 0.5);
  const hillEnd = aerobicEnd + Math.floor(programWeeks * 0.18);
  const anaerobicEnd = hillEnd + Math.floor(programWeeks * 0.18);
  const coordEnd = programWeeks - 2;

  if (weekNumber > coordEnd) return mkPhase('Taper', { isTaper: true });
  if (weekNumber > anaerobicEnd) return mkPhase('Coordination', { isCoordination: true });
  if (weekNumber > hillEnd) return mkPhase('Anaerobic', { isAnaerobic: true });
  if (weekNumber > aerobicEnd) return mkPhase('Hill Resistance', { isHill: true });
  return mkPhase('Marathon Conditioning', { isAerobic: true });
}

function mkPhase(name: string, flags: Partial<ReturnType<typeof getPhase>>) {
  return { name, isAerobic: false, isHill: false, isAnaerobic: false, isCoordination: false, isTaper: false, ...flags };
}

const LYDIARD_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 21, factor: 0.85 },
      { withinDays: 14, factor: 0.7 },
      { withinDays: 7, factor: 0.55 },
    ],
    raceWeekStyle: 'lydiard-fast-finish',
  },
  volumeScale: { reducedFactor: 0.6, travelOnlyFactor: 0.4, noTrainingZeroesOut: true },
  tuneups: { enabled: true, taperDays: 1, recoveryDays: 2 },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 24;
  const ph = getPhase(weekNumber, programWeeks);

  const cap = params.weeklyVolumeCapKm ?? 130;
  const baseKm = ph.isAerobic ? cap * 0.95 : ph.isTaper ? cap * 0.5 : cap * 0.75;
  const longCap = params.longRunCapKm ?? 35;

  const easy: SessionTarget = {
    label: ph.isAerobic ? 'Aerobic conditioning run' : 'Easy run',
    type: 'easy',
    paceZone: zones.easy,
    distanceKmMin: 8,
    distanceKmMax: 16,
  };

  const days: DayPlan[] = [
    { dow: 0, sessions: [easy] },
    { dow: 1, sessions: [easy] },
    {
      dow: 2,
      sessions: [
        ph.isAerobic
          ? easy
          : {
              label: ph.isAnaerobic ? 'Intervals' : 'Quality work',
              type: ph.isAnaerobic ? 'interval' : 'tempo',
              paceZone: ph.isAnaerobic ? zones.interval : zones.threshold,
            },
      ],
    },
    { dow: 3, sessions: [easy] },
    { dow: 4, sessions: [{ ...easy, label: 'Recovery', paceZone: zones.recovery }] },
    {
      dow: 5,
      sessions: [
        ph.isAerobic
          ? easy
          : {
              label: ph.isHill ? 'Hill resistance' : 'Time trial',
              type: ph.isHill ? 'repetition' : 'tempo',
              paceZone: ph.isHill ? zones.repetition : zones.threshold,
              notes: ph.isHill ? 'Hill bounding/springing for ~45 min on rolling terrain.' : '',
            },
      ],
    },
    {
      dow: 6,
      sessions: [{
        label: 'Long run', type: 'long', paceZone: zones.long,
        distanceKmMin: longCap * 0.7, distanceKmMax: longCap,
      }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName: ph.name,
    totalKmTarget: Math.round(baseKm),
    longRunKmTarget: longCap,
    days,
    notes: ph.isAerobic ? 'Aerobic phase: stay relaxed, run by effort. Do not push pace.' : undefined,
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, LYDIARD_CALENDAR);
}

function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 35;
    case 'intermediate': return 50;
    case 'advanced':     return 65;
  }
}

export const lydiard: PlanEngine = {
  dojo: 'lydiard',
  stateProfile: {
    tsbFloor: { base: -25, build: -20, peak: -18, taper: -8 },
    protectedTypes: ['long'],
    preferIntensityCut: true,
  },
  displayName: 'Arthur Lydiard Method',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 24,
  defaultLongRunCapKm: 35,
  status: 'scaffold',
  calendarConfig: LYDIARD_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
