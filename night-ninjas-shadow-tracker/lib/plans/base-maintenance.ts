import 'server-only';
import { getActivitiesInRange } from '@/lib/analysis/week-queries';
import type {
  WeekTemplate,
  DayPlan,
  SessionTarget,
  PaceZone,
  PlanParams,
} from '@/lib/plans/types';
import { marathonPaceSpk, band } from '@/lib/plans/derive';

/**
 * Base maintenance week generator.
 *
 * Engine-agnostic. Produces a sensible default week template for periods
 * outside any plan period — pre-program (race is far out, plan hasn't
 * started yet), post-program (athlete finished a block, hasn't picked
 * the next), or between programs.
 *
 * This is NOT a coached prescription. It's a defensible floor — the
 * volume + structure a runner at the athlete's current level of training
 * would typically do this week if no specific block applies.
 *
 * Volume policy (Phase 1 — runs without freshness model):
 *
 *   - Pre-program week (week is before active period start):
 *       volume = period_week1_volume × 0.85
 *   - Post-program week (week is after active period end):
 *       volume = recent 4-week chronic load (km/week average)
 *   - No program at all:
 *       volume = recent 4-week chronic load (km/week average)
 *
 * Hard floor: never below 25 km/week (avoid prescribing zero-volume).
 * Hard ceiling: never above current chronic load × 1.1 (avoid bumps).
 *
 * Distribution within the week:
 *   Mon  15%  easy
 *   Tue   0%  rest
 *   Wed  18%  easy
 *   Thu   0%  strength (durationMinMax 30-45)
 *   Fri  18%  easy
 *   Sat   0%  rest
 *   Sun  35% + (long run, gets the residual % after rounding)
 *
 * Sums to ~86% of weekly volume on running days; the residual goes to Sun.
 *
 * When Phase 2 freshness model lands, this generator's volume rule
 * extends — chronic load becomes the explicit input, with adjustments
 * for ATL spikes, TSB, and base-maintenance volume clamps.
 */

const KM_FLOOR = 25;
const HEADROOM_FACTOR = 1.1;
const PRE_PROGRAM_RAMPDOWN = 0.85;
const RECENT_WEEKS_FOR_CHRONIC = 4;

/** Volume distribution on running days (fractions of weekly total). */
const DAY_FRACTIONS = {
  monEasy: 0.15,
  wedEasy: 0.18,
  friEasy: 0.18,
  // Sun long takes the residual — about 35% after the others
  sunLong: 0.49,
};

/**
 * Compute base-maintenance volume for a given week.
 *
 * `referenceWeek1Km` is the active period's week-1 volume target if known
 * — used as the rampdown anchor for pre-program weeks. Pass null if no
 * active period or week is post-program.
 *
 * Returns null when no signal is available to derive volume (no recent
 * activities, no reference week). Caller decides whether to fall back to
 * a default or render the cell empty.
 */
async function computeBaseVolumeKm({
  weekStartIso,
  weekEndIso,
  referenceWeek1Km,
  referenceMode,
}: {
  weekStartIso: string;
  weekEndIso: string;
  referenceWeek1Km: number | null;
  referenceMode: 'pre-program' | 'post-program' | 'no-program';
}): Promise<number | null> {
  let baseKm: number | null = null;

  if (referenceMode === 'pre-program' && referenceWeek1Km && referenceWeek1Km > 0) {
    baseKm = referenceWeek1Km * PRE_PROGRAM_RAMPDOWN;
  } else {
    // post-program or no-program — use recent chronic load
    const chronic = await computeRecentChronicKm(weekStartIso);
    if (chronic !== null) baseKm = chronic;
  }

  if (baseKm === null) return null;

  // Apply floor + ceiling. Ceiling uses chronic-load headroom check
  // independently so a generous reference week1 doesn't blow past safety.
  const chronicForCeiling = await computeRecentChronicKm(weekStartIso);
  if (chronicForCeiling !== null && chronicForCeiling > 0) {
    const ceiling = chronicForCeiling * HEADROOM_FACTOR;
    if (baseKm > ceiling) baseKm = ceiling;
  }

  if (baseKm < KM_FLOOR) baseKm = KM_FLOOR;

  return Math.round(baseKm * 10) / 10;
}

/**
 * Average weekly running km over the most recent N completed weeks
 * before `beforeIso`. Returns null when no activity history exists.
 *
 * Sums distance across Run / TrailRun / VirtualRun activities only —
 * cycling and gym don't count toward "running chronic load" used to
 * scale a maintenance week.
 */
async function computeRecentChronicKm(beforeIso: string): Promise<number | null> {
  const before = new Date(beforeIso + 'T00:00:00');
  // Look back N weeks
  const lookback = new Date(before);
  lookback.setDate(lookback.getDate() - 7 * RECENT_WEEKS_FOR_CHRONIC);
  const lookbackIso = lookback.toISOString().slice(0, 10);
  // weekStart is the earliest day to include; weekEnd = day before `before`
  const cutoffEnd = new Date(before);
  cutoffEnd.setDate(cutoffEnd.getDate() - 1);
  const cutoffEndIso = cutoffEnd.toISOString().slice(0, 10);

  const activities = await getActivitiesInRange(lookbackIso, cutoffEndIso);
  if (activities.length === 0) return null;

  let totalKm = 0;
  let runActivityCount = 0;
  for (const a of activities) {
    const st = a.sportType ?? a.type ?? '';
    if (st === 'Run' || st === 'TrailRun' || st === 'VirtualRun') {
      if (a.distanceM && a.distanceM > 0) {
        totalKm += a.distanceM / 1000;
        runActivityCount++;
      }
    }
  }

  if (runActivityCount === 0) return null;

  return totalKm / RECENT_WEEKS_FOR_CHRONIC;
}

