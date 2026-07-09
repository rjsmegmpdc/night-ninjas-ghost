/**
 * Strike — Athlete State screen.
 * Shows CTL/ATL/TSB (Card 1), Intensity History (Card 2),
 * Mileage Trajectory (Card 3), Long Run this week (Card 4), Biometrics (Card 5).
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useDb } from '@/db/DbContext';
import { query } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import {
  computeEwma,
  classifyForm,
  rollupConfidence,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  WINDOW_DAYS,
  type FormClass,
} from '@/lib/analysis/athlete-state-pure';
import { computeActivityLoad, type LoadConfidence } from '@/lib/analysis/load';
import { classifySport, isRunning } from '@/lib/analysis/sport-classifier';
import {
  resolveDayRows,
  trendFor,
  type ResolvedDayMetrics,
} from '@/lib/analysis/biometrics-pure';
import { getActivePlanPeriod, type ActivePlanPeriod } from '@/lib/analysis/week-queries';
import { ENGINES, type Dojo } from '@/lib/plans/index';
import type { PlanParams } from '@/lib/plans/types';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// UTC date helpers — always build keys with UTC so they match computeEwma's
// internal walk (which also anchors to UTC).
// ---------------------------------------------------------------------------

function utcIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return utcIso(d);
}

function todayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return utcIso(d);
}

/**
 * ISO week key — Mon is day 1. Returns 'YYYY-Www'.
 * Uses UTC date components so keys don't shift by timezone.
 */
function isoWeekKey(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  // Move to nearest Thursday (ISO week belongs to the year of its Thursday)
  const thursday = new Date(d);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysToThursday = dow === 0 ? 3 : 4 - dow;
  thursday.setUTCDate(d.getUTCDate() + daysToThursday);
  const year = thursday.getUTCFullYear();
  // Week number: Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const weekNum = Math.floor((thursday.getTime() - weekStart.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/** Monday of the current UTC week */
function currentWeekMonday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return utcIso(d);
}

/** Monday of 2 weeks ago in UTC */
function twoWeeksAgoMonday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1) - 14);
  return utcIso(d);
}

// ---------------------------------------------------------------------------
// Row shape from the query (positions match the spec)
// r[0]=start_date, r[1]=distance(m), r[2]=moving_time(s), r[3]=avg_hr,
// r[4]=sport_type, r[5]=avg_speed(m/s), r[6]=name, r[7]=type
// ---------------------------------------------------------------------------
interface RawRow {
  startDate: string;
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
  sportType: string | null;
  avgSpeedMs: number | null;
  name: string | null;
  type: string;
}

