import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';

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
  // Primary
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
  // Secondary (show more)
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
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
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

// ---------------------------------------------------------------------------
// Date helpers — UTC
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentWeekNumber(startDateIso: string): number {
  const start = new Date(startDateIso + 'T00:00:00Z');
  const today = new Date(todayIso() + 'T00:00:00Z');
  const diffMs = today.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (7 * 86_400_000)) + 1;
}

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

// ---------------------------------------------------------------------------
// DB reads
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<{ dojo: string | null; level: Level | null }> {
  const rows = await query(
    `SELECT key, value FROM settings WHERE key IN ('plan.dojo', 'plan.level')`,
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row[0] as string] = row[1] as string;
  }
  return {
    dojo: map['plan.dojo'] ?? null,
    level: (map['plan.level'] as Level) ?? null,
  };
}

async function loadActivePlan(): Promise<ActivePlan | null> {
  const rows = await query(
    `SELECT pp.id, pp.plan_id, pp.start_date, p.dojo, p.params_json
       FROM plan_periods pp
       JOIN plans p ON p.id = pp.plan_id
      WHERE pp.end_date IS NULL
      ORDER BY pp.id DESC
      LIMIT 1`,
  );
  if (!rows.length) return null;
  const [periodId, planId, startDate, dojo, paramsJson] = rows[0];
  return {
    periodId: periodId as number,
    planId: planId as number,
    startDate: startDate as string,
    dojo: dojo as string,
    paramsJson: paramsJson as string,
  };
}