/**
 * Render a base-maintenance WeekTemplate.
 *
 * Returns null when no volume can be derived (no recent activity history,
 * no reference week). The matrix should treat null as "no template" and
 * render the row as a thin "no data" indicator rather than show fake
 * sessions at the floor.
 *
 * `params` is included so we can derive easy-run pace zones consistent
 * with the runner's goal pace — even maintenance weeks should respect
 * the athlete's individual easy zone.
 */
export async function renderBaseMaintenanceWeek({
  weekStartIso,
  weekEndIso,
  referenceWeek1Km,
  referenceMode,
  params,
  weekNumberMarker,
  volumeOverrideKm,
}: {
  weekStartIso: string;
  weekEndIso: string;
  referenceWeek1Km: number | null;
  referenceMode: 'pre-program' | 'post-program' | 'no-program';
  /** Used only to derive easy-run pace zone for labels. */
  params: PlanParams | null;
  /**
   * Synthetic week number for display purposes. The matrix uses this as
   * the W-number; pass any sensible integer (typically 0 or a negative).
   */
  weekNumberMarker: number;
  /**
   * Optional explicit weekly volume in km. When provided, overrides the
   * chronic-load-derived default. Used by the ramp planner during
   * pre-program weeks: "this week of base maintenance should target
   * 32km, next week 35km, etc." Bridges the athlete from their current
   * chronic load up to the program's expected entry load.
   */
  volumeOverrideKm?: number;
}): Promise<WeekTemplate | null> {
  const totalKm = volumeOverrideKm !== undefined && volumeOverrideKm > 0
    ? volumeOverrideKm
    : await computeBaseVolumeKm({
        weekStartIso,
        weekEndIso,
        referenceWeek1Km,
        referenceMode,
      });

  if (totalKm === null) return null;

  // Easy pace zone: derived from goal params if available; otherwise
  // a generic "comfortable" band that we'll label as "easy"
  const easyZone = deriveEasyZoneSafe(params);

  const monKm = round1(totalKm * DAY_FRACTIONS.monEasy);
  const wedKm = round1(totalKm * DAY_FRACTIONS.wedEasy);
  const friKm = round1(totalKm * DAY_FRACTIONS.friEasy);
  const sunKm = round1(totalKm - monKm - wedKm - friKm);

  const days: DayPlan[] = [
    {
      dow: 0, // Mon
      sessions: [easySession(monKm, easyZone, 'Mon easy')],
    },
    {
      dow: 1, // Tue
      sessions: [restSession()],
    },
    {
      dow: 2, // Wed
      sessions: [easySession(wedKm, easyZone, 'Wed easy')],
    },
    {
      dow: 3, // Thu
      sessions: [strengthSession()],
    },
    {
      dow: 4, // Fri
      sessions: [easySession(friKm, easyZone, 'Fri easy')],
    },
    {
      dow: 5, // Sat
      sessions: [restSession()],
    },
    {
      dow: 6, // Sun
      sessions: [longSession(sunKm, easyZone)],
    },
  ];

  return {
    weekNumber: weekNumberMarker,
    phaseName: 'Base',
    totalKmTarget: totalKm,
    longRunKmTarget: sunKm,
    days,
    notes: undefined,
  };
}

/* ----------------------------------------------------------------------------
 * Helpers — session builders
 * ------------------------------------------------------------------------- */

function easySession(km: number, zone: PaceZone, label: string): SessionTarget {
  return {
    label,
    type: 'easy',
    paceZone: zone,
    distanceKmMin: km,
    distanceKmMax: km,
  };
}

function longSession(km: number, easyZone: PaceZone): SessionTarget {
  return {
    label: 'Sun long',
    type: 'long',
    paceZone: easyZone,
    distanceKmMin: km,
    distanceKmMax: km,
  };
}

function strengthSession(): SessionTarget {
  return {
    label: 'Strength',
    type: 'strength',
    durationMinMin: 30,
    durationMinMax: 45,
  };
}

function restSession(): SessionTarget {
  return {
    label: 'Rest',
    type: 'rest',
  };
}

/**
 * Derive an easy-run pace zone from params, with a generic fallback when
 * params are missing. Mirrors the convention used by the engines — easy
 * pace = marathon pace + ~60s/km, ±12s band.
 */
function deriveEasyZoneSafe(params: PlanParams | null): PaceZone {
  if (!params) {
    // Fallback: a wide "comfortable" band centred around 5:30/km
    return band(330, 30);
  }
  const mp = marathonPaceSpk(params);
  return band(mp + 60, 12);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