function parseRow(r: unknown[]): RawRow {
  return {
    startDate: r[0] as string,
    distanceM: (r[1] as number) ?? 0,
    movingTimeS: (r[2] as number) ?? 0,
    avgHr: r[3] as number | null,
    sportType: r[4] as string | null,
    avgSpeedMs: r[5] as number | null,
    name: r[6] as string | null,
    type: r[7] as string,
  };
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

interface AthleteStateData {
  ctl: number;
  atl: number;
  tsb: number;
  formClass: FormClass;
  activityCount: number;
  confidence: 'calibrated' | 'pace-only' | 'estimated';
  hrCount: number;
}

interface WeekIntensity {
  weekKey: string;
  startIso: string;
  endIso: string;
  easyS: number;
  greyS: number;
  hardS: number;
  totalS: number;
}

interface WeekMileage {
  weekKey: string;
  startIso: string;
  endIso: string;
  runKm: number;
}

interface LongRunData {
  longRunKm: number;
  weekTotalKm: number;
  twoWeeksAgoLongKm: number;
}

interface RollingDay {
  /** ISO date */
  date: string;
  /** Trailing 28-day actual run km ending on this day */
  actual: number;
  /** Trailing 28-day planned run km, or null when no plan is active */
  planned: number | null;
}

interface StrikeData {
  athleteState: AthleteStateData;
  intensityWeeks: WeekIntensity[];
  mileageWeeks: WeekMileage[];
  longRun: LongRunData | null;
  biometrics: ResolvedDayMetrics[];
  rolling: RollingDay[];
  hasPlan: boolean;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function fetchActivitiesWindow(cutoffIso: string, todayIso: string): Promise<unknown[][]> {
  return query(
    `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed, name, type
     FROM activities
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date`,
    [cutoffIso, todayIso + 'T99:99:99'],
  );
}

function computeAthleteState(rows: unknown[][], todayIso: string): AthleteStateData {
  const dailyLoads = new Map<string, number>();
  let activityCount = 0;
  const confCounts = { calibrated: 0, 'pace-only': 0, estimated: 0 };
  let hrCount = 0;

  for (const r of rows) {
    const row = parseRow(r);
    const dayKey = row.startDate.slice(0, 10);

    const result = computeActivityLoad(
      {
        sportType: row.sportType,
        type: row.type,
        name: row.name ?? null,
        movingTimeS: row.movingTimeS,
        avgHr: row.avgHr,
        avgSpeedMs: row.avgSpeedMs,
      },
      {},
    );

    if (!result) continue;

    activityCount++;
    const existing = dailyLoads.get(dayKey) ?? 0;
    dailyLoads.set(dayKey, existing + result.points);

    const conf = result.confidence as LoadConfidence;
    if (conf === 'calibrated') confCounts.calibrated++;
    else if (conf === 'pace-only') confCounts['pace-only']++;
    else confCounts.estimated++;

    if (row.avgHr != null) hrCount++;
  }

  const ctl = computeEwma(dailyLoads, todayIso, WINDOW_DAYS, CTL_TIME_CONSTANT);
  const atl = computeEwma(dailyLoads, todayIso, WINDOW_DAYS, ATL_TIME_CONSTANT);
  const tsb = ctl - atl;
  const formClass = classifyForm(tsb);
  const confidence = rollupConfidence(confCounts, activityCount);

  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round(tsb * 10) / 10,
    formClass,
    activityCount,
    confidence,
    hrCount,
  };
}

function computeIntensityWeeks(rows: unknown[][]): WeekIntensity[] {
  const weekMap = new Map<string, WeekIntensity>();

  for (const r of rows) {
    const row = parseRow(r);
    const key = isoWeekKey(row.startDate.slice(0, 10));

    if (!weekMap.has(key)) {
      // Derive Mon/Sun of the week from the activity date
      const d = new Date(row.startDate.slice(0, 10) + 'T00:00:00Z');
      const dow = d.getUTCDay() || 7;
      const mon = new Date(d);
      mon.setUTCDate(d.getUTCDate() - (dow - 1));
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 6);
      weekMap.set(key, {
        weekKey: key,
        startIso: utcIso(mon),
        endIso: utcIso(sun),
        easyS: 0,
        greyS: 0,
        hardS: 0,
        totalS: 0,
      });
    }

    const wk = weekMap.get(key)!;
    const result = computeActivityLoad(
      {
        sportType: row.sportType,
        type: row.type,
        name: row.name ?? null,
        movingTimeS: row.movingTimeS,
        avgHr: row.avgHr,
        avgSpeedMs: row.avgSpeedMs,
      },
      {},
    );

    if (!result) continue;

    const s = row.movingTimeS;
    wk.totalS += s;
    const zone = result.zone;
    if (zone === 'easy') {
      wk.easyS += s;
    } else if (zone === 'marathon' || zone === 'threshold') {
      wk.greyS += s;
    } else {
      // 'interval' | 'repetition' | 'quality'
      wk.hardS += s;
    }
  }

  // Build ordered 8-week list (oldest first)
  const allKeys = Array.from(weekMap.keys()).sort();
  return allKeys.map((k) => weekMap.get(k)!);
}

function computeMileageWeeks(rows: unknown[][]): WeekMileage[] {
  const weekMap = new Map<string, WeekMileage>();

  for (const r of rows) {
    const row = parseRow(r);
    const dayIso = row.startDate.slice(0, 10);
    const key = isoWeekKey(dayIso);

    if (!weekMap.has(key)) {
      const d = new Date(dayIso + 'T00:00:00Z');
      const dow = d.getUTCDay() || 7;
      const mon = new Date(d);
      mon.setUTCDate(d.getUTCDate() - (dow - 1));
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 6);
      weekMap.set(key, {
        weekKey: key,
        startIso: utcIso(mon),
        endIso: utcIso(sun),
        runKm: 0,
      });
    }

    const cat = classifySport(row.sportType, row.name ?? undefined);
    if (isRunning(cat)) {
      weekMap.get(key)!.runKm += row.distanceM / 1000;
    }
  }

  const allKeys = Array.from(weekMap.keys()).sort();
  return allKeys.map((k) => weekMap.get(k)!);
}

