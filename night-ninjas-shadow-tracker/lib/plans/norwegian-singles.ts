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
 * Norwegian Singles.
 *
 * The amateur adaptation of the Norwegian double-threshold system
 * (Bakken / Ingebrigtsen), popularised on the LetsRun forums by "sirpoc"
 * (James Copeland). The elite version stacks two threshold sessions per
 * day; Singles keeps the PHILOSOPHY - lots of controlled sub-threshold
 * work, ruthless easy-day discipline - at one session per day.
 *
 * Three pillars (per the locked VELOCITY spec):
 *   1. Three sub-threshold interval sessions per week + one easy long run.
 *      Sub-threshold means LT1-adjacent (~2 mmol), NOT LT2. "I could do
 *      several more reps" is the calibration test. The classic NS failure
 *      mode is running reps too hot.
 *   2. Quality cap: accumulated fast time (excluding warm-up/cool-down)
 *      stays within 20-25% of weekly volume. This engine pins 22%.
 *   3. Everything else is genuinely easy - Z1, conversational. No
 *      moderate days, no VO2-max work, no doubles.
 *
 * Session library (3-week rotation, per the spec's canonical shapes):
 *   A: short reps    - 10-12 x 3min (or 25 x 400m flavour)
 *   B: medium reps   - 6 x 5-6min
 *   C: long reps     - 3-4 x 8-10min
 *
 * Rep pace scales with rep length: short reps sit at the faster edge of
 * sub-threshold (~10K-HM effort), long reps nearer the slower edge.
 * For a sub-3:00 marathoner (MP 4:16/km) that lands reps around
 * 4:00-4:10/km - matching the spec's worked example.
 *
 * Non-periodised by design: NS is a steady rhythm, not a build-peak arc.
 * Volume ramps gently over the first three weeks, then holds. The final
 * three weeks swap Saturday's session for race-specific touches; the
 * taper itself is handled by the calendar layer.
 * -------------------------------------------------------------------------- */

const PHILOSOPHY =
  'Three controlled sub-threshold sessions a week, everything else genuinely easy. ' +
  'The amateur adaptation of Norwegian double-threshold: frequency and consistency ' +
  'over heroics. Quality capped at ~22% of volume. The discipline is the method.';

const QUALITY_FRACTION = 0.22; // locked spec: 20-25%, engine pins 22%

function paceZones(params: PlanParams): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery: offset(mp, 90, 130),
    easy: offset(mp, 55, 95),        // strict Z1 - easy means easy
    long: offset(mp, 50, 90),        // long run is just another easy run
    marathon: band(mp, 6),
    // Sub-threshold band: slightly faster than MP, clearly slower than LT2.
    // 'threshold' carries the LONG-rep end; 'interval' the SHORT-rep end.
    // Neither is true LT2/VO2 work - labels reuse the shared zone keys.
    threshold: band(mp - 8, 6),      // long reps: ~MP - 8s/km
    interval: band(mp - 14, 6),      // short reps: ~MP - 14s/km (10K-HM effort)
    repetition: band(mp - 20, 8),    // race-specific touches only, final weeks
  };
}

/** The 3-week session rotation. Index by (weekNumber + slot) % 3. */
const SUBT_SHAPES = [
  { label: 'Sub-T short reps - 10x3min, 60s float', short: true },
  { label: 'Sub-T medium reps - 6x5min, 60-90s jog', short: false },
  { label: 'Sub-T long reps - 3x10min, 90s jog', short: false },
] as const;

function renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate {
  const zones = paceZones(params);
  const programWeeks = params.programWeeks ?? 18;
  const cap = params.weeklyVolumeCapKm ?? 75;
  const longCap = params.longRunCapKm ?? 26;
  const level = params.level;

  // Gentle entry ramp, then hold. NS is rhythm, not periodisation.
  const ramp = weekNumber === 1 ? 0.85 : weekNumber === 2 ? 0.9 : weekNumber === 3 ? 0.95 : 1.0;
  const weekKm = cap * ramp;

  // Final three pre-taper weeks: Saturday becomes race-specific touches.
  const raceSpecific = weekNumber > programWeeks - 3;
  const phaseName = raceSpecific ? 'Race-specific touch' : 'Sub-threshold rhythm';

  // Quality budget: 22% of week, split across the sub-T sessions.
  const qualitySessions = level === 'beginner' ? 2 : 3;
  const qualityKm = weekKm * QUALITY_FRACTION;
  const perSessionKm = qualityKm / qualitySessions;

  // Long run: modest and easy. Never the hero session.
  const longKm = Math.min(longCap, weekKm * 0.22);

  // Easy budget fills the remainder across Mon/Wed/Fri (+Sat for beginners).
  const easyDays = level === 'beginner' ? 3 : 3; // Fri is rest for beginners
  const easyKm = Math.max(weekKm - qualityKm - longKm, 0);
  const perEasyKm = easyKm / (level === 'beginner' ? easyDays - 1 + 1 : easyDays);

  const shape = (slot: number) => SUBT_SHAPES[(weekNumber + slot) % 3];

  const subTSession = (slot: number): DayPlan['sessions'][number] => {
    const s = shape(slot);
    return {
      label: s.label,
      type: 'tempo', // sub-threshold maps to the tempo slot - controlled quality
      paceZone: s.short ? zones.interval : zones.threshold,
      distanceKmMin: Math.round(perSessionKm * 0.9),
      distanceKmMax: Math.round(perSessionKm * 1.1),
      notes: 'Sub-threshold: finish knowing you could do several more reps. If in doubt, slower.',
    };
  };

  const easySession = (km: number): DayPlan['sessions'][number] => ({
    label: 'Easy - conversational',
    type: 'easy',
    paceZone: zones.easy,
    distanceKmMin: Math.round(km * 0.85),
    distanceKmMax: Math.round(km * 1.15),
    notes: 'Strict Z1. The easy days protect the quality days.',
  });

  const days: DayPlan[] = [
    { dow: 0, sessions: [easySession(perEasyKm)] },
    { dow: 1, sessions: [subTSession(0)] },
    { dow: 2, sessions: [easySession(perEasyKm)] },
    {
      dow: 3,
      sessions: [
        level === 'beginner'
          ? easySession(perEasyKm)
          : subTSession(1),
      ],
    },
    {
      dow: 4,
      sessions:
        level === 'beginner'
          ? [{ label: 'Rest', type: 'rest' as const }]
          : [easySession(perEasyKm)],
    },
    {
      dow: 5,
      sessions: [
        raceSpecific
          ? {
              label: 'Race-pace touches - 5x2min at goal pace',
              type: 'tempo' as const,
              paceZone: zones.repetition,
              distanceKmMin: Math.round(perSessionKm * 0.7),
              distanceKmMax: Math.round(perSessionKm * 0.9),
              notes: 'Final-weeks sharpening: brief goal-pace contact, still controlled.',
            }
          : subTSession(2),
      ],
    },
    {
      dow: 6,
      sessions: [{
        label: 'Long easy',
        type: 'long',
        paceZone: zones.long,
        distanceKmMin: Math.round(longKm * 0.85),
        distanceKmMax: Math.round(longKm),
        notes: 'Just a longer easy run. No pace work inside it.',
      }],
    },
  ];

  const raw: WeekTemplate = {
    weekNumber,
    phaseName,
    totalKmTarget: Math.round(weekKm),
    longRunKmTarget: Math.round(longKm),
    days,
    notes:
      'Quality is capped at ~22% of weekly volume. The classic failure is running reps too hot - sub-threshold means controlled.',
    adaptations: [],
  };

  return applyStructuredCalendar(raw, context, zones, NS_CALENDAR);
}

const NS_CALENDAR: CalendarConfig = {
  taper: {
    schedule: [
      { withinDays: 14, factor: 0.85 },
      { withinDays: 7, factor: 0.6 },
    ],
    raceWeekStyle: 'short-shakeouts',
  },
  volumeScale: {
    // Frequency is the method: when life compresses a week, hold the
    // sub-T touches and shed easy volume - mirrored by the state profile.
    reducedFactor: 0.65,
    travelOnlyFactor: 0.45,
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
 * Entry weekly load - NS assumes an established aerobic habit; the method
 * is volume-tolerant because the quality is controlled.
 */
function entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number {
  switch (level) {
    case 'beginner':     return 30;
    case 'intermediate': return 45;
    case 'advanced':     return 60;
  }
}

export const norwegianSingles: PlanEngine = {
  dojo: 'norwegian-singles',
  stateProfile: {
    // Fatigue-averse by construction: sub-threshold should never dig deep
    // holes, so a deep TSB means something is wrong - intervene earlier
    // than fatigue-stacking methods. The three sub-T touches are the
    // signature (protected); easy volume is the buffer that gets cut.
    tsbFloor: { base: -15, build: -18, peak: -18, taper: -6 },
    protectedTypes: ['tempo'],
    preferIntensityCut: false,
  },
  displayName: 'Norwegian Singles',
  philosophy: PHILOSOPHY,
  defaultProgramWeeks: 18,
  defaultLongRunCapKm: 26,
  status: 'scaffold',
  calendarConfig: NS_CALENDAR,
  derivePaceZones: paceZones,
  renderWeek,
  entryWeeklyLoadKm,
};
