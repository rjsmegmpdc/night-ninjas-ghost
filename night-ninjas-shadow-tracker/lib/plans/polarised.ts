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
 * Polarised / 80-20.
 *
 * Stephen Seiler / Norwegian model formalised. 80% of training time at low
 * intensity (zone 1-2), 20% at high intensity (zone 4-5). Almost no
 * "moderate" zone 3 — the dreaded "junk miles".
 *
 * Currently SCAFFOLD. The 80/20 split is enforced via session selection,
 * but week-by-week progression is generic. A proper implementation would
 * need TIME-based tracking (not just distance) and per-zone time auditing.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  '80% easy, 20% hard. Almost nothing in the middle. The Norwegian model — endorsed by elites for endurance development. Best for runners who consistently push easy days too hard.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery: offset(mp, 90, 130),
    easy: offset(mp, 60, 100),     // Wider easy band — the 80%
    long: offset(mp, 45, 90),      // Long runs deliberately slow
    marathon: band(mp, 6),
    threshold: band(mp - 12, 6),   // Threshold work — part of the 20%
    interval: band(mp - 35, 8),    // Hard intervals — the rest of the 20%
    repetition: band(mp - 55, 10),
  };
}

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 80;
  const longCap = params.longRunCapKm ?? 30;

  const inBuild = weekNumber <= programWeeks - 3;
  const phaseName = inBuild ? 'Polarised build' : 'Sharpen';

  // 80/20 by distance: ~80% of cap is easy, ~20% is hard.
  // Hard work goes on Tue + Thu, alternating threshold and intervals
  const hardKm = cap * 0.2;
  const easyKm = cap * 0.8;

  const isThresholdWeek = weekNumber % 2 === 0;

  const days: DayPlan[] = [
    {
      dow: 0,
      sessions: [{ label: 'Easy aerobic', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }],
    },
    {
      dow: 1,
      sessions: [{
        label: isThresholdWeek ? 'Threshold intervals' : 'Hard intervals',
        type: isThresholdWeek ? 'tempo' : 'interval',
        paceZone: isThresholdWeek ? zones.threshold : zones.interval,
        distanceKmMin: hardKm * 0.4,
        distanceKmMax: hardKm * 0.5,
      }],
    },
    {
      dow: 2,
      sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 12 }],
    },
    {
      dow: 3,
      sessions: [{
        label: isThresholdWeek ? 'Hard intervals' : 'Threshold',
        type: isThresholdWeek ? 'interval' : 'tempo',
        paceZone: isThresholdWeek ? zones.interval : zones.threshold,
        distanceKmMin: hardKm * 0.4,
        distanceKmMax: hardKm * 0.5,
      }],
    },
    { dow: 4, sessions: [{ label: 'Rest or recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 0, distanceKmMax: 6 }] },
    {
      dow: 5,
      sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 8, distanceKmMax: 14 }],
    },
    {
      dow: 6,
      sessions: [{
        label: 'Long easy',
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
    notes: '80% of weekly time should be at zones 1-2. Easy means easy.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, POLARISED_CALENDAR);
}

const POLARISED_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 14, factor: 0.85 },
      { withinDays: 7, factor: 0.6 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: {
    reducedFactor: 0.6,  // Polarised tolerates volume drops; the 80/20 ratio still holds
    travelOnlyFactor: 0.4,
    noTrainingZeroesOut: true,
  },
  tuneups: {
    enabled: true,
    taperDays: 2,
    recoveryDays: 2,
  },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};


/**
 * Entry weekly load: 80/20 polarised - moderate base assumption similar to Daniels.
 */
function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 25;
    case 'intermediate': return 40;
    case 'advanced':     return 55;
  }
}

export const polarised: PlanEngine = {
  dojo: 'polarised',
  stateProfile: {
    // 80/20: protect the easy aerobic base, ease the 20% hard first.
    tsbFloor: { base: -15, build: -20, peak: -20, taper: -5 },
    protectedTypes: ['long'],
    preferIntensityCut: true,
  },
  displayName: 'Polarised (80/20)',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 30,
  status: 'scaffold',
  calendarConfig: POLARISED_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