async function fetchLongRun(
  weekMondayIso: string,
  twoWeeksAgoIso: string,
  weekSundayIso: string,
): Promise<LongRunData | null> {
  // This week's runs
  const thisWeekRows = await query(
    `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed, name, type
     FROM activities
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date`,
    [weekMondayIso, weekSundayIso + 'T99:99:99'],
  );

  let longRunKm = 0;
  let weekTotalKm = 0;

  for (const r of thisWeekRows) {
    const row = parseRow(r);
    const cat = classifySport(row.sportType, row.name ?? undefined);
    if (isRunning(cat)) {
      const km = row.distanceM / 1000;
      weekTotalKm += km;
      if (km > longRunKm) longRunKm = km;
    }
  }

  if (longRunKm < 10) return null;

  // Two weeks ago's runs — use same week window offset by 14 days
  const twoWeeksAgoSundayIso = (() => {
    const d = new Date(twoWeeksAgoIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return utcIso(d);
  })();

  const twoWeeksRows = await query(
    `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed, name, type
     FROM activities
     WHERE start_date >= ? AND start_date <= ?
     ORDER BY start_date`,
    [twoWeeksAgoIso, twoWeeksAgoSundayIso + 'T99:99:99'],
  );

  let twoWeeksAgoLongKm = 0;
  for (const r of twoWeeksRows) {
    const row = parseRow(r);
    const cat = classifySport(row.sportType, row.name ?? undefined);
    if (isRunning(cat)) {
      const km = row.distanceM / 1000;
      if (km > twoWeeksAgoLongKm) twoWeeksAgoLongKm = km;
    }
  }

  return { longRunKm, weekTotalKm, twoWeeksAgoLongKm };
}

// ---------------------------------------------------------------------------
// Rolling 28-day volume — actual vs planned.
//
// Each display day carries the trailing 28-day sum. Display window = 56 days,
// so the query reaches back 56 + 27 lead-in days. Planned daily km is the
// active plan's weekly totalKmTarget / 7 for whichever program week the day
// falls in (0 outside program bounds); null series when no plan is active.
// ---------------------------------------------------------------------------

const ROLLING_WINDOW = 28;
const ROLLING_DISPLAY_DAYS = 56;

function plannedDailyKmLookup(plan: ActivePlanPeriod): ((dayIso: string) => number) | null {
  const engine = ENGINES[plan.dojo as Dojo];
  if (!engine) return null;

  const params: PlanParams = {
    goalDistanceKm: plan.goalDistanceKm ?? 42.195,
    goalTimeS: plan.goalTimeS ?? 12600,
    level: plan.level,
    programWeeks: plan.programWeeks,
    startDate: plan.startDate,
  };

  // Render each program week once; cache the daily share of its km target.
  const weeklyDaily = new Map<number, number>();
  const start = new Date(plan.startDate + 'T00:00:00Z').getTime();

  return (dayIso: string) => {
    const days = Math.floor((new Date(dayIso + 'T00:00:00Z').getTime() - start) / 86400000);
    if (days < 0) return 0;
    const weekNum = Math.floor(days / 7) + 1;
    if (weekNum > plan.programWeeks) return 0;
    if (!weeklyDaily.has(weekNum)) {
      const template = engine.renderWeek(params, weekNum);
      weeklyDaily.set(weekNum, (template.totalKmTarget ?? 0) / 7);
    }
    return weeklyDaily.get(weekNum)!;
  };
}

async function fetchRollingVolume(todayIso: string): Promise<{ rolling: RollingDay[]; hasPlan: boolean }> {
  const leadDays = ROLLING_DISPLAY_DAYS + ROLLING_WINDOW - 1;
  const fromIso = utcDaysAgo(leadDays);

  const [rows, plan] = await Promise.all([
    query(
      `SELECT start_date, distance, sport_type, name
       FROM activities
       WHERE start_date >= ? AND start_date <= ?
       ORDER BY start_date`,
      [fromIso, todayIso + 'T99:99:99'],
    ),
    getActivePlanPeriod().catch(() => null),
  ]);

  // Daily actual run km
  const dailyKm = new Map<string, number>();
  for (const r of rows) {
    const cat = classifySport(r[2] as string | null, (r[3] as string | null) ?? undefined);
    if (!isRunning(cat)) continue;
    const day = (r[0] as string).slice(0, 10);
    dailyKm.set(day, (dailyKm.get(day) ?? 0) + ((r[1] as number) ?? 0) / 1000);
  }

  const plannedFor = plan ? plannedDailyKmLookup(plan) : null;

  // Walk the full lead-in once, keeping a sliding 28-day window.
  const rolling: RollingDay[] = [];
  const actualWindow: number[] = [];
  const plannedWindow: number[] = [];
  let actualSum = 0;
  let plannedSum = 0;

  for (let i = leadDays; i >= 0; i--) {
    const dayIso = utcDaysAgo(i);
    const a = dailyKm.get(dayIso) ?? 0;
    const p = plannedFor ? plannedFor(dayIso) : 0;

    actualWindow.push(a); actualSum += a;
    plannedWindow.push(p); plannedSum += p;
    if (actualWindow.length > ROLLING_WINDOW) {
      actualSum -= actualWindow.shift()!;
      plannedSum -= plannedWindow.shift()!;
    }

    if (i < ROLLING_DISPLAY_DAYS) {
      rolling.push({
        date: dayIso,
        actual: Math.round(actualSum * 10) / 10,
        planned: plannedFor ? Math.round(plannedSum * 10) / 10 : null,
      });
    }
  }

  return { rolling, hasPlan: !!plannedFor };
}

async function fetchBiometrics(fromIso: string, toIso: string): Promise<ResolvedDayMetrics[]> {
  const [healthRows, journalRows] = await Promise.all([
    query(
      `SELECT date, source, rhr_bpm, hrv_ms, sleep_duration_s, sleep_score,
              stress_score, body_battery, vo2max_device, weight_kg
       FROM daily_health_metrics WHERE date >= ? AND date <= ?
       ORDER BY date ASC`,
      [fromIso, toIso]
    ).catch(() => [] as unknown[][]),
    query(
      `SELECT date, resting_hr, hrv FROM journal WHERE date >= ? AND date <= ?`,
      [fromIso, toIso]
    ).catch(() => [] as unknown[][]),
  ]);

  // Build a map of date → rows (for resolveDayRows)
  const byDate = new Map<string, { source: string; rhrBpm?: number | null; hrvMs?: number | null; sleepDurationS?: number | null; sleepScore?: number | null; stressScore?: number | null; bodyBattery?: number | null; vo2maxDevice?: number | null; weightKg?: number | null }[]>();

  for (const r of healthRows) {
    const date = r[0] as string;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      source:          r[1] as string,
      rhrBpm:          r[2] as number | null,
      hrvMs:           r[3] as number | null,
      sleepDurationS:  r[4] as number | null,
      sleepScore:      r[5] as number | null,
      stressScore:     r[6] as number | null,
      bodyBattery:     r[7] as number | null,
      vo2maxDevice:    r[8] as number | null,
      weightKg:        r[9] as number | null,
    });
  }

  for (const r of journalRows) {
    const date = r[0] as string;
    const rhr = r[1] as number | null;
    const hrv = r[2] as number | null;
    if (rhr == null && hrv == null) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({ source: 'manual', rhrBpm: rhr, hrvMs: hrv });
  }

  // Collect all dates in order and resolve each day
  const dates = Array.from(byDate.keys()).sort();
  return dates.map((date) => resolveDayRows(date, byDate.get(date)!));
}

