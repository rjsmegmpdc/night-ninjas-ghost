import { useState, useEffect } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query } from '@/db/client';
import { monthlyVolume, zoneDistribution, type MonthVolume } from '@/lib/analysis/trends-pure';
import { CTL_TIME_CONSTANT, ATL_TIME_CONSTANT, WINDOW_DAYS } from '@/lib/analysis/athlete-state-pure';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Raw positional row from query() — columns by index
type RawRow = unknown[];

type Zone5 = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';

interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
}

interface ReconData {
  // Card 1
  monthlyVols: MonthVolume[];
  // Card 2
  zoneMinutes: Record<Zone5, number>;
  zonePct: Record<Zone5, number>;
  zoneTotalMin: number;
  zoneActivityCount: number;
  // Card 3
  fitnessSeries: FitnessPoint[];
  todayCtl: number;
  todayAtl: number;
  todayTsb: number;
  totalActivityCount: number;
}

// ---------------------------------------------------------------------------
// Zone classifier (pace-based fallback)
// ---------------------------------------------------------------------------

function classifyZone(avgSpeedMs: number): Zone5 {
  if (avgSpeedMs < 2.5) return 'easy';
  if (avgSpeedMs < 3.0) return 'marathon';
  if (avgSpeedMs < 3.5) return 'threshold';
  if (avgSpeedMs < 4.2) return 'interval';
  return 'repetition';
}

// ---------------------------------------------------------------------------
// EWMA series builder — single pass, produces array for the chart
// ---------------------------------------------------------------------------

