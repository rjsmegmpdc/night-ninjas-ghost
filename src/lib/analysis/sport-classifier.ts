export type SportCategory =
  | 'run'
  | 'trail-run'
  | 'virtual-run'
  | 'ride'
  | 'virtual-ride'
  | 'mtb'
  | 'swim'
  | 'walk'
  | 'hike'
  | 'weights'
  | 'workout'
  | 'crossfit'
  | 'yoga'
  | 'pilates'
  | 'mobility'
  | 'other';

export function classifySport(
  sportType: string | null | undefined,
  activityName: string | null | undefined = null
): SportCategory {
  if (activityName) {
    const lower = activityName.toLowerCase();
    if (/\bpilates\b/.test(lower)) return 'pilates';
    if (/\b(mobility|stretching|stretch|foam.?roll)\b/.test(lower)) return 'mobility';
  }

  if (!sportType) return 'other';

  switch (sportType) {
    case 'Run': return 'run';
    case 'TrailRun': return 'trail-run';
    case 'VirtualRun': return 'virtual-run';
    case 'Ride':
    case 'EBikeRide':
    case 'GravelRide': return 'ride';
    case 'VirtualRide': return 'virtual-ride';
    case 'MountainBikeRide': return 'mtb';
    case 'Swim': return 'swim';
    case 'Walk': return 'walk';
    case 'Hike': return 'hike';
    case 'WeightTraining': return 'weights';
    case 'Workout': return 'workout';
    case 'Crossfit':
    case 'CrossFit': return 'crossfit';
    case 'Yoga': return 'yoga';
    case 'StrengthTraining': return 'weights';
    default: return 'other';
  }
}

export function isRunning(c: SportCategory): boolean {
  return c === 'run' || c === 'trail-run' || c === 'virtual-run';
}

export function isAuxiliary(c: SportCategory): boolean {
  return c === 'weights' || c === 'workout' || c === 'crossfit' || c === 'yoga' || c === 'pilates' || c === 'mobility';
}

export function isAerobicCross(c: SportCategory): boolean {
  return c === 'ride' || c === 'virtual-ride' || c === 'mtb' || c === 'swim' || c === 'walk' || c === 'hike';
}
