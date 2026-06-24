/**
 * R2 surfacing - PURE aggregation helpers for the Trends page.
 *
 * No DB, no server-only. Monthly volume bucketing, month-over-month
 * delta, and zone-distribution percentages. The DB reader (trends.ts)
 * composes these over fetched activities.
 */

export interface MonthVolume {
  /** 'YYYY-MM' */
  month: string;
  km: number;
  /** Signed delta vs the previous month in the series; null for the first. */
  deltaKm: number | null;
  /** Percent change vs previous month; null for the first or when prior is 0. */
  deltaPct: number | null;
}

/**
 * Bucket {dateIso, km} samples into calendar months, oldest first, and
 * compute month-over-month deltas. `months` controls how many trailing
 * months to emit (zero-filled if a month had no activity).
 */
export function monthlyVolume(
  samples: { dateIso: string; km: number }[],
  endIso: string,
  months: number
): MonthVolume[] {
  const sums = new Map<string, number>();
  for (const s of samples) {
    const m = s.dateIso.slice(0, 7);
    sums.set(m, (sums.get(m) ?? 0) + s.km);
  }

  // Build the trailing month keys ending at endIso's month.
  const end = new Date(endIso + 'T00:00:00Z');
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getTime());
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const out: MonthVolume[] = [];
  let prev: number | null = null;
  for (const month of keys) {
    const km = Math.round((sums.get(month) ?? 0) * 10) / 10;
    const deltaKm = prev === null ? null : Math.round((km - prev) * 10) / 10;
    const deltaPct = prev === null || prev === 0 ? null : Math.round(((km - prev) / prev) * 100);
    out.push({ month, km, deltaKm, deltaPct });
    prev = km;
  }
  return out;
}

export type Zone5 = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';

export interface ZoneDistribution {
  totalMin: number;
  /** Minutes per zone */
  minutes: Record<Zone5, number>;
  /** Percent per zone (0-100), summing ~100 */
  pct: Record<Zone5, number>;
  /** Worst-case confidence seen across contributing activities */
  confidence: 'calibrated' | 'pace-only' | 'estimated';
}

const ZONES: Zone5[] = ['easy', 'marathon', 'threshold', 'interval', 'repetition'];
const CONF_RANK = { calibrated: 0, 'pace-only': 1, estimated: 2 } as const;

/**
 * Aggregate per-activity {zone, minutes, confidence} into a distribution.
 */
export function zoneDistribution(
  rows: { zone: Zone5; minutes: number; confidence: 'calibrated' | 'pace-only' | 'estimated' }[]
): ZoneDistribution {
  const minutes: Record<Zone5, number> = {
    easy: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0,
  };
  let worst: 'calibrated' | 'pace-only' | 'estimated' = 'calibrated';
  for (const r of rows) {
    minutes[r.zone] += r.minutes;
    if (CONF_RANK[r.confidence] > CONF_RANK[worst]) worst = r.confidence;
  }
  const totalMin = ZONES.reduce((s, z) => s + minutes[z], 0);
  const pct: Record<Zone5, number> = {
    easy: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0,
  };
  if (totalMin > 0) {
    for (const z of ZONES) pct[z] = Math.round((minutes[z] / totalMin) * 100);
  }
  return {
    totalMin: Math.round(totalMin),
    minutes,
    pct,
    confidence: totalMin > 0 ? worst : 'estimated',
  };
}

export interface LoadPoint {
  dateIso: string;
  ctl: number;
  atl: number;
  tsb: number;
}
