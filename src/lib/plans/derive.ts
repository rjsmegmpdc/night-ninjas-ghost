import type { PaceZone, PaceZones, PlanParams } from './types';

export function marathonPaceSpk(params: PlanParams): number {
  if (Math.abs(params.goalDistanceKm - 42.195) < 0.1) {
    return params.goalTimeS / params.goalDistanceKm;
  }
  return riegelMarathonEquivalentSpk(params);
}

export function riegelMarathonEquivalentSpk(params: PlanParams): number {
  const t2 = params.goalTimeS * Math.pow(42.195 / params.goalDistanceKm, 1.06);
  return t2 / 42.195;
}

export function band(centreSpk: number, bandSecHalf: number): PaceZone {
  return { minSpk: Math.round(centreSpk - bandSecHalf), maxSpk: Math.round(centreSpk + bandSecHalf) };
}

export function offset(refSpk: number, offsetMin: number, offsetMax: number): PaceZone {
  return { minSpk: Math.round(refSpk + offsetMin), maxSpk: Math.round(refSpk + offsetMax) };
}

export function formatSpk(spk: number): string {
  if (!isFinite(spk) || spk <= 0) return '--:--';
  const m = Math.floor(spk / 60);
  const s = Math.round(spk - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(s: number): string {
  if (!isFinite(s) || s <= 0) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h * 3600) / 60);
  const sec = Math.round(s - h * 3600 - m * 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function formatBand(z: PaceZone): string {
  return `${formatSpk(z.minSpk)}–${formatSpk(z.maxSpk)}/km`;
}

export function emptyPaceZones(): PaceZones {
  const zero: PaceZone = { minSpk: 0, maxSpk: 0 };
  return {
    recovery: zero, easy: zero, long: zero, marathon: zero,
    threshold: zero, interval: zero, repetition: zero,
  };
}
