import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { pacePlan, fuelingPlan, carbLoadPlan } from '@/lib/race/execution-pure';
import type { PaceStrategy, PacePlan, FuelingPlan, CarbLoadPlan } from '@/lib/race/execution-pure';
import { taperChecklist } from '@/lib/race/taper-pure';
import type { TaperChecklistItem } from '@/lib/race/taper-pure';
import { recoveryProtocol } from '@/lib/race/post-race-pure';
import type { RecoveryProtocol } from '@/lib/race/post-race-pure';
import { blockNumberForYear, distanceLabel } from '@/lib/race/macrocycle-pure';
import type { PeriodLite } from '@/lib/race/macrocycle-pure';
import { parseHmsToSeconds } from '@/lib/race/debrief-pure';
import { formatSpk, formatDuration } from '@/lib/plans/derive';
import { heatAdjust, applyHeatToPaceSpk } from '@/lib/weather/heat-adjust-pure';
import type { HeatAdjustment } from '@/lib/weather/heat-adjust-pure';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoalRace {
  id: number;
  name: string;
  distanceKm: number;
  date: string;
  goalTime: string;
  isGoal: boolean;
  level: string;
}

interface RaceResult {
  id: number;
  raceId: number;
  finishTimeS: number | null;
  conditions: string | null;
  rpe: number | null;
  lessons: string | null;
}

interface WeatherData {
  tempMaxC: number;
  tempMinC: number;
  apparentTempMaxC: number;
  humidityPct: number;
  precipProbPct: number;
  windMaxKmh: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseGoalTimeToSeconds(goalTime: string): number | null {
  return parseHmsToSeconds(goalTime);
}

function computeDaysToRace(raceDateIso: string): number {
  const raceDate = new Date(raceDateIso + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((raceDate.getTime() - today.getTime()) / 86400000);
}

function severityColor(severity: string): string {
  if (severity === 'none') return 'text-signal-ok';
  if (severity === 'mild') return 'text-signal-warn';
  if (severity === 'moderate') return 'text-accent';
  return 'text-signal-miss';
}

function severityBadge(severity: string): string {
  const base = 'font-mono text-xs uppercase tracking-widest rounded-full px-2 py-0.5 border ';
  if (severity === 'none') return base + 'border-signal-ok text-signal-ok';
  if (severity === 'mild') return base + 'border-signal-warn text-signal-warn';
  if (severity === 'moderate') return base + 'border-accent text-accent';
  return base + 'border-signal-miss text-signal-miss';
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RacePage() {
  const { ready, error: dbError } = useDb();
  const [race, setRace] = useState<GoalRace | null | undefined>(undefined);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [periods, setPeriods] = useState<PeriodLite[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      // 1. Goal race
      const raceRows = await query(
        'SELECT id, name, distance_km, date, goal_time, is_goal, level FROM races WHERE is_goal = 1 LIMIT 1'
      );
      if (cancelled) return;

      if (raceRows.length === 0) {
        setRace(null);
        return;
      }

      const r = raceRows[0];
      const goalRace: GoalRace = {
        id: r[0] as number,
        name: r[1] as string,
        distanceKm: r[2] as number,
        date: r[3] as string,
        goalTime: r[4] as string,
        isGoal: Boolean(r[5]),
        level: r[6] as string,
      };
      setRace(goalRace);

      // 2. Race result
      const resultRows = await query(
        'SELECT id, race_id, finish_time_s, conditions, rpe, lessons FROM race_results WHERE race_id = ? LIMIT 1',
        [goalRace.id]
      );
      if (cancelled) return;
      if (resultRows.length > 0) {
        const rr = resultRows[0];
        setRaceResult({
          id: rr[0] as number,
          raceId: rr[1] as number,
          finishTimeS: rr[2] as number | null,
          conditions: rr[3] as string | null,
          rpe: rr[4] as number | null,
          lessons: rr[5] as string | null,
        });
      }

      // 3. Weight
      const weightRow = await query(
        "SELECT value FROM settings WHERE key = 'profile.weight_kg'"
      );
      if (cancelled) return;
      if (weightRow.length > 0 && weightRow[0][0]) {
        const w = parseFloat(weightRow[0][0] as string);
        if (isFinite(w)) setWeightKg(w);
      }

      // 4. Plan periods for macrocycle
      const periodRows = await query(
        'SELECT p.params_json, pp.start_date FROM plan_periods pp JOIN plans p ON p.id = pp.plan_id'
      );
      if (cancelled) return;
      const parsedPeriods: PeriodLite[] = periodRows.map((row) => {
        let goalDist: number | null = null;
        try {
          const params = JSON.parse(row[0] as string);
          if (typeof params.goalDistanceKm === 'number') goalDist = params.goalDistanceKm;
        } catch {
          // ignore
        }
        return { startDate: row[1] as string, goalDistanceKm: goalDist };
      });
      setPeriods(parsedPeriods);
    }

    load();
    return () => { cancelled = true; };
  }, [ready]);

  // Fetch weather when race is within window
  useEffect(() => {
    if (!race) return;
    const daysToRace = computeDaysToRace(race.date);
    if (daysToRace < 0 || daysToRace > 16) return;

    setWeatherLoading(true);
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-36.8485&longitude=174.7633' +
      '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,windspeed_10m_max' +
      '&hourly=relativehumidity_2m&timezone=Pacific%2FAuckland&forecast_days=1'
    )
      .then((res) => res.json())
      .then((data) => {
        const daily = data.daily;
        const hourly = data.hourly;
        const humidityHours: number[] = hourly?.relativehumidity_2m ?? [];
        const daySlice = humidityHours.slice(6, 18);
        const humidityPct =
          daySlice.length > 0
            ? daySlice.reduce((s: number, v: number) => s + v, 0) / daySlice.length
            : 60;

        setWeather({
          tempMaxC: daily?.temperature_2m_max?.[0] ?? 20,
          tempMinC: daily?.temperature_2m_min?.[0] ?? 12,
          apparentTempMaxC: daily?.apparent_temperature_max?.[0] ?? 20,
          humidityPct: Math.round(humidityPct),
          precipProbPct: daily?.precipitation_probability_max?.[0] ?? 0,
          windMaxKmh: daily?.windspeed_10m_max?.[0] ?? 0,
        });
      })
      .catch(() => {
        // Weather is non-critical; silently skip on error
      })
      .finally(() => setWeatherLoading(false));
  }, [race]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || race === undefined) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <header className="border-b border-ink-line pb-6 space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">ghost · race</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Race</h1>
      </header>