function buildEwmaSeries(
  dailyLoads: Map<string, number>,
  startIso: string,
  endIso: string,
  tau: number
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  let ewma = 0;
  const k = 1 / tau;
  const decay = 1 - k;
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const load = dailyLoads.get(iso) ?? 0;
    ewma = load * k + ewma * decay;
    result.push({ date: iso, value: ewma });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Date helpers (UTC-anchored)
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(isoOrDate: string | Date, n: number): Date {
  const d = typeof isoOrDate === 'string'
    ? new Date(isoOrDate + 'T00:00:00Z')
    : new Date(isoOrDate.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(yyyymm: string): string {
  const month = parseInt(yyyymm.slice(5, 7), 10) - 1;
  return MONTH_NAMES[month] ?? yyyymm;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadReconData(): Promise<ReconData> {
  const now = new Date();
  const todayIso = isoDate(now);

  // Card 1: 6-month window
  const sixMonthsAgo = new Date(now.getTime());
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
  const sixMonthsAgoIso = isoDate(sixMonthsAgo);

  // Card 2: 28-day window
  const twentyEightDaysAgo = isoDate(addDays(now, -28));

  // Card 3: 98-day window (42-day warmup + 56-day display)
  const ninetyEightDaysAgo = isoDate(addDays(now, -98));
  const displayStart = isoDate(addDays(now, -WINDOW_DAYS));

  // --- Query 1: monthly volume ---
  const volRows: RawRow[] = await query(
    'SELECT start_date, distance FROM activities WHERE start_date >= ? ORDER BY start_date ASC',
    [sixMonthsAgoIso]
  );

  const volSamples = volRows.map((r) => ({
    dateIso: String(r[0]),
    km: Number(r[1]) / 1000,
  }));
  const monthlyVols = monthlyVolume(volSamples, todayIso, 6);

  // --- Query 2: zone distribution (28 days) ---
  const zoneRows: RawRow[] = await query(
    `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed
     FROM activities WHERE start_date >= ? ORDER BY start_date ASC`,
    [twentyEightDaysAgo]
  );

  const zoneActivities = zoneRows.map((r) => ({
    moving_time: Number(r[2]),
    average_speed: Number(r[5] ?? 0),
  }));

  const zoneInputs = zoneActivities.map((a) => ({
    zone: classifyZone(a.average_speed) as Zone5,
    minutes: a.moving_time / 60,
    confidence: 'pace-only' as const,
  }));
  const zoneDist = zoneDistribution(zoneInputs);

  // --- Query 3: fitness/fatigue (98 days) ---
  const fitnessRows: RawRow[] = await query(
    `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed
     FROM activities WHERE start_date >= ? ORDER BY start_date ASC`,
    [ninetyEightDaysAgo]
  );

  const fitnessActivities = fitnessRows.map((r) => ({
    start_date: String(r[0]).slice(0, 10),
    distance: Number(r[1]),
    moving_time: Number(r[2]),
  }));

  // Build daily load map: load = (distance_km) × (moving_time_hours)
  const dailyLoads = new Map<string, number>();
  for (const a of fitnessActivities) {
    const dateKey = a.start_date.slice(0, 10);
    const load = (a.distance / 1000) * (a.moving_time / 3600);
    dailyLoads.set(dateKey, (dailyLoads.get(dateKey) ?? 0) + load);
  }

  // Build CTL and ATL series over the full 98-day span, then slice to display window
  const fullCtlSeries = buildEwmaSeries(dailyLoads, ninetyEightDaysAgo, todayIso, CTL_TIME_CONSTANT);
  const fullAtlSeries = buildEwmaSeries(dailyLoads, ninetyEightDaysAgo, todayIso, ATL_TIME_CONSTANT);

  // Build index for ATL lookup
  const atlByDate = new Map<string, number>();
  for (const p of fullAtlSeries) atlByDate.set(p.date, p.value);

  // Scale factor × 10 for readability
  const SCALE = 10;
  const fitnessSeries: FitnessPoint[] = fullCtlSeries
    .filter((p) => p.date >= displayStart)
    .map((p) => ({
      date: p.date,
      ctl: p.value * SCALE,
      atl: (atlByDate.get(p.date) ?? 0) * SCALE,
    }));

  const lastCtl = fitnessSeries.length > 0 ? fitnessSeries[fitnessSeries.length - 1].ctl : 0;
  const lastAtl = fitnessSeries.length > 0 ? fitnessSeries[fitnessSeries.length - 1].atl : 0;
  const todayTsb = lastCtl - lastAtl;

  return {
    monthlyVols,
    zoneMinutes: zoneDist.minutes,
    zonePct: zoneDist.pct,
    zoneTotalMin: zoneDist.totalMin,
    zoneActivityCount: zoneActivities.length,
    fitnessSeries,
    todayCtl: lastCtl,
    todayAtl: lastAtl,
    todayTsb,
    totalActivityCount: volRows.length,
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ReconPage() {
  const { ready } = useDb();
  const [data, setData] = useState<ReconData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadReconData()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [ready]);

  if (!ready || (!data && !error)) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="space-y-2 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost · Intelligence</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">
          Recon
        </h1>
        <p className="font-mono text-xs text-bone-mute max-w-2xl leading-relaxed">
          Trends from your activity data. Compliance analysis unlocks once a training plan is set up in Dojo.
        </p>
      </header>

      {error && (
        <div className="border border-signal-miss p-4">
          <p className="font-mono text-xs text-signal-miss">Error loading data: {error}</p>
        </div>
      )}

      {data && data.totalActivityCount < 7 ? (
        <InsufficientDataState />
      ) : data ? (
        <>
          <MonthlyVolumeCard months={data.monthlyVols} />
          <ZoneDistributionCard
            pct={data.zonePct}
            minutes={data.zoneMinutes}
            totalMin={data.zoneTotalMin}
            activityCount={data.zoneActivityCount}
          />
          <FitnessFatigueCard
            series={data.fitnessSeries}
            ctl={data.todayCtl}
            atl={data.todayAtl}
            tsb={data.todayTsb}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insufficient data state
// ---------------------------------------------------------------------------

function InsufficientDataState() {
  return (
    <div className="border border-ink-line p-8 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">recon · no data</p>
      <p className="font-mono text-sm text-bone-dim max-w-xl leading-relaxed">
        Not enough data yet — sync more activities in Setup.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1: Monthly Volume
// ---------------------------------------------------------------------------

function MonthlyVolumeCard({ months }: { months: MonthVolume[] }) {
  const maxKm = Math.max(...months.map((m) => m.km), 1);
  const latest = months.length > 0 ? months[months.length - 1] : null;

  return (
    <section className="border border-ink-line p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            Monthly Volume
          </p>
          <p className="font-mono text-xs text-bone-mute">Last 6 months · km</p>
        </div>
        {latest && latest.deltaPct !== null && (
          <div className={`font-display tracking-widest text-2xl leading-none ${
            latest.deltaPct >= 0 ? 'text-signal-ok' : 'text-signal-miss'
          }`}>
            {latest.deltaPct >= 0 ? '+' : ''}{latest.deltaPct}%
          </div>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-32">
        {months.map((m) => {
          const heightPct = maxKm > 0 ? (m.km / maxKm) * 100 : 0;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1">
              <span className="font-mono text-xs text-bone-mute tabular-nums leading-none">
                {m.km > 0 ? m.km.toFixed(0) : '—'}
              </span>
              <div className="w-full relative" style={{ height: '80px' }}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-accent transition-all"
                  style={{ height: `${Math.max(heightPct, m.km > 0 ? 4 : 0)}%` }}
                  role="presentation"
                />
              </div>
              <span className="font-mono text-xs text-bone-mute">{monthLabel(m.month)}</span>
            </div>
          );
        })}
      </div>

      {/* Delta callout */}
      {latest && (
        <div className="pt-2 border-t border-ink-line">
          <p className="font-mono text-xs text-bone-dim">
            {latest.deltaKm !== null
              ? `${latest.deltaKm >= 0 ? '+' : ''}${latest.deltaKm.toFixed(0)} km vs previous month`
              : 'First month in window'}
            {' — '}
            <span className="text-bone-mute">
              {latest.km.toFixed(1)} km this month
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 2: Zone Distribution
// ---------------------------------------------------------------------------

const ZONE_LABELS: Record<Zone5, string> = {
  easy: 'Easy',
  marathon: 'Marathon',
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Rep',
};

// Map zone names to GHOST accent tokens (closest available)
const ZONE_COLORS: Record<Zone5, string> = {
  easy:       'bg-signal-ok',        // green-ish (#26D0AE)
  marathon:   'bg-accent-hover',     // warm orange-yellow (#FF7A2B)
  threshold:  'bg-signal-warn',      // amber (#EAB308)
  interval:   'bg-accent',           // orange (#FF5F00)
  repetition: 'bg-signal-miss',      // red (#DC2626)
};

const ZONE_TEXT_COLORS: Record<Zone5, string> = {
  easy:       'text-signal-ok',
  marathon:   'text-accent-hover',
  threshold:  'text-signal-warn',
  interval:   'text-accent',
  repetition: 'text-signal-miss',
};

const ZONES_ORDER: Zone5[] = ['easy', 'marathon', 'threshold', 'interval', 'repetition'];

function ZoneDistributionCard({
  pct, minutes, totalMin, activityCount,
}: {
  pct: Record<Zone5, number>;
  minutes: Record<Zone5, number>;
  totalMin: number;
  activityCount: number;
}) {
  const totalHours = Math.floor(totalMin / 60);
  const totalMins = Math.round(totalMin % 60);

  return (
    <section className="border border-ink-line p-6 space-y-4">
      <div>
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
          Zone Distribution
        </p>
        <p className="font-mono text-xs text-bone-mute">
          Last 28 days · {activityCount} activities ·{' '}
          {totalHours > 0 ? `${totalHours}h ` : ''}{totalMins}m total
        </p>
      </div>

      {totalMin === 0 ? (
        <p className="font-mono text-xs text-bone-mute">No activities in the last 28 days.</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div
            className="flex h-8 w-full overflow-hidden rounded-sm"
            role="img"
            aria-label="Zone distribution bar"
          >
            {ZONES_ORDER.map((z) => {
              const w = pct[z];
              if (w === 0) return null;
              return (
                <div
                  key={z}
                  className={`${ZONE_COLORS[z]} h-full`}
                  style={{ width: `${w}%` }}
                  title={`${ZONE_LABELS[z]}: ${w}%`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ZONES_ORDER.map((z) => (
              <div key={z} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${ZONE_COLORS[z]}`} />
                <span className={`font-mono text-xs ${pct[z] > 0 ? ZONE_TEXT_COLORS[z] : 'text-bone-mute'}`}>
                  {ZONE_LABELS[z]}
                </span>
                <span className="font-mono text-xs text-bone-mute tabular-nums">
                  {pct[z]}% · {Math.round(minutes[z])}m
                </span>
              </div>
            ))}
          </div>

          {/* Caveat */}
          <p className="font-mono text-xs text-bone-mute leading-relaxed border-t border-ink-line pt-3">
            Zone classification is estimated from pace. Set your max HR in Profile for HR-based zones.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 3: Fitness / Fatigue (CTL / ATL)
// ---------------------------------------------------------------------------

function formBadge(tsb: number): { label: string; classes: string } {
  if (tsb > 25)  return { label: 'Fresh',    classes: 'text-signal-ok border-signal-ok' };
  if (tsb > 10)  return { label: 'On Form',  classes: 'text-signal-ok border-signal-ok' };
  if (tsb >= -10) return { label: 'Neutral',  classes: 'text-bone-dim border-ink-line' };
  if (tsb >= -25) return { label: 'Loaded',   classes: 'text-signal-warn border-signal-warn' };
  return            { label: 'Fatigued', classes: 'text-signal-miss border-signal-miss' };
}

function FitnessFatigueCard({
  series, ctl, atl, tsb,
}: {
  series: FitnessPoint[];
  ctl: number;
  atl: number;
  tsb: number;
}) {
  const badge = formBadge(tsb);

  // SVG chart dimensions
  const W = 400;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 8, left: 8 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Y scale: use max of all CTL and ATL values
  const allValues = series.flatMap((p) => [p.ctl, p.atl]);
  const maxVal = Math.max(...allValues, 1);

  function toX(i: number): number {
    return PAD.left + (series.length <= 1 ? 0 : (i / (series.length - 1)) * chartW);
  }
  function toY(v: number): number {
    return PAD.top + chartH - (v / maxVal) * chartH;
  }

  function polyline(getter: (p: FitnessPoint) => number): string {
    return series.map((p, i) => `${toX(i).toFixed(1)},${toY(getter(p)).toFixed(1)}`).join(' ');
  }

  const ctlPoints = polyline((p) => p.ctl);
  const atlPoints = polyline((p) => p.atl);

  return (
    <section className="border border-ink-line p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            Fitness / Fatigue
          </p>
          <p className="font-mono text-xs text-bone-mute">Last 8 weeks · CTL vs ATL</p>
        </div>
        <div className={`border px-3 py-1 font-mono text-xs uppercase tracking-widest ${badge.classes}`}>
          {badge.label}
        </div>
      </div>

      {series.length === 0 ? (
        <p className="font-mono text-xs text-bone-mute">Not enough data to build fitness chart.</p>
      ) : (
        <>
          {/* SVG line chart */}
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ maxHeight: '120px' }}
              aria-label="CTL and ATL fitness/fatigue chart"
              role="img"
            >
              {/* Zero baseline */}
              <line
                x1={PAD.left} y1={PAD.top + chartH}
                x2={PAD.left + chartW} y2={PAD.top + chartH}
                stroke="#2A2A2A" strokeWidth="1"
              />
              {/* ATL — dashed */}
              <polyline
                points={atlPoints}
                fill="none"
                stroke="#FF5F00"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* CTL — solid */}
              <polyline
                points={ctlPoints}
                fill="none"
                stroke="#26D0AE"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Legend and today's numbers */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="20" y2="1" stroke="#26D0AE" strokeWidth="2" />
              </svg>
              <span className="font-mono text-xs text-signal-ok">
                Fitness (CTL) {ctl.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="20" y2="1" stroke="#FF5F00" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              <span className="font-mono text-xs text-accent">
                Fatigue (ATL) {atl.toFixed(1)}
              </span>
            </div>
            <div className="font-mono text-xs text-bone-mute">
              Form (TSB) {tsb >= 0 ? '+' : ''}{tsb.toFixed(1)}
            </div>
          </div>

          <p className="font-mono text-xs text-bone-mute leading-relaxed border-t border-ink-line pt-3">
            CTL = 42-day fitness load. ATL = 7-day fatigue load. TSB = form (CTL − ATL). Values are
            pace-derived proxies — connect HR data in Profile for improved accuracy.
          </p>
        </>
      )}
    </section>
  );
}
