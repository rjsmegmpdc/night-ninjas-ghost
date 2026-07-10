/**
 * gear-intelligence.ts — PURE gear analysis module for GHOST.
 *
 * No DB calls, no browser APIs. All functions take plain data arguments.
 * Consumers (e.g. GearPage) are responsible for fetching the raw rows and
 * mapping them to the types below before calling these functions.
 *
 * Answers Matt's specific questions:
 *   "Which shoe works best for 400m reps / 1km reps / 5k PB / 10k PB / 21k PB / marathon PB?"
 */

// ---------------------------------------------------------------------------
// Workout type taxonomy
// ---------------------------------------------------------------------------

export type WorkoutType =
  | 'speed_reps'    // 400m / 1km reps — short fast efforts
  | 'tempo_5k'      // 5k race pace
  | 'race_10k'      // 10k race pace
  | 'half_marathon' // half marathon
  | 'marathon'      // marathon
  | 'long_run'      // long easy run (16km+)
  | 'easy';         // everything else

export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  speed_reps:    '400m / 1km reps',
  tempo_5k:      '5k race',
  race_10k:      '10k race',
  half_marathon: 'Half marathon',
  marathon:      'Marathon',
  long_run:      'Long run',
  easy:          'Easy / recovery',
};

/** Canonical display order for workout types. */
export const WORKOUT_TYPE_ORDER: WorkoutType[] = [
  'speed_reps',
  'tempo_5k',
  'race_10k',
  'half_marathon',
  'marathon',
  'long_run',
  'easy',
];

// ---------------------------------------------------------------------------
// Input shapes — populated by the caller from DB rows
// ---------------------------------------------------------------------------

export interface ShoeActivity {
  stravaGearId: string;
  distanceM: number;
  movingTimeS: number;
  /** m/s — higher is faster */
  avgSpeedMs: number;
  avgHr: number | null;
  /** 'Run' | 'TrailRun' | 'VirtualRun' */
  type: string;
  /** ISO date string */
  startDate: string;
}

