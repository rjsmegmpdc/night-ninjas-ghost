import 'server-only';

/**
 * R2 surfacing - Trends read layer.
 *
 * Composes the pure helpers in trends-pure over fetched activities and the
 * existing load/athlete-state machinery:
 *   - monthly volume (6 months) with month-over-month delta
 *   - 5-zone HR intensity distribution (last 28 days), via computeActivityLoad
 *   - CTL/ATL/TSB load-vs-recovery series (8 weeks), via computeEwma
 *
 * Reuses classifyIntensity (inside computeActivityLoad) so zone logic stays
 * single-sourced. Degrades gracefully on empty data.
 */

import { getActivitiesInRange } from './week-queries';
import { computeActivityLoad, type AthleteCalibration } from './load';
import { computeEwma, CTL_TIME_CONSTANT, ATL_TIME_CONSTANT, round1 } from './athlete-state-pure';
import {
  monthlyVolume,
  zoneDistribution,
  type MonthVolume,
  type ZoneDistribution,
  type Zone5,
  type LoadPoint,
} from './trends-pure';

export type { MonthVolume, ZoneDistribution, Zone5, LoadPoint } from './trends-pure';

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getMonthlyVolume(months = 6): Promise<MonthVolume[]> {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const acts = await getActivitiesInRange(isoDay(start), isoDay(end));
  const samples = acts.map((a) => ({ dateIso: a.startDateLocal.slice(0, 10), km: (a.distanceM ?? 0) / 1000 }));
  return monthlyVolume(samples, isoDay(end), months);
}

export async function getZoneDistribution(days = 28, calibration: AthleteCalibration = {}): Promise<ZoneDistribution> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const acts = await getActivitiesInRange(isoDay(start), isoDay(end));

  const rows: { zone: Zone5; minutes: number; confidence: 'calibrated' | 'pace-only' | 'estimated' }[] = [];
  for (const a of acts) {
    const load = computeActivityLoad(a, calibration);
    if (!load) continue;
    const minutes = (a.movingTimeS ?? 0) / 60;
    if (minutes <= 0) continue;
    rows.push({ zone: load.zone as Zone5, minutes, confidence: load.confidence });
  }
  return zoneDistribution(rows);
}

/**
 * Daily CTL/ATL/TSB across the trailing window. Builds a daily load map
 * from activities, then runs the same EWMA the athlete-state card uses,
 * sampling once per day so the series is chartable.
 */
export async function getLoadSeries(weeks = 8, calibration: AthleteCalibration = {}): Promise<LoadPoint[]> {
  const windowDays = weeks * 7;
  const end = new Date();
  // Pull extra history so the EWMA is warm at the window's start.
  const fetchStart = new Date(end);
  fetchStart.setDate(fetchStart.getDate() - (windowDays + 42));
  const acts = await getActivitiesInRange(isoDay(fetchStart), isoDay(end));

  const dailyLoad: Record<string, number> = {};
  for (const a of acts) {
    const load = computeActivityLoad(a, calibration);
    if (!load) continue;
    const day = a.startDateLocal.slice(0, 10);
    dailyLoad[day] = (dailyLoad[day] ?? 0) + load.points;
  }

  const out: LoadPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const iso = isoDay(d);
    const ctl = computeEwma(dailyLoad, iso, 365, CTL_TIME_CONSTANT);
    const atl = computeEwma(dailyLoad, iso, 365, ATL_TIME_CONSTANT);
    out.push({ dateIso: iso, ctl: round1(ctl), atl: round1(atl), tsb: round1(ctl - atl) });
  }
  return out;
}

export interface TrendsBundle {
  monthly: MonthVolume[];
  zones: ZoneDistribution;
  load: LoadPoint[];
  hasData: boolean;
}

export async function getTrendsBundle(calibration: AthleteCalibration = {}): Promise<TrendsBundle> {
  const [monthly, zones, load] = await Promise.all([
    getMonthlyVolume(6),
    getZoneDistribution(28, calibration),
    getLoadSeries(8, calibration),
  ]);
  const hasData = monthly.some((m) => m.km > 0) || zones.totalMin > 0;
  return { monthly, zones, load, hasData };
}
