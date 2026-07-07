import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Check, ChevronLeft } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';
import { ENGINES, type Dojo } from '@/lib/plans/index';
import { emptyWeekContext, type PlanParams, type WeekContext, type WeekEvent } from '@/lib/plans/types';

// ---------------------------------------------------------------------------
// Dojo metadata
// ---------------------------------------------------------------------------

type Level = 'beginner' | 'intermediate' | 'advanced';

interface DojoMeta {
  slug: string;
  name: string;
  tagline: string;
  weeks: number;
  features: string[];
}

const DOJOS: DojoMeta[] = [
  {
    slug: 'norwegian-singles',
    name: 'Norwegian Singles',
    tagline: 'Polarised HR-gated training',
    weeks: 16,
    features: ['Sub-threshold quality twice weekly', 'Easy HR cap enforced', 'High volume base'],
  },
  {
    slug: 'hansons',
    name: 'Hansons',
    tagline: 'Cumulative fatigue method',
    weeks: 18,
    features: ['High weekly volume', 'No taper week', 'Cumulative fatigue sessions'],
  },
  {
    slug: 'pfitzinger',
    name: 'Pfitzinger',
    tagline: 'High-performance periodisation',
    weeks: 18,
    features: ['Lactate threshold runs', 'Medium-long runs', 'Recovery emphasis'],
  },
  {
    slug: 'daniels',
    name: 'Daniels',
    tagline: 'VDOT-based quality work',
    weeks: 18,
    features: ['E/M/T/I/R session types', 'Pace-zone structure', 'Periodised quality'],
  },
  {
    slug: 'lydiard',
    name: 'Lydiard',
    tagline: 'Aerobic base first',
    weeks: 20,
    features: ['Long base-building phase', 'Anaerobic sharpening', 'Peak and coordination'],
  },
  {
    slug: 'higdon',
    name: 'Higdon',
    tagline: 'Accessible progressive plan',
    weeks: 16,
    features: ['3 runs per week minimum', 'Weekend long run', 'Race-distance gradual build'],
  },
  {
    slug: 'polarised',
    name: 'Polarised',
    tagline: '80/20 intensity split',
    weeks: 16,
    features: ['80% easy', '20% hard', 'No grey-zone work'],
  },
  {
    slug: 'ultra',
    name: 'Ultra',
    tagline: 'Time-on-feet focus',
    weeks: 20,
    features: ['Back-to-back long runs', 'Hike training', 'Elevation priority'],
  },
  {
    slug: 'custom',
    name: 'Custom',
    tagline: 'Your own structure',
    weeks: 12,
    features: ['Flexible week length', 'Manual session entry', 'Coach import ready'],
  },
];

const PRIMARY_COUNT = 5;

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

type Phase = 'base' | 'build' | 'peak' | 'taper';

function getPhase(weekIndex: number, totalWeeks: number): Phase {
  const pct = (weekIndex + 1) / totalWeeks;
  if (pct <= 0.30) return 'base';
  if (pct <= 0.75) return 'build';
  if (pct <= 0.90) return 'peak';
  return 'taper';
}

const PHASE_LABELS: Record<Phase, string> = {
  base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper',
};

const PHASE_CELL_CLASS: Record<Phase, string> = {
  base:  'bg-[#26D0AE]/20 border-[#26D0AE]/40',
  build: 'bg-accent/20 border-accent/40',
  peak:  'bg-[#EAB308]/20 border-[#EAB308]/40',
  taper: 'bg-[#DC2626]/15 border-[#DC2626]/30',
};

const PHASE_TEXT_CLASS: Record<Phase, string> = {
  base:  'text-[#26D0AE]',
  build: 'text-accent',
  peak:  'text-[#EAB308]',
  taper: 'text-signal-miss',
};

const PHASE_DOT_CLASS: Record<Phase, string> = {
  base:  'bg-[#26D0AE]/70',
  build: 'bg-accent/70',
  peak:  'bg-[#EAB308]/70',
  taper: 'bg-signal-miss/70',
};

