import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { NZ_RACES, type NzRace } from '@/data/nz-races-2026';
import { ENGINES } from '@/lib/plans/index';
import type { PlanParams } from '@/lib/plans/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Race {
  id: number;
  date: string;
  name: string;
  distance_km: number;
  goal_time: string | null;
  is_goal: number;
  level: string;
}

interface CalendarEvent {
  id: number;
  date: string;
  title: string;
  type: string;
  notes: string | null;
}

interface CapacitySettings {
  weekly_cap_km: string;
  long_run_cap_km: string;
}

interface ActivePlan {
  id: number;
  dojo: string;
  params: Record<string, unknown>;
  startDate: string; // 'YYYY-MM-DD'
}

interface PlanSession {
  weekNumber: number;
  dow: number;
  sessionType: string;
  label: string;
  distanceKmMin: number | null;
  distanceKmMax: number | null;
  paceTarget: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISTANCE_OPTIONS: { label: string; km: number | null }[] = [
  { label: '5K',           km: 5 },
  { label: '10K',          km: 10 },
  { label: 'Half Marathon',km: 21.0975 },
  { label: 'Marathon',     km: 42.195 },
  { label: '50K',          km: 50 },
  { label: '100K',         km: 100 },
  { label: 'Other',        km: null },
];

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'] as const;
type Level = typeof LEVEL_OPTIONS[number];

const EVENT_TYPES = ['commitment', 'holiday', 'work_trip', 'sickness', 'birthday', 'other'] as const;
type EventType = typeof EVENT_TYPES[number];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  commitment: 'Commitment',
  holiday:    'Holiday',
  work_trip:  'Work Trip',
  sickness:   'Sickness',
  birthday:   'Birthday',
  other:      'Other',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRow(r: unknown[]): Race {
  return {
    id:          r[0] as number,
    date:        r[1] as string,
    name:        r[2] as string,
    distance_km: r[3] as number,
    goal_time:   r[4] as string | null,
    is_goal:     r[5] as number,
    level:       r[6] as string,
  };
}

function parseEventRow(r: unknown[]): CalendarEvent {
  return {
    id:    r[0] as number,
    date:  r[1] as string,
    title: r[2] as string,
    type:  r[3] as string,
    notes: r[4] as string | null,
  };
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-NZ', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Returns 1-indexed week number for a given date relative to a plan's start. */
function weekNumberForDate(date: Date, planStartIso: string): number {
  const startMs = new Date(planStartIso + 'T00:00:00Z').getTime();
  const daysDiff = Math.floor((date.getTime() - startMs) / 86400000);
  return Math.floor(daysDiff / 7) + 1; // 1-indexed
}

/** Returns the Date for a given (weekNumber, dow) pair in the plan. */
function dateForPlanDay(planStartIso: string, weekNumber: number, dow: number): Date {
  const startMs = new Date(planStartIso + 'T00:00:00Z').getTime();
  return new Date(startMs + ((weekNumber - 1) * 7 + dow) * 86400000);
}

function distanceLabelFromKm(km: number): string {
  if (Math.abs(km - 5) < 0.01)       return '5K';
  if (Math.abs(km - 10) < 0.01)      return '10K';
  if (Math.abs(km - 21.0975) < 0.01) return 'Half Marathon';
  if (Math.abs(km - 42.195) < 0.01)  return 'Marathon';
  if (Math.abs(km - 50) < 0.01)      return '50K';
  if (Math.abs(km - 100) < 0.01)     return '100K';
  return `${km} km`;
}

// ---------------------------------------------------------------------------
// Event type badge colours
// ---------------------------------------------------------------------------

function eventTypeBadgeClass(type: string): string {
  switch (type) {
    case 'holiday':    return 'bg-primary-container text-on-primary-container';
    case 'work_trip':  return 'bg-tertiary-container text-on-tertiary-container';
    case 'sickness':   return 'bg-error-container text-on-error-container';
    case 'birthday':   return 'bg-secondary-container text-on-secondary-container';
    case 'commitment': return 'bg-secondary-container text-on-secondary-container';
    default:           return 'bg-surface-container-high text-on-surface-variant';
  }
}

// ---------------------------------------------------------------------------
// Level badge
// ---------------------------------------------------------------------------

function LevelBadge({ level }: { level: string }) {
  const colour =
    level === 'beginner'     ? 'bg-secondary-container text-on-secondary-container' :
    level === 'advanced'     ? 'bg-primary-container text-on-primary-container' :
    /* intermediate */         'bg-surface-container-high text-on-surface-variant';

  return (
    <span className={`font-mono text-[11px] font-medium uppercase tracking-widest rounded-full px-2.5 py-0.5 ${colour}`}>
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// CalendarPage
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { ready } = useDb();

  const [goalRace, setGoalRace]       = useState<Race | null>(null);
  const [tuneupRaces, setTuneupRaces] = useState<Race[]>([]);
  const [events, setEvents]           = useState<CalendarEvent[]>([]);
  const [capacity, setCapacity]       = useState<CapacitySettings>({
    weekly_cap_km:  '',
    long_run_cap_km: '',
  });
  const [activePlan, setActivePlan]       = useState<ActivePlan | null>(null);
  const [aiSessions, setAiSessions]       = useState<PlanSession[]>([]);

  const loadData = useCallback(async () => {
    const [goalRows, tuneupRows, eventRows, capRows, planRows] = await Promise.all([
      query('SELECT id, date, name, distance_km, goal_time, is_goal, level FROM races WHERE is_goal = 1 ORDER BY created_at DESC LIMIT 1'),
      query('SELECT id, date, name, distance_km, goal_time, is_goal, level FROM races WHERE is_goal = 0 ORDER BY date ASC'),
      query('SELECT id, date, title, type, notes FROM calendar_events ORDER BY date ASC'),
      query("SELECT key, value FROM settings WHERE key IN ('capacity.weekly_cap_km','capacity.long_run_cap_km')"),
      query('SELECT p.id, p.dojo, p.params_json, pp.start_date FROM plans p JOIN plan_periods pp ON pp.plan_id = p.id WHERE pp.end_date IS NULL LIMIT 1'),
    ]);

    setGoalRace(goalRows.length ? parseRow(goalRows[0]) : null);
    setTuneupRaces(tuneupRows.map(parseRow));
    setEvents(eventRows.map(parseEventRow));

    const caps: CapacitySettings = { weekly_cap_km: '', long_run_cap_km: '' };
    for (const r of capRows) {
      const k = r[0] as string;
      const v = r[1] as string;
      if (k === 'capacity.weekly_cap_km')   caps.weekly_cap_km   = v;
      if (k === 'capacity.long_run_cap_km') caps.long_run_cap_km = v;
    }
    setCapacity(caps);

    if (planRows.length) {
      const pr = planRows[0];
      const plan: ActivePlan = {
        id:        pr[0] as number,
        dojo:      pr[1] as string,
        params:    JSON.parse(pr[2] as string) as Record<string, unknown>,
        startDate: pr[3] as string,
      };
      setActivePlan(plan);

      // AI Coach sessions come from the DB; template dojos are computed in useMemo
      if (plan.dojo === 'ai-coach') {
        const sessRows = await query(
          'SELECT week_number, dow, session_type, label, distance_km_min, distance_km_max, pace_target FROM ai_plan_sessions WHERE plan_id = ? ORDER BY week_number, dow',
          [plan.id],
        );
        setAiSessions(sessRows.map((r) => ({
          weekNumber:      r[0] as number,
          dow:             r[1] as number,
          sessionType:     r[2] as string,
          label:           r[3] as string,
          distanceKmMin:   r[4] as number | null,
          distanceKmMax:   r[5] as number | null,
          paceTarget:      r[6] as string | null,
        })));
      } else {
        setAiSessions([]);
      }
    } else {
      setActivePlan(null);
      setAiSessions([]);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

  // Compute the sessions to display across the 6-week window
  const planSessions = useMemo<PlanSession[]>(() => {
    if (!activePlan) return [];

    if (activePlan.dojo === 'ai-coach') {
      return aiSessions;
    }

    // Template dojo: derive sessions from the engine
    const engine = ENGINES[activePlan.dojo as keyof typeof ENGINES];
    if (!engine) return [];

    const params: PlanParams = {
      goalDistanceKm: (activePlan.params.goalDistanceKm as number) ?? 42.195,
      goalTimeS:      (activePlan.params.goalTimeS as number) ?? 0,
      level:          (activePlan.params.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate',
      startDate:      activePlan.startDate,
    };

    const sessions: PlanSession[] = [];
    const totalWeeks = engine.defaultProgramWeeks;
    for (let wk = 1; wk <= totalWeeks; wk++) {
      const template = engine.renderWeek(params, wk);
      for (const day of template.days) {
        for (const s of day.sessions) {
          sessions.push({
            weekNumber:    wk,
            dow:           day.dow,
            sessionType:   s.type,
            label:         s.label,
            distanceKmMin: s.distanceKmMin ?? null,
            distanceKmMax: s.distanceKmMax ?? null,
            paceTarget:    null, // paceZone is an object; not shown as text in this UI
          });
        }
      }
    }
    return sessions;
  }, [activePlan, aiSessions]);

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <header className="border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-2">Ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Calendar</h1>
      </header>

      {/* Section 1: Races */}
      <RacesSection
        goalRace={goalRace}
        tuneupRaces={tuneupRaces}
        onRefresh={loadData}
      />

      {/* Section 2: Training Plan */}
      <TrainingPlanSection
        activePlan={activePlan}
        planSessions={planSessions}
      />

      {/* Section 3: Capacity Caps */}
      <CapacitySection capacity={capacity} onRefresh={loadData} />

      {/* Section 4: Commitments */}
      <CommitmentsSection events={events} onRefresh={loadData} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Training Plan
// ---------------------------------------------------------------------------

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface TrainingPlanSectionProps {
  activePlan:   ActivePlan | null;
  planSessions: PlanSession[];
}

function TrainingPlanSection({ activePlan, planSessions }: TrainingPlanSectionProps) {
  // Today in UTC — consistent with the plan date arithmetic
  const todayUtc = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }, []);

  /** Compute the 6-week render window (week numbers). */
  const weekWindow = useMemo<number[]>(() => {
    if (!activePlan) return [];

    const engine = ENGINES[activePlan.dojo as keyof typeof ENGINES];
    const totalWeeks = engine?.defaultProgramWeeks ?? 16;

    const currentWeek = weekNumberForDate(todayUtc, activePlan.startDate);
    // If plan hasn't started yet (currentWeek < 1), start from week 1
    const startWeek = Math.max(1, currentWeek);
    const endWeek   = Math.min(totalWeeks, startWeek + 5); // 6 weeks inclusive

    const weeks: number[] = [];
    for (let wk = startWeek; wk <= endWeek; wk++) {
      weeks.push(wk);
    }
    return weeks;
  }, [activePlan, todayUtc]);

  /** Group sessions by week number for fast lookup. */
  const sessionsByWeek = useMemo(() => {
    const map = new Map<number, PlanSession[]>();
    for (const s of planSessions) {
      const list = map.get(s.weekNumber) ?? [];
      list.push(s);
      map.set(s.weekNumber, list);
    }
    return map;
  }, [planSessions]);

  /** Derive phase name for a given week from the engine. */
  function phaseForWeek(weekNumber: number): string {
    if (!activePlan) return '';
    const engine = ENGINES[activePlan.dojo as keyof typeof ENGINES];
    if (!engine) return '';
    if (activePlan.dojo === 'ai-coach') {
      // For AI Coach, try to infer from the sessions stored
      return 'AI Coached';
    }
    const params: PlanParams = {
      goalDistanceKm: (activePlan.params.goalDistanceKm as number) ?? 42.195,
      goalTimeS:      (activePlan.params.goalTimeS as number) ?? 0,
      level:          (activePlan.params.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate',
      startDate:      activePlan.startDate,
    };
    try {
      return engine.renderWeek(params, weekNumber).phaseName;
    } catch {
      return '';
    }
  }

  if (!activePlan) {
    return (
      <section className="m3-card p-6 space-y-4">
        <SectionLabel>training plan</SectionLabel>
        <p className="text-sm text-bone-mute italic">
          No training plan active.{' '}
          <a href="/setup" className="text-accent hover:text-accent-hover underline transition-colors">
            Set a goal race and choose a dojo in Setup
          </a>
          .
        </p>
      </section>
    );
  }

  if (weekWindow.length === 0) {
    return (
      <section className="m3-card p-6 space-y-4">
        <SectionLabel>training plan</SectionLabel>
        <p className="text-sm text-bone-mute italic">Plan complete — all weeks have passed.</p>
      </section>
    );
  }

  return (
    <section className="m3-card p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <SectionLabel>training plan</SectionLabel>
        <span className="font-mono text-[11px] font-medium uppercase tracking-widest rounded-full px-2.5 py-0.5 bg-primary-container text-on-primary-container">
          {activePlan.dojo}
        </span>
      </div>

      {/* Week blocks */}
      {weekWindow.map((wk) => {
        const sessions = sessionsByWeek.get(wk) ?? [];
        const phase    = phaseForWeek(wk);

        // Compute total km target for this week (sum of max distances, or min if no max)
        const totalKm = sessions.reduce((acc, s) => {
          if (s.sessionType === 'rest' || s.sessionType === 'cross' || s.sessionType === 'strength') return acc;
          const km = s.distanceKmMax ?? s.distanceKmMin ?? 0;
          return acc + km;
        }, 0);

        // All 7 days in this week; sessions only have the scheduled dow values
        // We show all dow that have sessions (plus rest days if explicit)
        const sessionsByDow = new Map<number, PlanSession[]>();
        for (const s of sessions) {
          const list = sessionsByDow.get(s.dow) ?? [];
          list.push(s);
          sessionsByDow.set(s.dow, list);
        }

        // Build the 7-day display list — show all 7 days if any sessions exist, otherwise
        // only show days that have sessions (avoid showing 7 empty rows for sparse AI plans)
        const hasAllDays = sessionsByDow.size >= 5;
        const daysToShow: number[] = hasAllDays
          ? [0, 1, 2, 3, 4, 5, 6]
          : Array.from(sessionsByDow.keys()).sort((a, b) => a - b);

        return (
          <div key={wk} className="space-y-2">
            {/* Week header */}
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
                Week {wk}{phase ? ` — ${phase}` : ''}
              </span>
              {totalKm > 0 && (
                <span className="font-mono text-xs text-bone">
                  {Math.round(totalKm)} km
                </span>
              )}
            </div>
            <div className="border-t border-ink-line" />

            {/* Day rows */}
            {sessions.length === 0 ? (
              <p className="text-sm text-bone-mute italic py-1">No sessions planned for this week.</p>
            ) : (
              <div className="space-y-0.5">
                {daysToShow.map((dow) => {
                  const daySessions = sessionsByDow.get(dow);
                  const dayDate     = dateForPlanDay(activePlan.startDate, wk, dow);
                  const isToday     = dayDate.getTime() === todayUtc.getTime();

                  if (!daySessions || daySessions.length === 0) {
                    // Only shown when rendering the full 7-day grid
                    return (
                      <div
                        key={dow}
                        className={`grid grid-cols-[3rem_1fr] gap-2 items-baseline py-1 ${isToday ? 'bg-primary-container/20 rounded px-1' : ''}`}
                      >
                        <span className="font-mono text-xs text-bone-mute uppercase">
                          {DOW_LABELS[dow]}
                        </span>
                        <span className="text-sm text-bone-mute">Rest</span>
                      </div>
                    );
                  }

                  return daySessions.map((s, i) => {
                    const isRest       = s.sessionType === 'rest';
                    const rowDimmed    = isRest ? 'text-bone-mute' : '';
                    const labelText    = isRest ? 'Rest' : s.label;
                    const distancePart =
                      !isRest && (s.distanceKmMin != null || s.distanceKmMax != null)
                        ? ` · ${
                            s.distanceKmMin != null && s.distanceKmMax != null && s.distanceKmMin !== s.distanceKmMax
                              ? `${s.distanceKmMin}–${s.distanceKmMax} km`
                              : `${s.distanceKmMax ?? s.distanceKmMin} km`
                          }`
                        : '';

                    return (
                      <div
                        key={`${dow}-${i}`}
                        className={`grid grid-cols-[3rem_1fr] gap-2 items-baseline py-1 ${isToday ? 'bg-primary-container/20 rounded px-1' : ''}`}
                      >
                        <span className={`font-mono text-xs uppercase ${isRest ? 'text-bone-mute' : 'text-bone-mute'}`}>
                          {i === 0 ? DOW_LABELS[dow] : ''}
                        </span>
                        <span className={`text-sm ${rowDimmed || 'text-bone'}`}>
                          {labelText}
                          {distancePart && (
                            <span className="text-xs text-bone-mute">{distancePart}</span>
                          )}
                        </span>
                      </div>
                    );
                  });
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Races
// ---------------------------------------------------------------------------

interface RacesSectionProps {
  goalRace:    Race | null;
  tuneupRaces: Race[];
  onRefresh:   () => void;
}

function RacesSection({ goalRace, tuneupRaces, onRefresh }: RacesSectionProps) {
  return (
    <section className="m3-card p-6 space-y-4">
      <SectionLabel>races</SectionLabel>

      <GoalRaceBlock goalRace={goalRace} onRefresh={onRefresh} />

      <div className="border-t border-ink-line pt-4">
        <TuneupRacesBlock tuneupRaces={tuneupRaces} onRefresh={onRefresh} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goal race block
// ---------------------------------------------------------------------------

interface RaceFormState {
  date:          string;
  name:          string;
  distanceLabel: string;
  distance_km:   string;
  goal_time:     string;
  level:         Level;
  raceUrl:       string | null;  // originator page link (from NZ_RACES)
  raceSearchUrl: string | null;  // Google fallback if url 404s
}

const BLANK_RACE_FORM: RaceFormState = {
  date:          '',
  name:          '',
  distanceLabel: '5K',
  distance_km:   '5',
  goal_time:     '',
  level:         'intermediate',
  raceUrl:       null,
  raceSearchUrl: null,
};

function initRaceForm(r: Race): RaceFormState {
  return {
    date:          r.date,
    name:          r.name,
    distanceLabel: distanceLabelFromKm(r.distance_km),
    distance_km:   String(r.distance_km),
    goal_time:     r.goal_time ?? '',
    level:         LEVEL_OPTIONS.includes(r.level as Level) ? (r.level as Level) : 'intermediate',
    raceUrl:       null,
    raceSearchUrl: null,
  };
}

// ---------------------------------------------------------------------------
// NZ race combobox
// ---------------------------------------------------------------------------

function NzRaceSearch({
  value,
  onTextChange,
  onSelect,
}: {
  value: string;
  onTextChange: (name: string) => void;
  onSelect: (race: NzRace) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (value.length < 2) return [];
    const q = value.toLowerCase();
    return NZ_RACES.filter(
      (r) => r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [value]);

  function handleSelect(race: NzRace) {
    onSelect(race);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onTextChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.length >= 2) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search NZ races or type manually…"
        className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full bg-surface-container-high rounded-lg border border-outline/20 shadow-lg max-h-52 overflow-y-auto mt-1">
          {results.map((race) => (
            <li key={`${race.name}-${race.date}`}>
              <button
                type="button"
                onMouseDown={() => handleSelect(race)}
                className="w-full px-3 py-2 text-left flex items-center justify-between gap-3 hover:bg-on-surface/8 transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-on-surface block truncate">{race.name}</span>
                  <span className="font-mono text-[10px] text-on-surface-variant">{race.city}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-[10px] text-on-surface-variant block">
                    {new Date(race.date + 'T12:00:00Z').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="font-mono text-[10px] text-on-surface-variant">
                    {race.distance_km === 42.195 ? 'Marathon' : 'Half'}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalRaceBlock({ goalRace, onRefresh }: { goalRace: Race | null; onRefresh: () => void }) {
  const [editing,     setEditing]     = useState(false);
  const [adding,      setAdding]      = useState(false);
  const [form,        setForm]        = useState<RaceFormState>(BLANK_RACE_FORM);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  function openEdit() {
    if (!goalRace) return;
    setForm(initRaceForm(goalRace));
    setEditing(true);
    setAdding(false);
    setConfirmDel(false);
  }

  function openAdd() {
    setForm(BLANK_RACE_FORM);
    setAdding(true);
    setEditing(false);
    setConfirmDel(false);
  }

  function cancel() {
    setEditing(false);
    setAdding(false);
    setConfirmDel(false);
  }

  function handleDistanceChange(label: string) {
    const opt = DISTANCE_OPTIONS.find((o) => o.label === label);
    setForm((f) => ({
      ...f,
      distanceLabel: label,
      distance_km:   opt?.km != null ? String(opt.km) : f.distance_km,
    }));
  }

  async function handleSave() {
    if (!form.date || !form.name || !form.distance_km) return;
    setSaving(true);
    try {
      const km    = parseFloat(form.distance_km);
      const gtime = form.goal_time.trim() || null;

      if (editing && goalRace) {
        await exec(
          'UPDATE races SET date=?, name=?, distance_km=?, goal_time=?, level=? WHERE id=?',
          [form.date, form.name, km, gtime, form.level, goalRace.id],
        );
      } else {
        // Demote any existing goal race first
        await exec('UPDATE races SET is_goal = 0');
        await exec(
          'INSERT INTO races (date, name, distance_km, goal_time, level, is_goal) VALUES (?,?,?,?,?,1)',
          [form.date, form.name, km, gtime, form.level],
        );
      }
      setEditing(false);
      setAdding(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDemote() {
    if (!goalRace) return;
    await exec('UPDATE races SET is_goal = 0 WHERE id = ?', [goalRace.id]);
    setConfirmDel(false);
    onRefresh();
  }

  const showForm = editing || adding;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-bone uppercase tracking-widest">Goal Race</p>
        {!showForm && (
          goalRace
            ? <button onClick={openEdit} className="font-mono text-xs text-bone-mute hover:text-accent transition-colors">Edit</button>
            : <button onClick={openAdd}  className="font-mono text-xs text-accent hover:text-accent-hover transition-colors">+ Add Goal Race</button>
        )}
      </div>

      {!showForm && goalRace && (
        <GoalRaceCard
          race={goalRace}
          onEdit={openEdit}
          confirmDel={confirmDel}
          onRequestDelete={() => setConfirmDel(true)}
          onCancelDelete={() => setConfirmDel(false)}
          onConfirmDelete={handleDemote}
        />
      )}

      {!showForm && !goalRace && (
        <p className="font-mono text-sm text-bone-mute">
          No goal race set.{' '}
          <button onClick={openAdd} className="text-accent hover:text-accent-hover transition-colors underline">
            Add one
          </button>
          .
        </p>
      )}

      {showForm && (
        <RaceForm
          form={form}
          onChange={setForm}
          onDistanceChange={handleDistanceChange}
          onSave={handleSave}
          onCancel={cancel}
          saving={saving}
          submitLabel={editing ? 'Save Changes' : 'Add Goal Race'}
        />
      )}
    </div>
  );
}

function GoalRaceCard({
  race, confirmDel, onEdit, onRequestDelete, onCancelDelete, onConfirmDelete,
}: {
  race: Race;
  confirmDel: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div className="rounded-2xl bg-primary-container/40 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-display tracking-widest text-2xl uppercase text-on-surface">{race.name}</p>
          <p className="font-mono text-xs text-on-surface-variant">{formatDisplayDate(race.date)}</p>
        </div>
        <LevelBadge level={race.level} />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="font-mono text-sm text-on-surface">
          {distanceLabelFromKm(race.distance_km)}
        </span>
        {race.goal_time && (
          <span className="font-mono text-sm text-on-surface-variant">
            Goal: {race.goal_time}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-outline/20">
        <button onClick={onEdit} className="rounded-full px-4 py-2 font-mono text-xs text-primary hover:bg-primary/8 transition-colors">
          Edit
        </button>
        {!confirmDel ? (
          <button onClick={onRequestDelete} className="rounded-full px-4 py-2 font-mono text-xs text-error hover:bg-error/8 transition-colors">
            Remove goal
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-error">Demote this race?</span>
            <button onClick={onConfirmDelete} className="font-mono text-xs text-error hover:underline">Yes</button>
            <button onClick={onCancelDelete} className="rounded-full px-3 py-1 font-mono text-xs text-on-surface-variant hover:bg-on-surface/4 transition-colors">Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tune-up races block
// ---------------------------------------------------------------------------

function TuneupRacesBlock({ tuneupRaces, onRefresh }: { tuneupRaces: Race[]; onRefresh: () => void }) {
  const [adding,     setAdding]     = useState(false);
  const [form,       setForm]       = useState<RaceFormState>(BLANK_RACE_FORM);
  const [deleteId,   setDeleteId]   = useState<number | null>(null);
  const [saving,     setSaving]     = useState(false);

  function handleDistanceChange(label: string) {
    const opt = DISTANCE_OPTIONS.find((o) => o.label === label);
    setForm((f) => ({
      ...f,
      distanceLabel: label,
      distance_km:   opt?.km != null ? String(opt.km) : f.distance_km,
    }));
  }

  async function handleAdd() {
    if (!form.date || !form.name || !form.distance_km) return;
    setSaving(true);
    try {
      const km    = parseFloat(form.distance_km);
      const gtime = form.goal_time.trim() || null;
      await exec(
        'INSERT INTO races (date, name, distance_km, goal_time, is_goal) VALUES (?,?,?,?,0)',
        [form.date, form.name, km, gtime],
      );
      setAdding(false);
      setForm(BLANK_RACE_FORM);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await exec('DELETE FROM races WHERE id = ?', [id]);
    setDeleteId(null);
    onRefresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-bone uppercase tracking-widest">Tune-up Races</p>
        {!adding && (
          <button onClick={() => { setAdding(true); setForm(BLANK_RACE_FORM); }} className="font-mono text-xs text-bone-mute hover:text-accent transition-colors">
            + Add
          </button>
        )}
      </div>

      {tuneupRaces.length === 0 && !adding && (
        <p className="font-mono text-sm text-bone-mute">No tune-up races yet.</p>
      )}

      {tuneupRaces.length > 0 && (
        <div className="divide-y divide-ink-line m3-card">
          {tuneupRaces.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <p className="font-mono text-sm text-bone truncate">{r.name}</p>
                <p className="font-mono text-xs text-bone-dim">
                  {formatDisplayDate(r.date)} · {distanceLabelFromKm(r.distance_km)}
                  {r.goal_time && ` · ${r.goal_time}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {deleteId === r.id ? (
                  <>
                    <span className="font-mono text-xs text-signal-miss">Delete?</span>
                    <button onClick={() => handleDelete(r.id)} className="font-mono text-xs text-signal-miss hover:underline">Yes</button>
                    <button onClick={() => setDeleteId(null)} className="font-mono text-xs text-bone-mute hover:text-bone transition-colors">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteId(r.id)} className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <RaceForm
          form={form}
          onChange={setForm}
          onDistanceChange={handleDistanceChange}
          onSave={handleAdd}
          onCancel={() => { setAdding(false); setForm(BLANK_RACE_FORM); }}
          saving={saving}
          submitLabel="Add Tune-up Race"
          showLevel={false}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared race form
// ---------------------------------------------------------------------------

interface RaceFormProps {
  form:               RaceFormState;
  onChange:           (f: RaceFormState) => void;
  onDistanceChange:   (label: string) => void;
  onSave:             () => void;
  onCancel:           () => void;
  saving:             boolean;
  submitLabel:        string;
  showLevel?:         boolean;
}

function RaceForm({
  form, onChange, onDistanceChange, onSave, onCancel, saving, submitLabel, showLevel = true,
}: RaceFormProps) {
  const isOther = form.distanceLabel === 'Other';

  function handleNzSelect(race: NzRace) {
    const distLabel = race.distance_km === 42.195 ? 'Marathon' : 'Half Marathon';
    onChange({
      ...form,
      name:          race.name,
      date:          race.date,
      distanceLabel: distLabel,
      distance_km:   String(race.distance_km),
      raceUrl:       race.url,
      raceSearchUrl: race.searchUrl,
    });
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Date */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Date *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Name — NZ race search combobox */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Race Name *</label>
          <NzRaceSearch
            value={form.name}
            onTextChange={(name) => onChange({ ...form, name, raceUrl: null, raceSearchUrl: null })}
            onSelect={handleNzSelect}
          />
          {/* Originator link — shown after selecting a NZ race */}
          {form.raceUrl && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <a
                href={form.raceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
              >
                Event page <ExternalLink size={10} aria-hidden="true" />
              </a>
              {form.raceSearchUrl && (
                <>
                  <span className="font-mono text-[10px] text-on-surface-variant">·</span>
                  <a
                    href={form.raceSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant hover:text-on-surface hover:underline"
                  >
                    Google if 404 <ExternalLink size={10} aria-hidden="true" />
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* Distance */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Distance *</label>
          <select
            value={form.distanceLabel}
            onChange={(e) => onDistanceChange(e.target.value)}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
          >
            {DISTANCE_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Custom distance_km if Other */}
        {isOther && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Distance (km) *</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.distance_km}
              onChange={(e) => onChange({ ...form, distance_km: e.target.value })}
              placeholder="e.g. 60"
              className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        )}

        {/* Goal time */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Goal Time (optional)</label>
          <input
            type="text"
            value={form.goal_time}
            onChange={(e) => onChange({ ...form, goal_time: e.target.value })}
            placeholder="H:MM:SS"
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Level */}
        {showLevel && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Level</label>
            <select
              value={form.level}
              onChange={(e) => onChange({ ...form, level: e.target.value as Level })}
              className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !form.date || !form.name || !form.distance_km}
          className="font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-full px-4 py-2 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary/8 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Capacity Caps
// ---------------------------------------------------------------------------

interface CapacitySectionProps {
  capacity:  CapacitySettings;
  onRefresh: () => void;
}

function CapacitySection({ capacity, onRefresh }: CapacitySectionProps) {
  const [weekly,   setWeekly]   = useState('');
  const [longRun,  setLongRun]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  // Sync from props whenever they change
  useEffect(() => {
    setWeekly(capacity.weekly_cap_km);
    setLongRun(capacity.long_run_cap_km);
  }, [capacity.weekly_cap_km, capacity.long_run_cap_km]);

  async function handleSave() {
    setSaving(true);
    try {
      await exec(
        "INSERT INTO settings (key, value, updated_at) VALUES ('capacity.weekly_cap_km', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        [weekly],
      );
      await exec(
        "INSERT INTO settings (key, value, updated_at) VALUES ('capacity.long_run_cap_km', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        [longRun],
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  const weeklyDisplay   = capacity.weekly_cap_km   ? `${capacity.weekly_cap_km} km`  : 'not set';
  const longRunDisplay  = capacity.long_run_cap_km ? `${capacity.long_run_cap_km} km` : 'not set';

  return (
    <section className="m3-card p-6 space-y-4">
      <SectionLabel>capacity caps</SectionLabel>

      <div className="grid grid-cols-2 gap-4 text-sm font-mono text-bone-dim mb-2">
        <div>
          <span className="text-bone-mute">Weekly volume cap: </span>
          <span className="text-bone">{weeklyDisplay}</span>
        </div>
        <div>
          <span className="text-bone-mute">Long run cap: </span>
          <span className="text-bone">{longRunDisplay}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">
            Weekly Volume Cap (km)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            placeholder="e.g. 80"
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">
            Long Run Cap (km)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={longRun}
            onChange={(e) => setLongRun(e.target.value)}
            placeholder="e.g. 32"
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Caps'}
        </button>
        {saved && (
          <span className="font-mono text-xs text-signal-ok">Saved.</span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Commitments
// ---------------------------------------------------------------------------

interface CommitmentsSectionProps {
  events:    CalendarEvent[];
  onRefresh: () => void;
}

interface EventFormState {
  date:  string;
  title: string;
  type:  EventType;
  notes: string;
}

const BLANK_EVENT_FORM: EventFormState = {
  date:  '',
  title: '',
  type:  'commitment',
  notes: '',
};

function CommitmentsSection({ events, onRefresh }: CommitmentsSectionProps) {
  const [adding,   setAdding]   = useState(false);
  const [form,     setForm]     = useState<EventFormState>(BLANK_EVENT_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving,   setSaving]   = useState(false);

  async function handleAdd() {
    if (!form.date || !form.title) return;
    setSaving(true);
    try {
      await exec(
        'INSERT INTO calendar_events (date, title, type, notes) VALUES (?,?,?,?)',
        [form.date, form.title, form.type, form.notes.trim() || null],
      );
      setAdding(false);
      setForm(BLANK_EVENT_FORM);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await exec('DELETE FROM calendar_events WHERE id = ?', [id]);
    setDeleteId(null);
    onRefresh();
  }

  return (
    <section className="m3-card p-6 space-y-4">
      <SectionLabel>commitments</SectionLabel>

      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-bone uppercase tracking-widest">Calendar Events</p>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setForm(BLANK_EVENT_FORM); }}
            className="font-mono text-xs text-bone-mute hover:text-accent transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {events.length === 0 && !adding && (
        <p className="font-mono text-sm text-bone-mute">
          No commitments. Add holidays, work trips, or other events that will affect training.
        </p>
      )}

      {events.length > 0 && (
        <div className="divide-y divide-ink-line m3-card">
          {events.map((ev) => (
            <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono text-sm text-bone">{ev.title}</p>
                  <span className={`font-mono text-[11px] font-medium rounded-full px-2.5 py-0.5 ${eventTypeBadgeClass(ev.type)}`}>
                    {EVENT_TYPE_LABELS[ev.type as EventType] ?? ev.type}
                  </span>
                </div>
                <p className="font-mono text-xs text-bone-dim">{formatDisplayDate(ev.date)}</p>
                {ev.notes && (
                  <p className="font-mono text-xs text-bone-dim leading-relaxed">{ev.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                {deleteId === ev.id ? (
                  <>
                    <span className="font-mono text-xs text-signal-miss">Delete?</span>
                    <button onClick={() => handleDelete(ev.id)} className="font-mono text-xs text-signal-miss hover:underline">Yes</button>
                    <button onClick={() => setDeleteId(null)} className="font-mono text-xs text-bone-mute hover:text-bone transition-colors">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteId(ev.id)} className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="bg-surface-container-low rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Christmas Day"
                className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-on-surface-variant tracking-wide">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional details"
                className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleAdd}
              disabled={saving || !form.date || !form.title}
              className="font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Add Event'}
            </button>
            <button
              onClick={() => { setAdding(false); setForm(BLANK_EVENT_FORM); }}
              disabled={saving}
              className="rounded-full px-4 py-2 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary/8 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
