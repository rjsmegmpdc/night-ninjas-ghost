import type { PaceZone } from './types';

export type PaceVerdict = 'on-target' | 'too-fast' | 'too-slow' | 'unknown';

/**
 * Convert Strava avg_speed_ms (metres/second) to seconds per km.
 */
export function speedMsToSpk(speedMs: number): number {
  if (speedMs <= 0) return 0;
  return 1000 / speedMs;
}

/**
 * Check whether an actual pace falls within the prescribed zone.
 * Returns 'unknown' when either value is missing or the zone is unset.
 *
 * Lower spk = faster. minSpk is the faster end of the band, maxSpk is slower.
 */
export function checkPaceCompliance(
  actualSpk: number | null | undefined,
  zone: PaceZone | undefined,
): PaceVerdict {
  if (actualSpk == null || actualSpk <= 0) return 'unknown';
  if (!zone || zone.minSpk <= 0 || zone.maxSpk <= 0) return 'unknown';
  if (actualSpk < zone.minSpk) return 'too-fast';
  if (actualSpk > zone.maxSpk) return 'too-slow';
  return 'on-target';
}

/** Short display label for a verdict. Empty string for 'unknown'. */
export function verdictLabel(verdict: PaceVerdict): string {
  switch (verdict) {
    case 'on-target': return 'on target';
    case 'too-fast':  return 'faster than zone';
    case 'too-slow':  return 'slower than zone';
    case 'unknown':   return '';
  }
}