async function selectDojo(slug: string, level: Level, dojoWeeks: number): Promise<void> {
  const today = todayIso();

  // 1. Close any open plan period
  await exec('UPDATE plan_periods SET end_date = ? WHERE end_date IS NULL', [today]);

  // 2. Insert plan (ignore conflict to keep history)
  await exec(
    `INSERT INTO plans (dojo, params_json) VALUES (?, ?)`,
    [slug, JSON.stringify({ level, programWeeks: dojoWeeks })],
  );

  // 3. Get the plan id we just created
  const planRows = await query(
    'SELECT id FROM plans WHERE dojo = ? ORDER BY id DESC LIMIT 1',
    [slug],
  );
  const planId = planRows[0][0] as number;

  // 4. Open new plan period starting today
  await exec(
    'INSERT INTO plan_periods (plan_id, start_date) VALUES (?, ?)',
    [planId, today],
  );

  // 5. Update settings
  await exec(
    `INSERT INTO settings (key, value) VALUES ('plan.dojo', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [slug],
  );
  await exec(
    `INSERT INTO settings (key, value) VALUES ('plan.level', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [level],
  );
}

async function updateStartDate(periodId: number, newDate: string): Promise<void> {
  await exec(
    'UPDATE plan_periods SET start_date = ? WHERE id = ? AND end_date IS NULL',
    [newDate, periodId],
  );
}

// ---------------------------------------------------------------------------
// DojoCard
// ---------------------------------------------------------------------------

function DojoCard({
  dojo,
  isSelected,
  onSelect,
}: {
  dojo: DojoMeta;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={[
        'border p-6 space-y-4 transition-colors',
        isSelected
          ? 'border-accent bg-accent/5'
          : 'border-ink-line bg-ink-shadow hover:border-ink-line-bold',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display tracking-widest text-xl uppercase text-bone leading-tight">
            {dojo.name}
          </h3>
          <p className="font-mono text-xs text-bone-dim mt-0.5">{dojo.tagline}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="font-display tracking-widest text-2xl text-bone-dim leading-none">
            {dojo.weeks}
          </span>
          <p className="font-mono text-xs text-bone-mute">weeks</p>
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-1" role="list">
        {dojo.features.map((f) => (
          <li key={f} className="flex items-center gap-2 font-mono text-xs text-bone-mute">
            <span className="w-1 h-1 bg-bone-mute rounded-full flex-shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      {/* Select button */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className={[
          'flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2 border transition-colors',
          isSelected
            ? 'border-accent text-accent bg-accent/10 cursor-default'
            : 'border-ink-line text-bone-dim hover:border-accent hover:text-accent',
        ].join(' ')}
      >
        {isSelected ? (
          <>
            <Check size={12} aria-hidden="true" />
            Active
          </>
        ) : (
          'Select'
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgramShape — macrocycle bar
// ---------------------------------------------------------------------------

function ProgramShape({ plan, onStartDateChange }: {
  plan: ActivePlan;
  onStartDateChange: (newDate: string) => void;
}) {
  const params: ParsedParams = (() => {
    try { return JSON.parse(plan.paramsJson) as ParsedParams; } catch { return {}; }
  })();
  const programWeeks = params.programWeeks ?? 16;
  const dojoMeta = DOJOS.find((d) => d.slug === plan.dojo);

  const weekNum = currentWeekNumber(plan.startDate);
  const clampedWeek = Math.max(1, Math.min(weekNum, programWeeks));
  const isOngoing = weekNum >= 1 && weekNum <= programWeeks;

  const currentPhase = isOngoing ? getPhase(clampedWeek - 1, programWeeks) : null;

  const [startDate, setStartDate] = useState(plan.startDate);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await onStartDateChange(startDate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section aria-labelledby="program-shape-heading" className="border border-ink-line p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            program shape
          </p>
          <h2
            id="program-shape-heading"
            className="font-display tracking-widest text-2xl uppercase text-bone"
          >
            {dojoMeta?.name ?? plan.dojo}
          </h2>
        </div>
        {currentPhase && (
          <div className="text-right">
            <p className={`font-display tracking-widest text-2xl uppercase ${PHASE_TEXT_CLASS[currentPhase]}`}>
              {PHASE_LABELS[currentPhase]}
            </p>
            <p className="font-mono text-xs text-bone-mute mt-0.5">
              Week {clampedWeek} of {programWeeks}
            </p>
          </div>
        )}
        {!isOngoing && (
          <div className="text-right">
            <p className="font-mono text-xs text-bone-mute">
              {weekNum < 1 ? 'Starts in the future' : 'Program complete'}
            </p>
          </div>
        )}
      </div>

      {/* Macrocycle bar */}
      <div
        className="flex gap-0.5 flex-wrap"
        role="img"
        aria-label={`${programWeeks}-week training macrocycle`}
      >
        {Array.from({ length: programWeeks }, (_, i) => {
          const phase = getPhase(i, programWeeks);
          const isCurrentWeek = isOngoing && i + 1 === clampedWeek;
          return (
            <div
              key={i}
              title={`Week ${i + 1} — ${PHASE_LABELS[phase]}`}
              className={[
                'border flex-1 min-w-[8px] h-8 transition-opacity',
                PHASE_CELL_CLASS[phase],
                isCurrentWeek ? 'opacity-100 ring-1 ring-bone/50' : 'opacity-70',
              ].join(' ')}
            />
          );
        })}
      </div>

      {/* Phase legend */}
      <div className="flex flex-wrap gap-4">
        {(['base', 'build', 'peak', 'taper'] as Phase[]).map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 border ${PHASE_CELL_CLASS[p]}`} aria-hidden="true" />
            <span className="font-mono text-xs text-bone-mute uppercase">{PHASE_LABELS[p]}</span>
          </div>
        ))}
      </div>

      {/* Start date editor */}
      <div className="border-t border-ink-line pt-5 space-y-3">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          start date
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="start-date-input" className="sr-only">
            Plan start date
          </label>
          <input
            id="start-date-input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-ink-panel border border-ink-line px-3 py-1.5 font-mono text-xs text-bone focus:outline-none focus:border-accent transition-colors"
            aria-describedby="start-date-hint"
          />
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 border border-ink-line hover:border-accent font-mono text-xs uppercase tracking-widest text-bone-dim hover:text-accent transition-colors"
          >
            Save
          </button>
          {saved && (
            <span
              id="start-date-hint"
              className="font-mono text-xs text-signal-ok"
              role="status"
              aria-live="polite"
            >
              Saved.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DojoPage() {
  const { ready } = useDb();

  // Persisted selections
  const [activeDojo, setActiveDojo] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('intermediate');
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);

  // UI state
  const [showMore, setShowMore] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Load initial state from DB
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    Promise.all([loadSettings(), loadActivePlan()]).then(([settings, plan]) => {
      if (cancelled) return;
      if (settings.dojo) setActiveDojo(settings.dojo);
      if (settings.level) setLevel(settings.level);
      if (plan) setActivePlan(plan);
    });

    return () => { cancelled = true; };
  }, [ready]);

  const handleSelect = useCallback(async (dojo: DojoMeta) => {
    if (selecting) return;
    setSelecting(dojo.slug);
    try {
      await selectDojo(dojo.slug, level, dojo.weeks);
      setActiveDojo(dojo.slug);
      // Re-load the new active plan so ProgramShape shows correct data
      const plan = await loadActivePlan();
      setActivePlan(plan);
    } finally {
      setSelecting(null);
    }
  }, [level, selecting]);

  const handleStartDateChange = useCallback(async (newDate: string) => {
    if (!activePlan) return;
    await updateStartDate(activePlan.periodId, newDate);
    setActivePlan((prev) => prev ? { ...prev, startDate: newDate } : prev);
  }, [activePlan]);

  if (!ready) return <PageSkeleton />;

  const primaryDojos = DOJOS.slice(0, PRIMARY_COUNT);
  const secondaryDojos = DOJOS.slice(PRIMARY_COUNT);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-10">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          training methodology
        </p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">
          Dojo
        </h1>
      </header>

      {/* Section 1: Dojo picker */}
      <section aria-labelledby="dojo-picker-heading">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h2
            id="dojo-picker-heading"
            className="font-display tracking-widest text-2xl uppercase text-bone"
          >
            Select Methodology
          </h2>

          {/* Level toggle */}
          <div
            className="flex border border-ink-line"
            role="group"
            aria-label="Training level"
          >
            {(['beginner', 'intermediate', 'advanced'] as Level[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                aria-pressed={level === l}
                className={[
                  'px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors',
                  level === l
                    ? 'bg-accent/15 text-accent border-r border-ink-line last:border-r-0'
                    : 'text-bone-mute hover:text-bone border-r border-ink-line last:border-r-0',
                ].join(' ')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Primary dojo cards */}
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

        {/* Show more / secondary dojos */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-controls="secondary-dojos"
            className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-bone transition-colors"
          >
            {showMore ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Show fewer
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                Show more ({secondaryDojos.length})
              </>
            )}
          </button>

          {showMore && (
            <div
              id="secondary-dojos"
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4"
            >
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

        {/* Selecting feedback */}
        {selecting && (
          <p
            className="font-mono text-xs text-bone-mute mt-4 animate-pulse"
            role="status"
            aria-live="polite"
          >
            Activating {DOJOS.find((d) => d.slug === selecting)?.name}…
          </p>
        )}
      </section>

      {/* Section 2: Program Shape — only when a plan is active */}
      {activePlan && (
        <ProgramShape
          plan={activePlan}
          onStartDateChange={handleStartDateChange}
        />
      )}

      {/* Empty state — no active plan */}
      {!activePlan && (
        <div className="border border-ink-line p-6 space-y-2">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            no active plan
          </p>
          <p className="font-mono text-sm text-bone-dim leading-relaxed">
            Select a methodology above to activate a training plan. The program shape and
            start date will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
