import 'server-only';

/**
 * Phase 6 - race execution read layer.
 *
 * Assembles the goal race + athlete weight + program phase into the full
 * execution view: pacing (three strategies), fuelling, and carb-load. Pure
 * logic lives in execution-pure.ts. Returns null when there's no goal race
 * with a target time.
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getAthleteProfile } from '@/lib/store/settings';
import { getProgramPhase } from '@/lib/plans/program-phase';
import {
  pacePlan,
  fuelingPlan,
  carbLoadPlan,
  type PacePlan,
  type PaceStrategy,
} from './execution-pure';

export type {
  PacePlan,
  PaceSegment,
  PaceStrategy,
  FuelingPlan,
  CarbLoadPlan,
  CarbLoadDay,
} from './execution-pure';

const STRATEGIES: PaceStrategy[] = ['even', 'negative', 'progressive'];

export interface RaceExecutionView {
  race: { name: string; distanceKm: number; raceDate: string; targetTimeS: number };
  daysToRace: number | null;
  /** Within taper or race week - the execution surface matters most now. */
  isTaper: boolean;
  pacing: Record<PaceStrategy, PacePlan>;
  fueling: ReturnType<typeof fuelingPlan>;
  carbLoad: ReturnType<typeof carbLoadPlan> | null;
  weightKg: number | null;
}

export async function getRaceExecution(): Promise<RaceExecutionView | null> {
  const db = getDb();
  const goal = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  if (!goal || !goal.targetTimeS) return null;

  const profile = await getAthleteProfile();
  const phase = await getProgramPhase();

  const pacing = Object.fromEntries(
    STRATEGIES.map((s) => [s, pacePlan(goal.distanceKm, goal.targetTimeS as number, s)])
  ) as Record<PaceStrategy, PacePlan>;

  return {
    race: {
      name: goal.name,
      distanceKm: goal.distanceKm,
      raceDate: goal.raceDate,
      targetTimeS: goal.targetTimeS,
    },
    daysToRace: phase.daysToRace,
    isTaper: phase.kind === 'taper' || phase.kind === 'race-week',
    pacing,
    fueling: fuelingPlan(goal.targetTimeS),
    carbLoad: profile.weightKg ? carbLoadPlan(profile.weightKg) : null,
    weightKg: profile.weightKg ?? null,
  };
}