export interface ShoeData {
  id: number;
  stravaGearId: string;
  name: string;
  brand: string | null;
  model: string | null;
  /** 'daily' | 'race' | 'trail' | etc. */
  category: string;
  /** km retirement target */
  targetKm: number;
  /** total km computed from activities join */
  totalKm: number;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ShoeWorkoutScore {
  /** stravaGearId */
  shoeId: string;
  shoeName: string;
  shoeBrand: string | null;
  sessionCount: number;
  /** Average pace across sessions — minutes per km; lower = faster = better */
  avgPaceMinKm: number;
  /** Best (fastest) single-session pace — minutes per km */
  bestPaceMinKm: number;
  /** Weighted average HR across sessions; null if no HR data */
  avgHr: number | null;
  /** 0–100, higher = better shoe for this workout type. Normalised in rankShoesForWorkout. */
  performanceScore: number;
  totalKm: number;
  /** < 70 % of target = ok; 70–90 % = worn; >= 90 % = retire */
  wearStatus: 'ok' | 'worn' | 'retire';
}

export interface GearRecommendations {
  byWorkoutType: Partial<Record<WorkoutType, ShoeWorkoutScore[]>>;
  /** Workout types that have at least one scored shoe, in canonical order */
  coveredTypes: WorkoutType[];
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a single activity into a WorkoutType.
 *
 * Rules are applied in priority order — first match wins.
 */
export function classifyWorkout(a: ShoeActivity): WorkoutType {
  const { distanceM, avgSpeedMs } = a;

  // 1. Marathon distance band
  if (distanceM >= 38_000 && distanceM <= 46_000) return 'marathon';

  // 2. Half marathon distance band
  if (distanceM >= 18_000 && distanceM <= 24_000) return 'half_marathon';

  // 3. Long run — slow long effort (< 4:45/km)
  if (distanceM >= 16_000 && avgSpeedMs < 3.5) return 'long_run';

  // 4. Speed reps — short distance + fast pace (>= 3:42/km equivalent)
  if (distanceM < 8_000 && avgSpeedMs >= 3.7) return 'speed_reps';

  // 5. Tempo 5k — 3–8 km at >= 5:12/km pace
  if (distanceM >= 3_000 && distanceM < 8_000 && avgSpeedMs >= 3.2) return 'tempo_5k';

  // 6. 10k race — 8–18 km at >= 3:20/km pace
  if (distanceM >= 8_000 && distanceM < 18_000 && avgSpeedMs >= 3.0) return 'race_10k';

  // 7. Catch-all
  return 'easy';
}

// ---------------------------------------------------------------------------
// Per-shoe per-workout scoring
// ---------------------------------------------------------------------------

/**
 * Score a single shoe for a specific workout type.
 *
 * Returns null when the shoe has fewer than 2 qualifying sessions
 * (insufficient data to draw a reliable conclusion).
 */
export function scoreShoeForWorkoutType(
  workoutType: WorkoutType,
  shoe: ShoeData,
  activities: ShoeActivity[],
): ShoeWorkoutScore | null {
  // Filter to this shoe + this workout type only
  const sessions = activities.filter(
    (a) => a.stravaGearId === shoe.stravaGearId && classifyWorkout(a) === workoutType,
  );

  if (sessions.length < 2) return null;

  // Pace stats
  const avgSpeedMs  = sessions.reduce((s, a) => s + a.avgSpeedMs, 0) / sessions.length;
  const bestSpeedMs = Math.max(...sessions.map((a) => a.avgSpeedMs));

  // avgPaceMinKm: minutes per km — 1000m / (speed m/s) / 60s
  const avgPaceMinKm  = 1000 / (avgSpeedMs  * 60);
  const bestPaceMinKm = 1000 / (bestSpeedMs * 60);

  // HR: time-weighted average over sessions that have HR data
  let avgHr: number | null = null;
  const hrSessions = sessions.filter((a) => a.avgHr != null && a.movingTimeS > 0);
  if (hrSessions.length > 0) {
    const weightedSum = hrSessions.reduce((s, a) => s + (a.avgHr as number) * a.movingTimeS, 0);
    const totalTime   = hrSessions.reduce((s, a) => s + a.movingTimeS, 0);
    avgHr = totalTime > 0 ? weightedSum / totalTime : null;
  }

  // Wear status relative to km target
  const pct = shoe.targetKm > 0 ? shoe.totalKm / shoe.targetKm : 0;
  const wearStatus: 'ok' | 'worn' | 'retire' =
    pct >= 0.9 ? 'retire' :
    pct >= 0.7 ? 'worn'   :
    'ok';

  return {
    shoeId:           shoe.stravaGearId,
    shoeName:         shoe.name,
    shoeBrand:        shoe.brand,
    sessionCount:     sessions.length,
    avgPaceMinKm,
    bestPaceMinKm,
    avgHr,
    performanceScore: 0,   // normalised in rankShoesForWorkout
    totalKm:          shoe.totalKm,
    wearStatus,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Score and rank all shoes for a given workout type.
 *
 * Shoes with fewer than 2 qualifying sessions are excluded.
 * `performanceScore` is normalised 0–100 (faster avg pace = higher score).
 */
export function rankShoesForWorkout(
  workoutType: WorkoutType,
  shoes: ShoeData[],
  activities: ShoeActivity[],
): ShoeWorkoutScore[] {
  // Score each shoe; drop nulls
  const scored = shoes
    .map((s) => scoreShoeForWorkoutType(workoutType, s, activities))
    .filter((s): s is ShoeWorkoutScore => s !== null);

  if (scored.length === 0) return [];

  // Normalise performanceScore 0–100 based on avgPaceMinKm
  // Lower pace = faster = better, so the shoe with the lowest pace gets 100.
  if (scored.length === 1) {
    scored[0].performanceScore = 100;
  } else {
    const paces  = scored.map((s) => s.avgPaceMinKm);
    const minPace = Math.min(...paces);   // fastest
    const maxPace = Math.max(...paces);   // slowest
    const range   = maxPace - minPace;

    for (const s of scored) {
      s.performanceScore = range > 0
        ? Math.round(100 * (maxPace - s.avgPaceMinKm) / range)
        : 100;
    }
  }

  // Sort descending by performance score (best shoe first)
  scored.sort((a, b) => b.performanceScore - a.performanceScore);

  return scored;
}

// ---------------------------------------------------------------------------
// Recommendations aggregation
// ---------------------------------------------------------------------------

/**
 * Build a full gear recommendations map — one ranked list per workout type,
 * covering only types with at least one scored shoe.
 */
export function buildGearRecommendations(
  shoes: ShoeData[],
  activities: ShoeActivity[],
): GearRecommendations {
  const byWorkoutType: Partial<Record<WorkoutType, ShoeWorkoutScore[]>> = {};

  for (const wt of WORKOUT_TYPE_ORDER) {
    const ranked = rankShoesForWorkout(wt, shoes, activities);
    if (ranked.length > 0) {
      byWorkoutType[wt] = ranked;
    }
  }

  const coveredTypes = WORKOUT_TYPE_ORDER.filter((wt) => byWorkoutType[wt] !== undefined);

  return { byWorkoutType, coveredTypes };
}

// ---------------------------------------------------------------------------
// Race shoe alert
// ---------------------------------------------------------------------------

/**
 * Return a single human-readable warning string relevant for race prep,
 * or null if nothing to flag.
 *
 * Detection heuristics (in order):
 *   1. Shoe has category === 'race'
 *   2. Shoe's fastest average session pace across all activities is < 3.7 m/s
 *      (sub-4:30/km average — proxy for shoes used in fast efforts)
 */
export function getRaceShoeAlert(
  shoes: ShoeData[],
  activities: ShoeActivity[],
  daysToRace: number | null,
): string | null {
  if (daysToRace === null) return null;

  // Identify race shoes by category or by pace proxy
  const raceShoes = shoes.filter((shoe) => {
    if (shoe.category === 'race') return true;
    // Pace proxy: the best avg speed across any session for this shoe
    const shoeActivities = activities.filter((a) => a.stravaGearId === shoe.stravaGearId);
    if (shoeActivities.length === 0) return false;
    const bestSpeed = Math.max(...shoeActivities.map((a) => a.avgSpeedMs));
    return bestSpeed >= 3.7;
  });

  // Within 14 days — check km on race shoes
  if (daysToRace <= 14) {
    for (const shoe of raceShoes) {
      if (shoe.totalKm > 650) {
        return `Race shoe has ${Math.round(shoe.totalKm)}km — consider retiring before race day`;
      }
    }
    for (const shoe of raceShoes) {
      if (shoe.totalKm < 50) {
        return 'Your fastest shoe has low km — great for race day';
      }
    }
  }

  // Within 7 days — warn if no explicit race-category shoe
  if (daysToRace <= 7) {
    const hasExplicitRaceShoe = shoes.some((s) => s.category === 'race');
    if (!hasExplicitRaceShoe) {
      return 'Race week: pick your fastest pair and do one short shakeout in them';
    }
  }

  return null;
}