// ---------------------------------------------------------------------------
// Form class display maps
// ---------------------------------------------------------------------------

const FORM_LABEL: Record<FormClass, string> = {
  fresh: 'Fresh',
  'on-form': 'On Form',
  maintained: 'Maintained',
  loaded: 'Loaded',
  overreached: 'Overreached',
};

const FORM_COLOR: Record<FormClass, string> = {
  fresh: 'text-accent',
  'on-form': 'text-signal-ok',
  maintained: 'text-bone',
  loaded: 'text-signal-warn',
  overreached: 'text-signal-miss',
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function signedStr(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StrikePage() {
  const { ready, error: dbError } = useDb();
  const [data, setData] = useState<StrikeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayIso = todayUtcIso();
  const cutoffIso = utcDaysAgo(WINDOW_DAYS);
  const weekMonday = currentWeekMonday();
  const twoWeeksAgo = twoWeeksAgoMonday();
  const weekSunday = (() => {
    const d = new Date(weekMonday + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    return utcIso(d);
  })();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const bioFrom = utcDaysAgo(28);

    Promise.all([
      fetchActivitiesWindow(cutoffIso, todayIso),
      fetchLongRun(weekMonday, twoWeeksAgo, weekSunday),
      fetchBiometrics(bioFrom, todayIso),
      fetchRollingVolume(todayIso),
    ])
      .then(([windowRows, longRun, biometrics, rollingRes]) => {
        if (cancelled) return;
        const athleteState = computeAthleteState(windowRows, todayIso);
        const intensityWeeks = computeIntensityWeeks(windowRows);
        const mileageWeeks = computeMileageWeeks(windowRows);
        setData({
          athleteState, intensityWeeks, mileageWeeks, longRun, biometrics,
          rolling: rollingRes.rolling, hasPlan: rollingRes.hasPlan,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ready, cutoffIso, todayIso, weekMonday, twoWeeksAgo, weekSunday]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || loading || !data) return <PageSkeleton />;

  if (error) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">Error loading data: {error}</p>
      </div>
    );
  }

  const { athleteState, intensityWeeks, mileageWeeks, longRun, biometrics, rolling, hasPlan } = data;
  const tooFewActivities = athleteState.activityCount < 7;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">strike</p>
        <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
          Strike
        </h1>
        <p className="font-mono text-xs text-bone-dim">
          Athlete State — 8-week window
        </p>
      </header>

      {tooFewActivities ? (
        <EmptyState />
      ) : (
        <>
          {/* Card 1: Athlete State */}
          <AthleteStateCard state={athleteState} />

          {/* Cards 2 + 3: two-col on large */}
          <div className="grid lg:grid-cols-2 gap-8">
            <IntensityHistoryCard weeks={intensityWeeks} />
            <MileageTrajectoryCard weeks={mileageWeeks} />
          </div>

          {/* Card 3b: Rolling 28-day volume — actual vs planned */}
          {rolling.some((d) => d.actual > 0) && (
            <RollingVolumeCard days={rolling} hasPlan={hasPlan} />
          )}

          {/* Card 4: Long Run — only if > 10km exists this week */}
          {longRun && <LongRunCard data={longRun} />}

          {/* Card 5: Biometrics — only if any data logged */}
          {biometrics.length > 0 && <BiometricsCard days={biometrics} />}
        </>
      )}

      {/* Static footer */}
      <footer className="border-t border-ink-line pt-4">
        <Link to="/vo2max" className="font-mono text-xs text-bone-mute hover:text-accent transition-colors">
          VO2max analysis →
        </Link>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 5: Biometrics (28-day window)
// ---------------------------------------------------------------------------

function trendArrow(
  trend: { latest: number | null; priorMean: number | null },
  lowerIsBetter = false,
): { symbol: string; color: string } | null {
  if (trend.latest == null || trend.priorMean == null) return null;
  const improved = lowerIsBetter ? trend.latest < trend.priorMean : trend.latest > trend.priorMean;
  const flat = Math.abs(trend.latest - trend.priorMean) / (Math.abs(trend.priorMean) || 1) < 0.02;
  if (flat) return { symbol: '→', color: 'text-bone-mute' };
  return improved
    ? { symbol: '↑', color: 'text-signal-ok' }
    : { symbol: '↓', color: 'text-signal-miss' };
}

const HRV_SPARK_H = 28;

function HrvSparkline({ series }: { series: { date: string; value: number | null }[] }) {
  const values = series.filter((s) => s.value != null) as { date: string; value: number }[];
  if (values.length < 3) {
    return <span className="font-mono text-xs text-bone-mute">not enough data</span>;
  }
  const min = Math.min(...values.map((v) => v.value));
  const max = Math.max(...values.map((v) => v.value));
  const range = max - min || 1;
  const w = 120;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = HRV_SPARK_H - ((v.value - min) / range) * (HRV_SPARK_H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={w}
      height={HRV_SPARK_H}
      viewBox={`0 0 ${w} ${HRV_SPARK_H}`}
      aria-label="HRV 28-day sparkline"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-accent"
      />
    </svg>
  );
}

function BiometricsCard({ days }: { days: ResolvedDayMetrics[] }) {
  const hrv    = trendFor(days, 'hrvMs');
  const rhr    = trendFor(days, 'rhrBpm');
  const sleep  = trendFor(days, 'sleepScore');
  const bb     = trendFor(days, 'bodyBattery');

  const metrics: {
    label: string;
    unit: string;
    value: number | null;
    lowerIsBetter: boolean;
    trend: { latest: number | null; priorMean: number | null; mean: number | null };
    decimals?: number;
  }[] = [
    { label: 'HRV', unit: 'ms', value: hrv.latest, lowerIsBetter: false, trend: hrv, decimals: 1 },
    { label: 'Resting HR', unit: 'bpm', value: rhr.latest, lowerIsBetter: true, trend: rhr },
    { label: 'Sleep Score', unit: '/100', value: sleep.latest, lowerIsBetter: false, trend: sleep },
    { label: 'Body Battery', unit: '/100', value: bb.latest, lowerIsBetter: false, trend: bb },
  ];

  const hasAny = metrics.some((m) => m.value != null);
  if (!hasAny) return null;

  return (
    <section className="m3-card" aria-label="Biometrics">
      <div className="px-6 py-4 border-b border-ink-line flex items-center justify-between">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          biometrics · 28-day window
        </span>
        <span className="font-mono text-xs text-bone-dim">manual + garmin</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {metrics.map((m) => {
          const arrow = trendArrow(m.trend, m.lowerIsBetter);
          return (
            <div key={m.label} className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
              <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{m.label}</p>
              {m.value != null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display tracking-widest text-4xl leading-none text-bone">
                      {m.decimals ? m.value.toFixed(m.decimals) : Math.round(m.value)}
                    </span>
                    <span className="font-mono text-bone-mute text-sm">{m.unit}</span>
                    {arrow && (
                      <span className={`font-mono text-lg leading-none ${arrow.color}`}>
                        {arrow.symbol}
                      </span>
                    )}
                  </div>
                  {m.trend.mean != null && (
                    <p className="font-mono text-xs text-bone-mute">
                      28d avg {m.decimals ? m.trend.mean.toFixed(m.decimals) : Math.round(m.trend.mean)}{m.unit}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-mono text-sm text-bone-mute">—</p>
              )}
            </div>
          );
        })}
      </div>

      {hrv.series.some((s) => s.value != null) && (
        <div className="px-6 py-4 border-t border-ink-line flex items-center gap-4">
          <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">HRV trend</span>
          <HrvSparkline series={hrv.series} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="m3-card p-8 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        strike · insufficient data
      </p>
      <h2 className="font-display tracking-widest text-3xl uppercase text-bone">
        Not enough history
      </h2>
      <p className="font-mono text-sm text-bone-dim max-w-xl leading-relaxed">
        Sync more activities in Setup. Strike needs at least 7 activities in the last 8 weeks to
        compute meaningful athlete state.
      </p>
      <Link
        to="/setup"
        className="inline-flex items-center gap-2 mt-2 font-mono text-xs uppercase tracking-widest text-accent hover:text-accent-hover transition-colors"
      >
        Go to setup →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1: Athlete State (CTL / ATL / TSB)
// ---------------------------------------------------------------------------

function AthleteStateCard({ state }: { state: AthleteStateData }) {
  const { ctl, atl, tsb, formClass, activityCount, confidence, hrCount } = state;
  const paceOnlyCount = activityCount - hrCount;

  return (
    <section className="rounded-2xl bg-primary-container/40 p-5 space-y-4" aria-label="Athlete State">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">
          athlete state · CTL / ATL / TSB
        </span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-medium bg-secondary-container text-on-secondary-container`}>
          {FORM_LABEL[formClass]}
        </span>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* CTL */}
        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">CTL</p>
          <p className="font-display tracking-widest text-4xl leading-none text-bone">
            {ctl.toFixed(1)}
          </p>
          <p className="font-mono text-xs text-bone-mute">chronic · fitness</p>
        </div>

        {/* ATL */}
        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">ATL</p>
          <p className="font-display tracking-widest text-4xl leading-none text-bone">
            {atl.toFixed(1)}
          </p>
          <p className="font-mono text-xs text-bone-mute">acute · fatigue</p>
        </div>

        {/* TSB */}
        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">TSB</p>
          <p className={`font-display tracking-widest text-4xl leading-none ${FORM_COLOR[formClass]}`}>
            {signedStr(tsb)}
          </p>
          <p className={`font-mono text-xs ${FORM_COLOR[formClass]}`}>
            {FORM_LABEL[formClass]}
          </p>
        </div>
      </div>

      {/* Footer: activity count + confidence */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <span className="font-mono text-xs text-bone-mute">
          {activityCount} {activityCount === 1 ? 'activity' : 'activities'} in window
        </span>
        <span className="font-mono text-xs text-bone-mute">
          {hrCount} with HR · {paceOnlyCount} pace-only
        </span>
        <span className="font-mono text-xs text-bone-dim uppercase tracking-widest">
          {confidence}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 2: Intensity History (8 weeks)
// ---------------------------------------------------------------------------

const BAR_HEIGHT_PX = 80;

function IntensityHistoryCard({ weeks }: { weeks: WeekIntensity[] }) {
  // Pad to exactly 8 weeks
  const padded = padWeeks(weeks, 8);

  return (
    <section className="m3-card" aria-label="Intensity History">
      {/* Header */}
      <div className="px-6 py-4 border-b border-ink-line flex items-center justify-between flex-wrap gap-3">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          intensity · 8 weeks
        </span>
        <div className="flex items-center gap-4">
          <LegendSwatch color="bg-signal-ok" label="Easy" />
          <LegendSwatch color="bg-signal-warn" label="Grey" />
          <LegendSwatch color="bg-signal-miss" label="Hard" />
        </div>
      </div>

      {/* Bar chart */}
      <div className="px-6 py-5">
        <div className="flex items-end gap-1 justify-between">
          {padded.map((week, i) => (
            <IntensityBar key={week?.weekKey ?? `empty-${i}`} week={week} />
          ))}
        </div>
        {/* Date labels */}
        <div className="flex justify-between mt-2">
          <span className="font-mono text-xs text-bone-mute">
            {padded[0] ? shortDate(padded[0].startIso) : ''}
          </span>
          <span className="font-mono text-xs text-bone-mute">
            {padded[padded.length - 1] ? shortDate(padded[padded.length - 1]!.endIso) : ''}
          </span>
        </div>
      </div>
    </section>
  );
}

function IntensityBar({ week }: { week: WeekIntensity | null }) {
  if (!week || week.totalS === 0) {
    return (
      <div
        className="flex-1 border border-dashed border-ink-line-bold rounded-sm opacity-40"
        style={{ height: BAR_HEIGHT_PX }}
        aria-label="No activity"
      />
    );
  }

  const total = week.easyS + week.greyS + week.hardS || 1;
  const easyPct = (week.easyS / total) * 100;
  const greyPct = (week.greyS / total) * 100;
  const hardPct = (week.hardS / total) * 100;

  return (
    <div
      className="flex-1 flex flex-col-reverse rounded-sm overflow-hidden"
      style={{ height: BAR_HEIGHT_PX }}
      aria-label={`Week ${week.weekKey}`}
    >
      {/* Bottom = easy (green) */}
      {easyPct > 0 && (
        <div
          className="bg-signal-ok"
          style={{ height: `${easyPct}%` }}
          title={`Easy ${easyPct.toFixed(0)}%`}
        />
      )}
      {/* Middle = grey (amber) */}
      {greyPct > 0 && (
        <div
          className="bg-signal-warn"
          style={{ height: `${greyPct}%` }}
          title={`Grey ${greyPct.toFixed(0)}%`}
        />
      )}
      {/* Top = hard (red) */}
      {hardPct > 0 && (
        <div
          className="bg-signal-miss"
          style={{ height: `${hardPct}%` }}
          title={`Hard ${hardPct.toFixed(0)}%`}
        />
      )}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-sm ${color}`} aria-hidden="true" />
      <span className="font-mono text-xs text-bone-mute">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3: Mileage Trajectory (8 weeks)
// ---------------------------------------------------------------------------

const MILEAGE_BAR_PX = 80;

function MileageTrajectoryCard({ weeks }: { weeks: WeekMileage[] }) {
  const padded = padMileageWeeks(weeks, 8);
  const runningWeeks = padded.filter((w): w is WeekMileage => w !== null && w.runKm > 0);
  const peakKm = runningWeeks.length > 0 ? Math.max(...runningWeeks.map((w) => w.runKm)) : 0;

  return (
    <section className="m3-card" aria-label="Mileage Trajectory">
      {/* Header */}
      <div className="px-6 py-4 border-b border-ink-line flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          mileage · 8 weeks
        </span>
        {peakKm > 0 && (
          <span className="font-mono text-xs text-bone-dim">
            peak {peakKm.toFixed(1)} km
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="px-6 py-5">
        <div className="flex items-end gap-1 justify-between">
          {padded.map((week, i) => (
            <MileageBar
              key={week?.weekKey ?? `empty-${i}`}
              week={week}
              peakKm={peakKm}
              prevKm={i > 0 && padded[i - 1] ? (padded[i - 1]!.runKm) : 0}
            />
          ))}
        </div>
        {/* Date labels */}
        <div className="flex justify-between mt-2">
          <span className="font-mono text-xs text-bone-mute">
            {padded[0] ? shortDate(padded[0].startIso) : ''}
          </span>
          <span className="font-mono text-xs text-bone-mute">
            {padded[padded.length - 1] ? shortDate(padded[padded.length - 1]!.endIso) : ''}
          </span>
        </div>
      </div>
    </section>
  );
}

function MileageBar({
  week, peakKm, prevKm,
}: {
  week: WeekMileage | null;
  peakKm: number;
  prevKm: number;
}) {
  if (!week || week.runKm === 0) {
    return (
      <div
        className="flex-1 border border-dashed border-ink-line-bold rounded-sm opacity-40"
        style={{ height: MILEAGE_BAR_PX }}
        aria-label="No runs this week"
      />
    );
  }

  const heightPx = peakKm > 0 ? Math.max(4, (week.runKm / peakKm) * MILEAGE_BAR_PX) : 4;

  let barColor = 'bg-bone-dim';
  if (prevKm > 0) {
    const ratio = week.runKm / prevKm;
    if (ratio > 1.15) barColor = 'bg-signal-miss';
    else if (ratio > 1.1) barColor = 'bg-signal-warn';
  }

  return (
    <div
      className="flex-1 flex flex-col justify-end"
      style={{ height: MILEAGE_BAR_PX }}
      title={`${week.runKm.toFixed(1)} km`}
    >
      <div
        className={`${barColor} rounded-sm`}
        style={{ height: heightPx }}
        aria-label={`${week.weekKey}: ${week.runKm.toFixed(1)} km`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3b: Rolling 28-day volume — actual vs planned (Recharts)
// ---------------------------------------------------------------------------

function RollingTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="m3-card bg-ink-shadow px-3 py-2 space-y-1">
      <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
        28d to {label ? shortDate(label) : ''}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono text-xs" style={{ color: p.color }}>
          {p.name} {p.value.toFixed(1)} km
        </p>
      ))}
    </div>
  );
}

function RollingVolumeCard({ days, hasPlan }: { days: RollingDay[]; hasPlan: boolean }) {
  const latest = days[days.length - 1];
  const delta = hasPlan && latest?.planned != null && latest.planned > 0
    ? latest.actual - latest.planned
    : null;

  return (
    <section className="m3-card" aria-label="Rolling 28-day volume">
      <div className="px-6 py-4 border-b border-ink-line flex items-center justify-between flex-wrap gap-3">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          rolling volume · 28-day window
        </span>
        <div className="flex items-center gap-4">
          <LegendSwatch color="bg-accent" label="Actual" />
          {hasPlan && <LegendSwatch color="bg-bone-dim" label="Planned" />}
          {delta !== null && (
            <span className={`font-mono text-xs ${delta >= 0 ? 'text-signal-ok' : 'text-signal-warn'}`}>
              {signedStr(delta)} km vs plan
            </span>
          )}
        </div>
      </div>

      <div className="px-2 pt-5 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={days} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              interval={13}
              tick={{ fill: '#6E6E6A', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: '#2A2A2A' }}
              tickLine={false}
            />
            <YAxis
              width={44}
              unit=""
              tick={{ fill: '#6E6E6A', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={{ stroke: '#2A2A2A' }}
              tickLine={false}
            />
            <Tooltip content={<RollingTooltip />} cursor={{ stroke: '#3A3A3A' }} />
            <Area
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#FF5F00"
              strokeWidth={2}
              fill="#FF5F00"
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3, fill: '#FF5F00' }}
              isAnimationActive={false}
            />
            {hasPlan && (
              <Line
                type="monotone"
                dataKey="planned"
                name="Planned"
                stroke="#A5A5A0"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, fill: '#A5A5A0' }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!hasPlan && (
        <div className="px-6 pb-4">
          <p className="font-mono text-xs text-bone-mute">
            No active plan — pick a dojo in{' '}
            <Link to="/dojo" className="text-accent hover:underline">Dojo</Link>{' '}
            to see planned volume alongside actual.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 4: Long Run (this week only)
// ---------------------------------------------------------------------------

function LongRunCard({ data }: { data: LongRunData }) {
  const { longRunKm, weekTotalKm, twoWeeksAgoLongKm } = data;
  const pctOfWeek = weekTotalKm > 0 ? (longRunKm / weekTotalKm) * 100 : 0;
  const delta = twoWeeksAgoLongKm > 0 ? longRunKm - twoWeeksAgoLongKm : null;

  return (
    <section className="m3-card" aria-label="Long Run">
      <div className="px-6 py-4 border-b border-ink-line">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          long run · this week
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Distance</p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display tracking-widest text-4xl leading-none text-bone">
              {longRunKm.toFixed(1)}
            </span>
            <span className="font-mono text-bone-mute text-sm">km</span>
          </div>
        </div>

        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">% of week</p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display tracking-widest text-4xl leading-none text-bone">
              {pctOfWeek.toFixed(0)}
            </span>
            <span className="font-mono text-bone-mute text-sm">%</span>
          </div>
          <p className="font-mono text-xs text-bone-mute">of {weekTotalKm.toFixed(1)} km total</p>
        </div>

        <div className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">vs 2 weeks ago</p>
          {delta !== null ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-display tracking-widest text-4xl leading-none ${
                    delta > 0 ? 'text-signal-warn' : delta < 0 ? 'text-signal-ok' : 'text-bone'
                  }`}
                >
                  {signedStr(delta)}
                </span>
                <span className="font-mono text-bone-mute text-sm">km</span>
              </div>
              <p className="font-mono text-xs text-bone-mute">
                was {twoWeeksAgoLongKm.toFixed(1)} km
              </p>
            </>
          ) : (
            <p className="font-display tracking-widest text-4xl leading-none text-bone-mute">—</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pad week arrays to a fixed length (oldest → newest)
// ---------------------------------------------------------------------------

function padWeeks(weeks: WeekIntensity[], count: number): (WeekIntensity | null)[] {
  const result: (WeekIntensity | null)[] = Array(count).fill(null);
  // Place actual weeks at the end of the array
  const start = Math.max(0, count - weeks.length);
  for (let i = 0; i < weeks.length && start + i < count; i++) {
    result[start + i] = weeks[i];
  }
  return result;
}

function padMileageWeeks(weeks: WeekMileage[], count: number): (WeekMileage | null)[] {
  const result: (WeekMileage | null)[] = Array(count).fill(null);
  const start = Math.max(0, count - weeks.length);
  for (let i = 0; i < weeks.length && start + i < count; i++) {
    result[start + i] = weeks[i];
  }
  return result;
}
