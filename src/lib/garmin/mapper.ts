/**
 * Pure mappers: Garmin vendor payloads -> GarminDailySnapshot ->
 * NewDailyHealthMetric row. No I/O. Fully unit-tested.
 */

import type { GarminDailySnapshot } from './types';
import type { NewDailyHealthMetric } from '@/lib/db/schema';

function positiveOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function extractSleep(payload: unknown): {
  sleepDurationS: number | null;
  sleepScore: number | null;
} {
  const p = payload as { dailySleepDTO?: Record<string, unknown> } | null | undefined;
  const dto = (p?.dailySleepDTO ?? p) as Record<string, unknown> | null | undefined;
  if (!dto || typeof dto !== 'object') return { sleepDurationS: null, sleepScore: null };
  const sleepDurationS = positiveOrNull(dto.sleepTimeSeconds);
  let sleepScore: number | null = null;
  const scores = dto.sleepScores as Record<string, unknown> | undefined;
  const overall = scores?.overall as Record<string, unknown> | undefined;
  sleepScore = positiveOrNull(overall?.value);
  return { sleepDurationS, sleepScore };
}

export function extractDailySummary(payload: unknown): {
  rhrBpm: number | null;
  stressScore: number | null;
  bodyBattery: number | null;
} {
  const p = payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object') return { rhrBpm: null, stressScore: null, bodyBattery: null };
  return {
    rhrBpm: positiveOrNull(p.restingHeartRate),
    stressScore: positiveOrNull(p.averageStressLevel),
    bodyBattery: positiveOrNull(p.bodyBatteryMostRecentValue ?? p.bodyBatteryHighestValue),
  };
}

export function extractHrv(payload: unknown): { hrvMs: number | null } {
  const p = payload as { hrvSummary?: Record<string, unknown> } | null | undefined;
  const summary = p?.hrvSummary;
  if (!summary) return { hrvMs: null };
  return { hrvMs: positiveOrNull(summary.lastNightAvg ?? summary.weeklyAvg) };
}

export function extractVo2max(payload: unknown): { vo2maxDevice: number | null } {
  const arr = Array.isArray(payload) ? payload : [];
  for (const entry of arr) {
    const generic = (entry as Record<string, unknown>)?.generic as Record<string, unknown> | undefined;
    const v = numberOrNull(generic?.vo2MaxPreciseValue ?? generic?.vo2MaxValue);
    if (v !== null) return { vo2maxDevice: v };
  }
  return { vo2maxDevice: null };
}

export function extractWeight(payload: unknown): { weightKg: number | null } {
  const p = payload as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object') return { weightKg: null };
  const grams = numberOrNull(
    p.weight ?? (p.totalAverage as Record<string, unknown> | undefined)?.weight
  );
  if (grams === null || grams <= 0) return { weightKg: null };
  return { weightKg: Math.round((grams / 1000) * 10) / 10 };
}

export function snapshotToRow(snapshot: GarminDailySnapshot): NewDailyHealthMetric {
  return {
    date: snapshot.date,
    source: 'garmin',
    rhrBpm: snapshot.rhrBpm,
    hrvMs: snapshot.hrvMs,
    sleepDurationS: snapshot.sleepDurationS,
    sleepScore: snapshot.sleepScore,
    stressScore: snapshot.stressScore,
    bodyBattery: snapshot.bodyBattery,
    vo2maxDevice: snapshot.vo2maxDevice,
    weightKg: snapshot.weightKg,
    raw: JSON.stringify(snapshot.raw),
  };
}
