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
 * Ultra-distance training — STUB.
 *
 * This dojo is registered but not yet implemented to a useful depth.
 * Ultra training (50K, 50mi, 100K, 100mi) is structurally different from
 * road marathon training:
 *   - Time-on-feet rather than km targets
 *   - Vertical gain matters as much as distance
 *   - Back-to-back long runs ("the double") instead of one weekly long
 *   - Specific terrain practice
 *
 * Expected references when fleshed out: Jason Koop's "Training Essentials
 * for Ultrarunning" + David Roche's SWAP approach (Some Work, All Play).
 *
 * Currently produces a plausible road-style baseline with longer long runs
 * so the framework boots, but this is NOT a real ultra plan. Don't use it.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  '[STUB] Time on feet, vertical gain, back-to-back long runs. Reference plans: Jason Koop, David Roche / SWAP. Currently a placeholder — pick another dojo if you have a real ultra coming up.';

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery: offset(mp, 100, 150),
    easy: offset(mp, 70, 120),    // Ultra easy is much slower than marathon easy
    long: offset(mp, 50, 100),    // Ultras are slow
    marathon: band(mp, 8),
    threshold: band(mp - 8, 8),
    interval: band(mp - 25, 10),
    repetition: band(mp - 45, 12),
  };
}

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const cap = params.weeklyVolumeCapKm ?? 100;
  const longCap = params.longRunCapKm ?? 50;

  const easy: DayPlan[] = [
    { dow: 0, sessions: [{ label: 'Recovery', type: 'recovery', paceZone: zones.recovery, distanceKmMin: 6, distanceKmMax: 10 }] },
    { dow: 1, sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 12, distanceKmMax: 16 }] },
    { dow: 2, sessions: [{ label: 'Easy', type: 'easy', paceZone: zones.easy, distanceKmMin: 12, distanceKmMax: 16 }] },
    { dow: 3, sessions: [{ label: 'Tempo or hill repeats', type: 'tempo', paceZone: zones.threshold, distanceKmMin: 10, distanceKmMax: 14 }] },
    { dow: 4, sessions: [{ label: 'Rest', type: 'rest' }] },
    {
      dow: 5,
      sessions: [{
        label: 'Long run #1 (double)',
        type: 'long',
        paceZone: zones.long,
        distanceKmMin: longCap * 0.5,
        distanceKmMax: longCap * 0.6,
      }],
    },
    {
      dow: 6,
      sessions: [{
        label: 'Long run #2 (double)',
        type: 'long',
        paceZone: zones.long,
        distanceKmMin: longCap * 0.7,
        distanceKmMax: longCap,
      }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName: 'Ultra build (stub)',
    totalKmTarget: cap,
    longRunKmTarget: longCap,
    days: easy,
    notes: 'Ultra dojo is a stub. Volume is plausible but week structure is generic. Real implementation pending.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, ULTRA_CALENDAR);
}

const ULTRA_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 21, factor: 0.85 },
      { withinDays: 14, factor: 0.7 },
      { withinDays: 7, factor: 0.5 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: {
    reducedFactor: 0.6,
    travelOnlyFactor: 0.4,
    noTrainingZeroesOut: true,
  },
  tuneups: {
    enabled: true,
    taperDays: 3,
    recoveryDays: 3,
  },
  honourRecurringSessions: true,
  annotateNinjaLoops: true,
};


/**
 * Entry weekly load: Ultra training requires substantial volume baseline.
 */
function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 40;
    case 'intermediate': return 55;
    case 'advanced':     return 75;
  }
}

export const ultra: PlanEngine = {
  dojo: 'ultra',
  stateProfile: {
    // Time-on-feet first; intensity is expendable, long runs are not.
    tsbFloor: { base: -22, build: -28, peak: -28, taper: -10 },
    protectedTypes: ['long'],
    preferIntensityCut: true,
  },
  displayName: 'Ultra (stub)',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 24,
  defaultLongRunCapKm: 50,
  status: 'stub',
  calendarConfig: ULTRA_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