      {race === null ? (
        <NoGoalRace />
      ) : (
        <RaceDashboard
          race={race}
          raceResult={raceResult}
          weightKg={weightKg}
          periods={periods}
          weather={weather}
          weatherLoading={weatherLoading}
          onResultSaved={(updated) => setRaceResult(updated)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NoGoalRace() {
  return (
    <div className="m3-card p-6 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">goal race</p>
      <p className="font-display text-2xl tracking-widest uppercase text-bone">No goal race set.</p>
      <p className="font-mono text-sm text-bone-dim leading-relaxed">
        Set a goal race in your calendar to see pacing, fuelling, and taper plans here.
      </p>
      <Link
        to="/calendar"
        className="inline-block font-mono text-xs uppercase tracking-widest text-accent hover:text-accent-hover transition-colors"
      >
        Go to Calendar →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — assembled from cards
// ---------------------------------------------------------------------------

interface DashboardProps {
  race: GoalRace;
  raceResult: RaceResult | null;
  weightKg: number | null;
  periods: PeriodLite[];
  weather: WeatherData | null;
  weatherLoading: boolean;
  onResultSaved: (r: RaceResult) => void;
}

function RaceDashboard({
  race,
  raceResult,
  weightKg,
  periods,
  weather,
  weatherLoading,
  onResultSaved,
}: DashboardProps) {
  const daysToRace = computeDaysToRace(race.date);
  const targetTimeS = parseGoalTimeToSeconds(race.goalTime) ?? 0;
  const isTaper = daysToRace > 0 && daysToRace <= 21;
  const isPostRace = daysToRace <= 0;
  const showWeather = daysToRace >= 0 && daysToRace <= 16;

  return (
    <>
      <RaceHeaderCard race={race} daysToRace={daysToRace} />

      {showWeather && (
        <WeatherCard weather={weather} loading={weatherLoading} goalSpk={targetTimeS / race.distanceKm} />
      )}

      {!isPostRace && targetTimeS > 0 && (
        <>
          <PacePlanCard distanceKm={race.distanceKm} targetTimeS={targetTimeS} />
          <FuelingCard targetTimeS={targetTimeS} />
          <CarbLoadCard weightKg={weightKg} />
        </>
      )}

      {isTaper && (
        <TaperCard daysToRace={daysToRace} />
      )}

      {isPostRace && (
        <PostRaceCard
          race={race}
          daysSinceRace={Math.abs(daysToRace)}
          raceResult={raceResult}
          onResultSaved={onResultSaved}
        />
      )}

      <MacrocycleCard
        periods={periods}
        distanceKm={race.distanceKm}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card 1: Race header
// ---------------------------------------------------------------------------

function RaceHeaderCard({ race, daysToRace }: { race: GoalRace; daysToRace: number }) {
  const isRaceDay = daysToRace === 0;
  const isFuture = daysToRace > 0;
  const isPast = daysToRace < 0;

  return (
    <div className="m3-card p-6 space-y-4">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">goal race</p>
      <h2 className="font-display text-3xl sm:text-4xl tracking-widest uppercase text-bone leading-none">
        {race.name}
      </h2>
      <p className="font-mono text-sm text-bone-dim">
        {race.distanceKm}km &middot; {race.goalTime}
      </p>

      <div className="pt-2">
        {isRaceDay && (
          <p className="font-display text-5xl tracking-widest uppercase text-accent leading-none">
            Race day!
          </p>
        )}
        {isFuture && (
          <div className="flex items-baseline gap-3">
            <span className="font-display text-6xl tracking-widest leading-none text-accent">
              {daysToRace}
            </span>
            <span className="font-mono text-sm text-bone-mute uppercase tracking-widest">
              days to go
            </span>
          </div>
        )}
        {isPast && (
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl tracking-widest leading-none text-bone-dim">
              {Math.abs(daysToRace)}
            </span>
            <span className="font-mono text-sm text-bone-mute uppercase tracking-widest">
              days since race
            </span>
          </div>
        )}
      </div>

      <p className="font-mono text-xs text-bone-mute">
        {new Date(race.date + 'T00:00:00Z').toLocaleDateString('en-NZ', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        })}
        {race.level && ` · ${race.level}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 2: Weather
// ---------------------------------------------------------------------------

function WeatherCard({
  weather,
  loading,
  goalSpk,
}: {
  weather: WeatherData | null;
  loading: boolean;
  goalSpk: number;
}) {
  if (loading) {
    return (
      <div className="m3-card p-6 animate-pulse space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">race day weather</p>
        <div className="h-6 w-48 bg-ink-line rounded" />
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="m3-card p-6 space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">race day weather</p>
        <p className="font-mono text-sm text-bone-mute">Weather data unavailable.</p>
      </div>
    );
  }

  const conditions = { tempC: weather.tempMaxC, humidityPct: weather.humidityPct };
  const adjustment: HeatAdjustment = heatAdjust(conditions);
  const adjustedSpk = applyHeatToPaceSpk(goalSpk, conditions);

  return (
    <div className="m3-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">race day weather</p>
        <span className={severityBadge(adjustment.severity)}>{adjustment.severity}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-ink-line m3-card">
        <WeatherStat label="max temp" value={`${weather.tempMaxC}°C`} />
        <WeatherStat label="min temp" value={`${weather.tempMinC}°C`} />
        <WeatherStat label="feels like" value={`${weather.apparentTempMaxC}°C`} />
        <WeatherStat label="humidity" value={`${weather.humidityPct}%`} />
        <WeatherStat label="wind" value={`${Math.round(weather.windMaxKmh)} km/h`} />
      </div>

      {weather.precipProbPct > 0 && (
        <p className="font-mono text-xs text-bone-mute">
          Rain probability: {weather.precipProbPct}%
        </p>
      )}

      <p className={`font-mono text-xs leading-relaxed ${severityColor(adjustment.severity)}`}>
        {adjustment.advisory}
      </p>

      {adjustment.severity !== 'none' && goalSpk > 0 && (
        <div className="m3-card p-4 space-y-1">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">heat-adjusted pace</p>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl tracking-widest text-accent">
              {formatSpk(adjustedSpk)}
            </span>
            <span className="font-mono text-xs text-bone-mute">/km</span>
            <span className="font-mono text-xs text-bone-mute">
              (+{adjustment.paceAdjustPct.toFixed(1)}% slower than target)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function WeatherStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink p-4 space-y-1">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{label}</p>
      <p className="font-mono text-sm text-bone">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3: Pace Plans
// ---------------------------------------------------------------------------

const STRATEGIES: PaceStrategy[] = ['even', 'negative', 'progressive'];

function PacePlanCard({
  distanceKm,
  targetTimeS,
}: {
  distanceKm: number;
  targetTimeS: number;
}) {
  const [activeStrategy, setActiveStrategy] = useState<PaceStrategy>('even');

  const plans: Record<PaceStrategy, PacePlan> = {
    even: pacePlan(distanceKm, targetTimeS, 'even'),
    negative: pacePlan(distanceKm, targetTimeS, 'negative'),
    progressive: pacePlan(distanceKm, targetTimeS, 'progressive'),
  };

  const plan = plans[activeStrategy];

  return (
    <div className="m3-card p-6 space-y-4">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">pace plan</p>

      {/* Strategy tabs */}
      <div className="flex gap-0 m3-card w-fit">
        {STRATEGIES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStrategy(s)}
            className={`font-mono text-xs uppercase tracking-widest rounded-full px-4 py-2 transition-colors ${
              activeStrategy === s
                ? 'bg-accent text-bone'
                : 'text-bone-mute hover:text-bone hover:bg-ink-panel'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl tracking-widest text-accent">
          {formatSpk(plan.goalPaceSpk)}
        </span>
        <span className="font-mono text-xs text-bone-mute">/km goal pace</span>
        <span className="font-mono text-xs text-bone-mute">·</span>
        <span className="font-mono text-sm text-bone">{formatDuration(plan.totalTimeS)}</span>
      </div>

      {/* Segment table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-ink-line">
              <th className="font-mono text-xs text-bone-mute uppercase tracking-widest py-2 pr-4 whitespace-nowrap">Split</th>
              <th className="font-mono text-xs text-bone-mute uppercase tracking-widest py-2 pr-4 whitespace-nowrap">Pace/km</th>
              <th className="font-mono text-xs text-bone-mute uppercase tracking-widest py-2 pr-4 whitespace-nowrap">Segment</th>
              <th className="font-mono text-xs text-bone-mute uppercase tracking-widest py-2 whitespace-nowrap">Elapsed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-line">
            {plan.segments.map((seg, i) => (
              <tr key={i} className="hover:bg-ink-shadow transition-colors">
                <td className="font-mono tabular-nums text-xs text-bone py-2 pr-4 whitespace-nowrap">
                  {seg.fromKm}–{seg.toKm} km
                </td>
                <td className="font-mono tabular-nums text-xs text-bone py-2 pr-4 whitespace-nowrap">
                  {formatSpk(seg.paceSpk)}/km
                </td>
                <td className="font-mono tabular-nums text-xs text-bone-dim py-2 pr-4 whitespace-nowrap">
                  {formatDuration(seg.segmentTimeS)}
                </td>
                <td className="font-mono tabular-nums text-xs text-bone-dim py-2 whitespace-nowrap">
                  {formatDuration(seg.cumulativeTimeS)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 4: Fueling
// ---------------------------------------------------------------------------

function FuelingCard({ targetTimeS }: { targetTimeS: number }) {
  const plan: FuelingPlan = fuelingPlan(targetTimeS);

  return (
    <div className="m3-card p-6 space-y-4">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">race-day fueling</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink-line m3-card">
        <FuelStat label="carbs/hr" value={`${plan.carbsPerHrG}g`} />
        <FuelStat label="fluid/hr" value={`${plan.fluidMlPerHr}ml`} />
        <FuelStat label="sodium/hr" value={`${plan.sodiumMgPerHr}mg`} />
        <FuelStat label="total carbs" value={`${plan.totalCarbsG}g`} />
        <FuelStat label="gel count" value={`${plan.gelCount}`} unit="× 25g gels" />
        <FuelStat label="gel interval" value={`${plan.gelIntervalMin}min`} unit="between gels" />
      </div>
    </div>
  );
}

function FuelStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-ink p-4 space-y-1">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{label}</p>
      <p className="font-display text-2xl tracking-widest text-bone leading-none">{value}</p>
      {unit && <p className="font-mono text-xs text-bone-mute">{unit}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 5: Carb Load
// ---------------------------------------------------------------------------

function CarbLoadCard({ weightKg }: { weightKg: number | null }) {
  if (weightKg === null) {
    return (
      <div className="m3-card p-6 space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">carb load plan</p>
        <p className="font-mono text-sm text-bone-mute leading-relaxed">
          Add weight in Profile to see carb-load plan.
        </p>
        <Link
          to="/profile"
          className="inline-block font-mono text-xs text-bone-dim hover:text-accent transition-colors"
        >
          Open Profile →
        </Link>
      </div>
    );
  }

  const plan: CarbLoadPlan = carbLoadPlan(weightKg);

  return (
    <div className="m3-card p-6 space-y-4">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">carb load plan</p>

      <div className="grid grid-cols-3 gap-px bg-ink-line m3-card">
        {plan.days.map((day) => (
          <div key={day.daysOut} className="bg-ink p-4 space-y-1">
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
              {day.daysOut} out
            </p>
            <p className="font-display text-3xl tracking-widest text-accent leading-none">
              {day.gramsCarb}g
            </p>
            <p className="font-mono text-xs text-bone-mute">
              ~{day.approxCalories} kcal
            </p>
          </div>
        ))}
      </div>

      <p className="font-mono text-xs text-bone-dim leading-relaxed">{plan.guidance}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 6: Taper
// ---------------------------------------------------------------------------

function TaperCard({ daysToRace }: { daysToRace: number }) {
  const checklist: TaperChecklistItem[] = taperChecklist(daysToRace);

  return (
    <div className="m3-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">taper</p>
        <span className="font-mono text-xs text-accent uppercase tracking-widest">
          {daysToRace}d to race
        </span>
      </div>

      <div className="space-y-4">
        {checklist.map((item) => (
          <div key={item.key} className="border-l-2 border-accent pl-4 space-y-1">
            <p className="font-mono text-sm text-bone uppercase tracking-wide">{item.title}</p>
            <p className="font-mono text-xs text-bone-dim leading-relaxed">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 7: Post-Race + Debrief
// ---------------------------------------------------------------------------

interface PostRaceCardProps {
  race: GoalRace;
  daysSinceRace: number;
  raceResult: RaceResult | null;
  onResultSaved: (r: RaceResult) => void;
}

function PostRaceCard({ race, daysSinceRace, raceResult, onResultSaved }: PostRaceCardProps) {
  const protocol: RecoveryProtocol = recoveryProtocol(daysSinceRace, race.distanceKm);

  const [finishTime, setFinishTime] = useState(
    raceResult?.finishTimeS != null ? secondsToHms(raceResult.finishTimeS) : ''
  );
  const [rpe, setRpe] = useState(raceResult?.rpe != null ? String(raceResult.rpe) : '');
  const [conditions, setConditions] = useState(raceResult?.conditions ?? '');
  const [lessons, setLessons] = useState(raceResult?.lessons ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);

    const finishTimeS = finishTime ? parseHmsToSeconds(finishTime.trim()) : null;
    if (finishTime.trim() && finishTimeS === null) {
      setSaveError('Finish time must be H:MM:SS or MM:SS');
      return;
    }

    const rpeNum = rpe ? parseInt(rpe, 10) : null;
    if (rpe && (isNaN(rpeNum!) || rpeNum! < 1 || rpeNum! > 10)) {
      setSaveError('RPE must be 1–10');
      return;
    }

    setSaving(true);
    try {
      if (raceResult) {
        await exec(
          'UPDATE race_results SET finish_time_s=?, conditions=?, rpe=?, lessons=?, updated_at=datetime("now") WHERE id=?',
          [finishTimeS, conditions || null, rpeNum, lessons || null, raceResult.id]
        );
        onResultSaved({
          ...raceResult,
          finishTimeS: finishTimeS,
          conditions: conditions || null,
          rpe: rpeNum,
          lessons: lessons || null,
        });
      } else {
        await exec(
          'INSERT INTO race_results (race_id, finish_time_s, conditions, rpe, lessons) VALUES (?,?,?,?,?)',
          [race.id, finishTimeS, conditions || null, rpeNum, lessons || null]
        );
        onResultSaved({
          id: 0,
          raceId: race.id,
          finishTimeS: finishTimeS,
          conditions: conditions || null,
          rpe: rpeNum,
          lessons: lessons || null,
        });
      }
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="m3-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">post-race recovery</p>
        <span className="font-mono text-xs text-bone-mute">
          day {daysSinceRace} since race
        </span>
      </div>

      {/* Recovery phases */}
      <div className="space-y-3">
        {protocol.phases.map((phase) => (
          <div
            key={phase.index}
            className={`border p-4 space-y-1 transition-colors ${
              phase.active
                ? 'border-accent bg-ink-shadow'
                : 'border-ink-line'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`font-mono text-xs uppercase tracking-widest ${
                phase.active ? 'text-accent' : 'text-bone-mute'
              }`}>
                phase {phase.index}/{phase.totalPhases} · {phase.label}
              </p>
              <p className="font-mono text-xs text-bone-mute">{phase.dayRange}</p>
            </div>
            {phase.active && (
              <p className="font-mono text-xs text-bone-dim leading-relaxed">{phase.guidance}</p>
            )}
          </div>
        ))}
        {protocol.currentIndex === null && (
          <p className="font-mono text-xs text-signal-ok">Recovery window complete. Return to full training.</p>
        )}
      </div>

      {/* Debrief form */}
      <div className="border-t border-ink-line pt-6 space-y-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">race debrief</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest block" htmlFor="finish-time">
                Finish time
              </label>
              <input
                id="finish-time"
                type="text"
                placeholder="H:MM:SS"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone placeholder-bone-mute focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest block" htmlFor="rpe">
                RPE (1–10)
              </label>
              <input
                id="rpe"
                type="number"
                min="1"
                max="10"
                placeholder="7"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone placeholder-bone-mute focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-mono text-xs text-bone-mute uppercase tracking-widest block" htmlFor="conditions">
              Conditions
            </label>
            <input
              id="conditions"
              type="text"
              placeholder="Hot and humid, headwind on return leg"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone placeholder-bone-mute focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="font-mono text-xs text-bone-mute uppercase tracking-widest block" htmlFor="lessons">
              Lessons
            </label>
            <textarea
              id="lessons"
              rows={4}
              placeholder="What worked, what to change next time..."
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone placeholder-bone-mute focus:outline-none focus:border-accent transition-colors resize-y"
            />
          </div>

          {saveError && (
            <p className="font-mono text-xs text-signal-miss">{saveError}</p>
          )}
          {saved && (
            <p className="font-mono text-xs text-signal-ok">Debrief saved.</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="font-mono text-xs uppercase tracking-widest rounded-full px-6 py-2 m3-btn-outline text-accent hover:bg-accent hover:text-bone transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : raceResult ? 'Update debrief' : 'Save debrief'}
          </button>
        </form>
      </div>
    </div>
  );
}

function secondsToHms(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Card 8: Macrocycle
// ---------------------------------------------------------------------------

function MacrocycleCard({
  periods,
  distanceKm,
}: {
  periods: PeriodLite[];
  distanceKm: number;
}) {
  if (periods.length === 0) return null;

  const year = new Date().getUTCFullYear();
  const blockCount = blockNumberForYear(periods, year, distanceKm);

  if (blockCount < 2) return null;

  const label = distanceLabel(distanceKm);

  return (
    <div className="m3-card p-6 space-y-2">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">macrocycle</p>
      <p className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        {blockCount === 2 && '2nd'}
        {blockCount === 3 && '3rd'}
        {blockCount > 3 && `${blockCount}th`}
        {' '}{label} block this year
      </p>
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        You have run {blockCount} {label} training blocks in {year}.
      </p>
    </div>
  );
}
