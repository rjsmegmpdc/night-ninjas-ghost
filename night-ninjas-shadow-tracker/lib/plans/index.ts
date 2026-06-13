import { hansons } from './hansons';
import { lydiard } from './lydiard';
import { daniels } from './daniels';
import { pfitzinger } from './pfitzinger';
import { higdon } from './higdon';
import { polarised } from './polarised';
import { ultra } from './ultra';
import { custom } from './custom';
import { norwegianSingles } from './norwegian-singles';
import type { Dojo, PlanEngine } from './types';

/**
 * Registry of all available plan engines, keyed by Dojo identifier.
 *
 * Order in ALL_ENGINES is the display order in the dojo picker — most
 * popular / recommended first, custom last.
 *
 * To add a new plan: implement PlanEngine, then add the import + entries here.
 */
export const ENGINES: Record<Dojo, PlanEngine> = {
  hansons,
  'norwegian-singles': norwegianSingles,
  lydiard,
  daniels,
  pfitzinger,
  higdon,
  polarised,
  ultra,
  custom,
};

export function getEngine(dojo: Dojo): PlanEngine {
  return ENGINES[dojo];
}

export const ALL_ENGINES: PlanEngine[] = [
  hansons,
  norwegianSingles,
  daniels,
  pfitzinger,
  higdon,
  lydiard,
  polarised,
  ultra,
  custom,
];

export * from './types';
export * from './derive';
