/**
 * Phase 12 surfacing - PURE resolution + trend logic.
 *
 * No DB, no server-only. Split from biometrics.ts (the DB reader) so the
 * source-priority and trend maths are unit-testable in vitest without a
 * database harness. biometrics.ts re-exports these.
 */

const SOURCE_PRIORITY = ['manual-lab', 'garmin', 'whoop', 'apple-health', 'coros', 'manual'] as const;
type Source = (typeof SOURCE_PRIORITY)[number] | string;

export function rankSource(source: Source): number {
  const i = (SOURCE_PRIORITY as readonly string[]).indexOf(source);
  return i === -1 ? SOURCE_PRIORITY.length : i;
}

export const METRIC_FIELDS = [
  'rhrBpm', 'hrvMs', 'sleepDurationS', 'sleepScore',
  'stressScore', 'bodyBattery', 'vo2maxDevice', 'weightKg',
] as const;

export interface ResolvedDayMetrics {
  date: string;
  rhrBpm: number | null;
  hrvMs: number | null;
  sleepDurationS: number | null;
  sleepScore: number | null;
  stressScore: number | null;
  bodyBattery: number | null;
  vo2maxDevice: number | null;
  weightKg: number | null;
  sources: string[];
}

export type MetricRowLike = { source: string } & {
  [K in (typeof METRIC_FIELDS)[number]]?: number | null;
};

/** Pure per-field source-priority resolution for a single day's rows. */
export function resolveDayRows(date: string, dayRows: MetricRowLike[]): ResolvedDayMetrics {
  const sorted = [...dayRows].sort((a, b) => rankSource(a.source) - rankSource(b.source));
  const resolved: ResolvedDayMetrics = {
    date,
    rhrBpm: null, hrvMs: null, sleepDurationS: null, sleepScore: null,
    stressScore: null, bodyBattery: null, vo2maxDevice: null, weightKg: null,
    sources: [],
  };
  const contributing = new Set<string>();
  for (const field of METRIC_FIELDS) {
    for (const row of sorted) {
      const v = row[field];
      if (v !== null && v !== undefined) {
        (resolved[field] as number) = v as number;
        contributing.add(row.source);
        break;
      }
    }
  }
  resolved.sources = [...contributing];
  return resolved;
}

export interface MetricTrend {
  latest: number | null;
  latestDate: string | null;
  mean: number | null;
  priorMean: number | null;
  series: { date: string; value: number | null }[];
}

export function trendFor(days: ResolvedDayMetrics[], field: (typeof METRIC_FIELDS)[number]): MetricTrend {
  const series = days.map((d) => ({ date: d.date, value: d[field] as number | null }));
  const values = series.filter((s) => s.value !== null) as { date: string; value: number }[];
  const latest = values.length ? values[values.length - 1] : null;
  const mean = values.length ? values.reduce((s, v) => s + v.value, 0) / values.length : null;
  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid);
  const priorMean = older.length ? older.reduce((s, v) => s + v.value, 0) / older.length : null;
  return {
    latest: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    mean: mean !== null ? Math.round(mean * 10) / 10 : null,
    priorMean: priorMean !== null ? Math.round(priorMean * 10) / 10 : null,
    series,
  };
}
