import type { Dojo, PlanEngine } from './types';
import { hansons } from './hansons';
import { lydiard } from './lydiard';
import { daniels } from './daniels';
import { pfitzinger } from './pfitzinger';
import { higdon } from './higdon';
import { polarised } from './polarised';
import { ultra } from './ultra';
import { norwegianSingles } from './norwegian-singles';
import { custom } from './custom';
import { aiCoach } from './ai-coach';

export const ENGINES: Record<Dojo, PlanEngine> = {
  hansons,
  lydiard,
  daniels,
  pfitzinger,
  higdon,
  polarised,
  ultra,
  'norwegian-singles': norwegianSingles,
  custom,
  'ai-coach': aiCoach,
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
  aiCoach,
];

export * from './types';
export * from './derive';