// ---------------------------------------------------------------------------
// Date helpers — UTC
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function currentWeekNumber(startDateIso: string): number {
  const start = new Date(startDateIso + 'T00:00:00Z');
  const today = new Date(todayIso() + 'T00:00:00Z');
  const diffMs = today.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (7 * 86_400_000)) + 1;
}

function formatShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function formatMonthYear(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function parseGoalTime(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

// ---------------------------------------------------------------------------
// Session type badges — same palette as PatrolPage
// ---------------------------------------------------------------------------

const SESSION_BADGE: Record<string, { label: string; color: string }> = {
  easy:       { label: 'E',  color: 'text-signal-ok' },
  recovery:   { label: 'R',  color: 'text-bone-dim' },
  long:       { label: 'L',  color: 'text-accent' },
  tempo:      { label: 'T',  color: 'text-amber-400' },
  interval:   { label: 'I',  color: 'text-orange-400' },
  repetition: { label: 'RP', color: 'text-red-400' },
  cross:      { label: 'X',  color: 'text-bone-mute' },
  strength:   { label: 'S',  color: 'text-bone-mute' },
  rest:       { label: '—',  color: 'text-bone-dim' },
};

const EVENT_ICON: Record<string, string> = {
  sickness:   '✕',
  holiday:    '✈',
  work_trip:  '✈',
  commitment: '●',
  birthday:   '★',
  other:      '·',
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface ActivePlan {
  planId: number;
  dojo: string;
  paramsJson: string;
  startDate: string;
  periodId: number;
}

interface ParsedParams {
  level?: Level;
  programWeeks?: number;
}

interface Race {
  id: number;
  date: string;
  name: string;
  distance_km: number;
  goal_time: string | null;
}

interface LifeEvent {
  id: number;
  date: string;
  title: string;
  type: string;
}

// ---------------------------------------------------------------------------
// DB reads
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<{ dojo: string | null; level: Level | null }> {
  const rows = await query(`SELECT key, value FROM settings WHERE key IN ('plan.dojo', 'plan.level')`);
  const map: Record<string, string> = {};
  for (const row of rows) map[row[0] as string] = row[1] as string;
  return { dojo: map['plan.dojo'] ?? null, level: (map['plan.level'] as Level) ?? null };
}

async function loadActivePlan(): Promise<ActivePlan | null> {
  const rows = await query(
    `SELECT pp.id, pp.plan_id, pp.start_date, p.dojo, p.params_json
       FROM plan_periods pp JOIN plans p ON p.id = pp.plan_id
      WHERE pp.end_date IS NULL ORDER BY pp.id DESC LIMIT 1`,
  );
  if (!rows.length) return null;
  const [periodId, planId, startDate, dojo, paramsJson] = rows[0];
  return { periodId: periodId as number, planId: planId as number, startDate: startDate as string, dojo: dojo as string, paramsJson: paramsJson as string };
}

async function loadCalendarData(): Promise<{
  goalRace: Race | null;
  tuneupRaces: Race[];
  lifeEvents: LifeEvent[];
  weeklyCap: number | null;
  longRunCap: number | null;
}> {
  const [goalRows, tuneupRows, eventRows, settingsRows] = await Promise.all([
    query(`SELECT id, date, name, distance_km, goal_time FROM races WHERE is_goal = 1 ORDER BY date ASC LIMIT 1`),
    query(`SELECT id, date, name, distance_km, goal_time FROM races WHERE is_goal = 0 ORDER BY date ASC`),
    query(`SELECT id, date, title, type FROM calendar_events ORDER BY date ASC`),
    query(`SELECT key, value FROM settings WHERE key IN ('capacity.weekly_cap_km','capacity.long_run_cap_km')`),
  ]);

  const goalRace: Race | null = goalRows.length
    ? { id: goalRows[0][0] as number, date: goalRows[0][1] as string, name: goalRows[0][2] as string, distance_km: goalRows[0][3] as number, goal_time: goalRows[0][4] as string | null }
    : null;

  const tuneupRaces: Race[] = tuneupRows.map(r => ({
    id: r[0] as number, date: r[1] as string, name: r[2] as string, distance_km: r[3] as number, goal_time: r[4] as string | null,
  }));

  const lifeEvents: LifeEvent[] = eventRows.map(r => ({
    id: r[0] as number, date: r[1] as string, title: r[2] as string, type: r[3] as string,
  }));

  const capMap: Record<string, string> = {};
  for (const r of settingsRows) capMap[r[0] as string] = r[1] as string;
  const weeklyCap = capMap['capacity.weekly_cap_km'] ? Number(capMap['capacity.weekly_cap_km']) : null;
  const longRunCap = capMap['capacity.long_run_cap_km'] ? Number(capMap['capacity.long_run_cap_km']) : null;

  return { goalRace, tuneupRaces, lifeEvents, weeklyCap, longRunCap };
}

async function selectDojo(slug: string, level: Level, dojoWeeks: number): Promise<void> {
  const today = todayIso();
  await exec('UPDATE plan_periods SET end_date = ? WHERE end_date IS NULL', [today]);
  await exec(`INSERT INTO plans (dojo, params_json) VALUES (?, ?)`, [slug, JSON.stringify({ level, programWeeks: dojoWeeks })]);
  const planRows = await query('SELECT id FROM plans WHERE dojo = ? ORDER BY id DESC LIMIT 1', [slug]);
  const planId = planRows[0][0] as number;
  await exec('INSERT INTO plan_periods (plan_id, start_date) VALUES (?, ?)', [planId, today]);
  await exec(`INSERT INTO settings (key, value) VALUES ('plan.dojo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`, [slug]);
  await exec(`INSERT INTO settings (key, value) VALUES ('plan.level', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`, [level]);
}

async function updateStartDate(periodId: number, newDate: string): Promise<void> {
  await exec('UPDATE plan_periods SET start_date = ? WHERE id = ? AND end_date IS NULL', [newDate, periodId]);
}

// ---------------------------------------------------------------------------
// DojoCard
// ---------------------------------------------------------------------------

function DojoCard({ dojo, isSelected, onSelect }: { dojo: DojoMeta; isSelected: boolean; onSelect: () => void }) {
  return (
    <div className={['m3-card p-6 space-y-4 transition-colors', isSelected ? 'bg-primary-container/20' : 'hover:bg-surface-container'].join(' ')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display tracking-widest text-xl uppercase text-on-surface leading-tight">{dojo.name}</h3>
          <p className="font-mono text-xs text-on-surface-variant mt-0.5">{dojo.tagline}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="font-display tracking-widest text-2xl text-on-surface-variant leading-none">{dojo.weeks}</span>
          <p className="font-mono text-xs text-on-surface-variant">weeks</p>
        </div>
      </div>
      <ul className="space-y-1" role="list">
        {dojo.features.map((f) => (
          <li key={f} className="flex items-center gap-2 font-mono text-xs text-on-surface-variant">
            <span className="w-1 h-1 bg-on-surface-variant rounded-full flex-shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className={['flex items-center gap-2 font-mono text-xs uppercase tracking-widest rounded-full px-4 py-2 transition-all', isSelected ? 'bg-primary text-on-primary font-bold cursor-default' : 'bg-secondary-container text-on-secondary-container hover:shadow-sm'].join(' ')}
      >
        {isSelected ? <><Check size={12} aria-hidden="true" />Active</> : 'Select'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivePlanBar — compact header shown when a plan is active
// ---------------------------------------------------------------------------

function ActivePlanBar({
  plan, goalRace, onChangePlan, onStartDateChange,
}: {
  plan: ActivePlan;
  goalRace: Race | null;
  onChangePlan: () => void;
  onStartDateChange: (d: string) => void;
}) {
  const params = (() => { try { return JSON.parse(plan.paramsJson) as ParsedParams; } catch { return {}; } })();
  const dojoMeta = DOJOS.find(d => d.slug === plan.dojo);
  const programWeeks = params.programWeeks ?? dojoMeta?.weeks ?? 16;
  const weekNum = currentWeekNumber(plan.startDate);
  const isActive = weekNum >= 1 && weekNum <= programWeeks;
  const phase = isActive ? getPhase(weekNum - 1, programWeeks) : null;

  const [startDate, setStartDate] = useState(plan.startDate);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await onStartDateChange(startDate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {/* Dojo name */}
      <div className="bg-surface-container rounded-xl p-4 sm:p-5 col-span-1">
        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-0.5">Active plan</p>
        <p className="font-display text-lg tracking-widest uppercase text-on-surface leading-none">{dojoMeta?.name ?? plan.dojo}</p>
      </div>

      {/* Phase + week */}
      {phase && (
        <div className="bg-surface-container rounded-xl p-4 sm:p-5">
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-0.5">Phase</p>
          <p className={`font-display text-sm uppercase tracking-widest ${PHASE_TEXT_CLASS[phase]}`}>
            {PHASE_LABELS[phase]} · W{weekNum}/{programWeeks}
          </p>
        </div>
      )}
      {!isActive && weekNum < 1 && (
        <div className="bg-surface-container rounded-xl p-4 sm:p-5">
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-0.5">Status</p>
          <p className="font-mono text-xs text-on-surface-variant">Starts {formatShortDate(plan.startDate)}</p>
        </div>
      )}
      {!isActive && weekNum > programWeeks && (
        <div className="bg-surface-container rounded-xl p-4 sm:p-5">
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-0.5">Status</p>
          <p className="font-mono text-xs text-on-surface-variant">Program complete</p>
        </div>
      )}

      {/* Goal race */}
      {goalRace && (
        <div className="bg-surface-container rounded-xl p-4 sm:p-5">
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest mb-0.5">Goal race</p>
          <p className="font-mono text-xs text-on-surface">{goalRace.name}</p>
          <p className="font-mono text-[10px] text-on-surface-variant">{formatShortDate(goalRace.date)} · {goalRace.distance_km}km</p>
        </div>
      )}

      {/* Start date editor */}
      <div className="bg-surface-container rounded-xl p-4 sm:p-5 flex items-end gap-3">
        <div>
          <label htmlFor="bar-start-date" className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest block mb-0.5">
            Start date
          </label>
          <input
            id="bar-start-date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-transparent font-mono text-xs text-on-surface border-b border-outline focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors pb-px"
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* Change plan */}
      <div className="bg-surface-container rounded-xl p-4 sm:p-5 flex items-center justify-end">
        <button
          type="button"
          onClick={onChangePlan}
          className="rounded-full bg-secondary-container text-on-secondary-container font-mono text-[10px] uppercase tracking-widest px-3 py-2 hover:shadow-sm transition-all"
        >
          Change plan
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayCell
// ---------------------------------------------------------------------------

const DOW_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function DayCell({
  dow, dayIso, today, isPast, dayPlan, lifeEvent, tuneupRace, isGoalRaceDay,
}: {
  dow: number;
  dayIso: string;
  today: string;
  isPast: boolean;
  dayPlan: { sessions: { type?: string; distanceKmMin?: number | null; distanceKmMax?: number | null; durationMinMin?: number | null }[] } | undefined;
  lifeEvent: LifeEvent | undefined;
  tuneupRace: Race | undefined;
  isGoalRaceDay: boolean;
}) {
  const isToday = dayIso === today;
  const session = dayPlan?.sessions[0];
  const sessionType = session?.type ?? 'rest';
  const isRest = sessionType === 'rest' || !session;
  const badge = SESSION_BADGE[sessionType] ?? SESSION_BADGE.rest;

  let distText = '';
  if (!isRest && session) {
    if (session.distanceKmMin != null) distText = `${(session.distanceKmMin as number).toFixed(0)}km`;
    else if (session.durationMinMin != null) distText = `${session.durationMinMin}m`;
  }

  const bgClass = isGoalRaceDay
    ? 'bg-accent/10'
    : isToday
    ? 'bg-accent/5'
    : lifeEvent
    ? 'bg-amber-950/20'
    : '';

  const opacityClass = isPast && !isToday ? 'opacity-40' : '';

  return (
    <div className={`px-1.5 pt-1.5 pb-2 min-h-[64px] flex flex-col gap-0.5 ${bgClass} ${opacityClass}`}>
      {/* Day label */}
      <span className={`font-mono text-[9px] uppercase tracking-wide ${isToday ? 'text-accent' : 'text-bone-mute'}`}>
        {DOW_ABBR[dow]}
      </span>

      {/* Session or race marker */}
      {isGoalRaceDay ? (
        <span className="font-display text-[11px] uppercase text-accent leading-tight">Race</span>
      ) : tuneupRace ? (
        <span className="font-display text-[11px] uppercase text-amber-400 leading-tight">Race</span>
      ) : (
        <>
          <span className={`font-display text-[12px] uppercase leading-none ${badge.color}`}>{badge.label}</span>
          {distText && <span className="font-mono text-[9px] text-bone-dim leading-tight">{distText}</span>}
        </>
      )}

      {/* Life event marker — shows beneath session if it doesn't affect the session display */}
      {lifeEvent && !isGoalRaceDay && (
        <span className="font-mono text-[8px] text-amber-400 leading-tight truncate" title={lifeEvent.title}>
          {EVENT_ICON[lifeEvent.type] ?? '·'} {lifeEvent.title.slice(0, 7)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekRow
// ---------------------------------------------------------------------------

function WeekRow({
  weekNum, programWeeks, startIso, template, today, currentWeek,
  goalRace, weekTuneups, weekEvents,
}: {
  weekNum: number;
  programWeeks: number;
  startIso: string;
  template: { phaseName: string; totalKmTarget: number; days: { dow: number; sessions: { type?: string; distanceKmMin?: number | null; durationMinMin?: number | null }[] }[] };
  today: string;
  currentWeek: number;
  goalRace: Race | null;
  weekTuneups: Race[];
  weekEvents: LifeEvent[];
}) {
  const endIso = addDays(startIso, 6);
  const isCurrent = weekNum === currentWeek;
  const isPast = weekNum < currentWeek;
  const phase = getPhase(weekNum - 1, programWeeks);
  const goalRaceInWeek = goalRace && goalRace.date >= startIso && goalRace.date <= endIso;

  return (
    <div className={isCurrent ? 'ring-1 ring-inset ring-accent/40' : ''}>
      {/* Week header */}
      <div className={`flex items-center gap-2.5 px-3 py-1.5 border-b border-ink-line/40 ${isPast ? 'opacity-50' : ''} ${isCurrent ? 'bg-accent/5' : 'bg-ink-panel/30'}`}>
        <span className="font-mono text-[10px] text-bone-mute w-7 shrink-0">
          W{String(weekNum).padStart(2, '0')}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PHASE_DOT_CLASS[phase]}`} aria-hidden="true" />
        <span className={`font-mono text-[10px] uppercase tracking-wide ${PHASE_TEXT_CLASS[phase]}`}>
          {template.phaseName}
        </span>
        <span className="font-mono text-[10px] text-bone-mute ml-auto">{template.totalKmTarget}km</span>
        {isCurrent && (
          <span className="font-mono text-[10px] text-accent uppercase tracking-widest">← now</span>
        )}
      </div>

      {/* Goal race banner */}
      {goalRaceInWeek && goalRace && (
        <div className="flex items-center gap-2 px-3 py-1 bg-accent/8 border-b border-accent/20">
          <span className="font-mono text-[10px] text-accent uppercase tracking-widest">Goal race</span>
          <span className="font-mono text-[10px] text-accent opacity-80">
            {goalRace.name} · {formatShortDate(goalRace.date)}
          </span>
        </div>
      )}

      {/* Day cells */}
      <div className="grid grid-cols-7 divide-x divide-ink-line/30">
        {([0, 1, 2, 3, 4, 5, 6] as const).map((dow) => {
          const dayIso = addDays(startIso, dow);
          const dayPlan = template.days.find(d => d.dow === dow);
          const lifeEvent = weekEvents.find(e => e.date === dayIso);
          const tuneupRace = weekTuneups.find(r => r.date === dayIso);
          const isGoalRaceDay = !!goalRace && goalRace.date === dayIso;
          const dayCellPast = (weekNum < currentWeek) || (weekNum === currentWeek && dayIso < today);
          return (
            <DayCell
              key={dow}
              dow={dow}
              dayIso={dayIso}
              today={today}
              isPast={dayCellPast}
              dayPlan={dayPlan}
              lifeEvent={lifeEvent}
              tuneupRace={tuneupRace}
              isGoalRaceDay={isGoalRaceDay}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrainingCalendar
// ---------------------------------------------------------------------------

function TrainingCalendar({
  plan, level, goalRace, tuneupRaces, lifeEvents, weeklyCap, longRunCap,
}: {
  plan: ActivePlan;
  level: Level;
  goalRace: Race | null;
  tuneupRaces: Race[];
  lifeEvents: LifeEvent[];
  weeklyCap: number | null;
  longRunCap: number | null;
}) {
  const engine = ENGINES[plan.dojo as Dojo];
  const params = (() => { try { return JSON.parse(plan.paramsJson) as ParsedParams; } catch { return {}; } })();
  const programWeeks = params.programWeeks ?? engine?.defaultProgramWeeks ?? 16;
  const today = useMemo(() => todayIso(), []);
  const currentWeek = currentWeekNumber(plan.startDate);

  const planParams: PlanParams = useMemo(() => ({
    goalDistanceKm: goalRace?.distance_km ?? 42.195,
    goalTimeS: parseGoalTime(goalRace?.goal_time ?? null) ?? 14400,
    level: params.level ?? level,
    weeklyVolumeCapKm: weeklyCap ?? undefined,
    longRunCapKm: longRunCap ?? undefined,
    programWeeks,
    startDate: plan.startDate,
  }), [goalRace, level, params.level, weeklyCap, longRunCap, programWeeks, plan.startDate]);

  // Build week data: render each week with full context
  const weeks = useMemo(() => {
    if (!engine) return [];
    return Array.from({ length: programWeeks }, (_, i) => {
      const weekNum = i + 1;
      const startIso = addDays(plan.startDate, i * 7);
      const endIso   = addDays(plan.startDate, i * 7 + 6);

      const weekTuneups = tuneupRaces.filter(r => r.date >= startIso && r.date <= endIso);
      const weekEvents  = lifeEvents.filter(e => e.date >= startIso && e.date <= endIso);

      const ctx: WeekContext = {
        ...emptyWeekContext(startIso, endIso),
        goalRace: goalRace && goalRace.date >= startIso && goalRace.date <= endIso
          ? { date: goalRace.date, distanceKm: goalRace.distance_km, targetTimeS: parseGoalTime(goalRace.goal_time) ?? 0 }
          : null,
        tuneupRaces: weekTuneups.map(r => ({ date: r.date, distanceKm: r.distance_km, name: r.name })),
        events: weekEvents
          .filter(e => ['sickness', 'holiday', 'work_trip'].includes(e.type))
          .map(e => ({
            startDate: e.date,
            endDate: e.date,
            type: (e.type === 'work_trip' ? 'work-trip' : e.type) as WeekEvent['type'],
            impact: e.type === 'sickness' ? 'no-training' : e.type === 'holiday' ? 'reduced' : 'travel-only',
          })),
      };

      const template = engine.renderWeek(planParams, weekNum, ctx);
      return { weekNum, startIso, endIso, template, weekTuneups, weekEvents };
    });
  }, [engine, programWeeks, plan.startDate, planParams, goalRace, tuneupRaces, lifeEvents]);

  // Group weeks by calendar month of their start date
  const months = useMemo(() => {
    const result: { label: string; key: string; weeks: typeof weeks }[] = [];
    weeks.forEach(w => {
      const key = w.startIso.slice(0, 7);
      const last = result[result.length - 1];
      if (last?.key === key) {
        last.weeks.push(w);
      } else {
        result.push({ label: formatMonthYear(w.startIso), key, weeks: [w] });
      }
    });
    return result;
  }, [weeks]);

  if (!engine) {
    return (
      <div className="m3-card p-6">
        <p className="font-mono text-xs text-bone-mute">Plan engine not found for dojo "{plan.dojo}".</p>
      </div>
    );
  }

  return (
    <section aria-label="Training calendar">
      {/* Macrocycle overview bar */}
      <div className="m3-card p-4 mb-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">Macrocycle · {programWeeks} weeks</p>
          <div className="flex gap-3 flex-wrap">
            {(['base', 'build', 'peak', 'taper'] as Phase[]).map(p => (
              <div key={p} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-sm border ${PHASE_CELL_CLASS[p]}`} aria-hidden="true" />
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">{PHASE_LABELS[p]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-px flex-nowrap" role="img" aria-label={`${programWeeks}-week training macrocycle`}>
          {Array.from({ length: programWeeks }, (_, i) => {
            const ph = getPhase(i, programWeeks);
            const isCur = i + 1 === currentWeek;
            return (
              <div
                key={i}
                title={`W${i + 1} — ${PHASE_LABELS[ph]}`}
                className={['flex-1 h-5 border transition-opacity', PHASE_CELL_CLASS[ph], isCur ? 'opacity-100 ring-1 ring-bone/50' : 'opacity-60'].join(' ')}
              />
            );
          })}
        </div>
        {!goalRace && (
          <p className="font-mono text-[10px] text-amber-400">
            No goal race set — calendar adapts once you add one in the Calendar page.
          </p>
        )}
      </div>

      {/* Week-by-week calendar */}
      <div className="space-y-6">
        {months.map(month => (
          <div key={month.key}>
            <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-2">{month.label}</p>
            <div className="m3-card divide-y divide-ink-line overflow-x-auto">
              <div style={{ minWidth: '480px' }}>
                {month.weeks.map(w => (
                  <WeekRow
                    key={w.weekNum}
                    weekNum={w.weekNum}
                    programWeeks={programWeeks}
                    startIso={w.startIso}
                    template={w.template}
                    today={today}
                    currentWeek={currentWeek}
                    goalRace={goalRace}
                    weekTuneups={w.weekTuneups}
                    weekEvents={w.weekEvents}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DojoPage() {
  const { ready } = useDb();

  const [activeDojo, setActiveDojo]   = useState<string | null>(null);
  const [level, setLevel]             = useState<Level>('intermediate');
  const [activePlan, setActivePlan]   = useState<ActivePlan | null>(null);
  const [goalRace, setGoalRace]       = useState<Race | null>(null);
  const [tuneupRaces, setTuneupRaces] = useState<Race[]>([]);
  const [lifeEvents, setLifeEvents]   = useState<LifeEvent[]>([]);
  const [weeklyCap, setWeeklyCap]     = useState<number | null>(null);
  const [longRunCap, setLongRunCap]   = useState<number | null>(null);

  // showPicker: false = calendar view; true = methodology picker
  const [showPicker, setShowPicker] = useState(false);
  const [showMore, setShowMore]     = useState(false);
  const [selecting, setSelecting]   = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    Promise.all([loadSettings(), loadActivePlan(), loadCalendarData()]).then(([settings, plan, calData]) => {
      if (cancelled) return;
      if (settings.dojo) setActiveDojo(settings.dojo);
      if (settings.level) setLevel(settings.level);
      if (plan) setActivePlan(plan);
      // No active plan → open picker immediately
      if (!plan) setShowPicker(true);
      setGoalRace(calData.goalRace);
      setTuneupRaces(calData.tuneupRaces);
      setLifeEvents(calData.lifeEvents);
      setWeeklyCap(calData.weeklyCap);
      setLongRunCap(calData.longRunCap);
    });

    return () => { cancelled = true; };
  }, [ready]);

  const handleSelect = useCallback(async (dojo: DojoMeta) => {
    if (selecting) return;
    setSelecting(dojo.slug);
    try {
      await selectDojo(dojo.slug, level, dojo.weeks);
      setActiveDojo(dojo.slug);
      const plan = await loadActivePlan();
      setActivePlan(plan);
      setShowPicker(false); // collapse picker, show calendar
    } finally {
      setSelecting(null);
    }
  }, [level, selecting]);

  const handleStartDateChange = useCallback(async (newDate: string) => {
    if (!activePlan) return;
    await updateStartDate(activePlan.periodId, newDate);
    setActivePlan(prev => prev ? { ...prev, startDate: newDate } : prev);
  }, [activePlan]);

  if (!ready) return <PageSkeleton />;

  const primaryDojos   = DOJOS.slice(0, PRIMARY_COUNT);
  const secondaryDojos = DOJOS.slice(PRIMARY_COUNT);
  const showCalendar   = !!activePlan && !showPicker;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-8">

      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">training methodology</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">Dojo</h1>
      </header>

      {/* ── Calendar view ── */}
      {showCalendar && (
        <>
          <ActivePlanBar
            plan={activePlan!}
            goalRace={goalRace}
            onChangePlan={() => setShowPicker(true)}
            onStartDateChange={handleStartDateChange}
          />
          <TrainingCalendar
            plan={activePlan!}
            level={level}
            goalRace={goalRace}
            tuneupRaces={tuneupRaces}
            lifeEvents={lifeEvents}
            weeklyCap={weeklyCap}
            longRunCap={longRunCap}
          />
        </>
      )}

      {/* ── Methodology picker ── */}
      {showPicker && (
        <section aria-labelledby="dojo-picker-heading">

          {/* Back button — only when a plan is already active */}
          {activePlan && (
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary/8 transition-colors mb-6"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Back to calendar
            </button>
          )}

          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <h2 id="dojo-picker-heading" className="font-display tracking-widest text-2xl uppercase text-bone">
              Select Methodology
            </h2>

            {/* Level toggle */}
            <div className="flex gap-1" role="group" aria-label="Training level">
              {(['beginner', 'intermediate', 'advanced'] as Level[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  aria-pressed={level === l}
                  className={['rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors', level === l ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-on-surface/8'].join(' ')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Primary cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {primaryDojos.map((d) => (
              <DojoCard
                key={d.slug}
                dojo={d}
                isSelected={activeDojo === d.slug}
                onSelect={() => { void handleSelect(d); }}
              />
            ))}
          </div>

          {/* Show more */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowMore(v => !v)}
              aria-expanded={showMore}
              aria-controls="secondary-dojos"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary/8 transition-colors"
            >
              {showMore
                ? <><ChevronUp size={14} aria-hidden="true" />Show fewer</>
                : <><ChevronDown size={14} aria-hidden="true" />Show more ({secondaryDojos.length})</>}
            </button>
            {showMore && (
              <div id="secondary-dojos" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {secondaryDojos.map((d) => (
                  <DojoCard
                    key={d.slug}
                    dojo={d}
                    isSelected={activeDojo === d.slug}
                    onSelect={() => { void handleSelect(d); }}
                  />
                ))}
              </div>
            )}
          </div>

          {selecting && (
            <p className="font-mono text-xs text-bone-mute mt-4 animate-pulse" role="status" aria-live="polite">
              Activating {DOJOS.find(d => d.slug === selecting)?.name}…
            </p>
          )}
        </section>
      )}

      {/* Empty state — no plan yet, picker hasn't loaded */}
      {!showPicker && !showCalendar && (
        <div className="m3-card p-6 space-y-2">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">no active plan</p>
          <p className="font-mono text-sm text-bone-dim leading-relaxed">
            Select a methodology above to activate a training plan.
          </p>
        </div>
      )}
    </div>
  );
}
