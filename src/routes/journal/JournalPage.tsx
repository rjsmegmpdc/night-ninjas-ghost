import { useState, useEffect, useCallback } from 'react';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityEntry {
  name:      string;
  km:        number;
  timeS:     number;
  sportType: string;
}

interface JournalEntry {
  id:         number;
  sleepQ:     number | null;
  energy:     number | null;
  stress:     number | null;
  restingHr:  number | null;
  notes:      string;
}

interface WeekSummary {
  label:         string;        // "Week of Mon DD Mon"
  isoMonday:     string;        // YYYY-MM-DD
  totalRunKm:    number;
  runCount:      number;
  wellnessDays:  number;
  avgEnergy:     number | null;
}

// ---------------------------------------------------------------------------
// UTC date helpers
// ---------------------------------------------------------------------------

function todayUtcIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add `n` days to a YYYY-MM-DD string (UTC). */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Return YYYY-MM-DD for last Monday (or today if today is Monday). */
function lastMonday(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function formatDayNumber(iso: string): string {
  return String(new Date(iso + 'T00:00:00Z').getUTCDate());
}

function formatHeading(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatWeekLabel(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z');
  return d.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sport icon (text-based, no chart libraries)
// ---------------------------------------------------------------------------

const SPORT_ICONS: Record<string, string> = {
  Run:          'Run',
  Trail:        'Trail',
  TrailRun:     'Trail',
  VirtualRun:   'VRun',
  Walk:         'Walk',
  Hike:         'Hike',
  Ride:         'Ride',
  VirtualRide:  'VRide',
  Swim:         'Swim',
  Workout:      'Wkt',
  WeightTraining: 'Wkt',
  Yoga:         'Yoga',
  Crossfit:     'CF',
};

function sportIcon(sportType: string): string {
  return SPORT_ICONS[sportType] ?? sportType.slice(0, 4);
}

function isRunSport(sportType: string): boolean {
  return ['Run', 'Trail', 'TrailRun', 'VirtualRun'].includes(sportType);
}

// ---------------------------------------------------------------------------
// Wellness badge colour (1–5 scale)
// ---------------------------------------------------------------------------

function badgeClass(value: number | null): string {
  if (value === null) return 'text-bone-mute border-bone-mute/30';
  if (value <= 1) return 'text-signal-miss border-signal-miss/40 bg-signal-miss/10';
  if (value === 2) return 'text-signal-warn border-signal-warn/30 bg-signal-warn/10';
  if (value === 3) return 'text-bone-dim border-bone-dim/30 bg-ink-panel';
  if (value === 4) return 'text-signal-ok border-signal-ok/30 bg-signal-ok/10';
  return 'text-signal-ok border-signal-ok/50 bg-signal-ok/20';
}

function energyBarClass(energy: number | null): string {
  if (energy === null) return '';
  if (energy <= 2) return 'bg-signal-miss';
  if (energy === 3) return 'bg-signal-warn';
  return 'bg-signal-ok';
}

// ---------------------------------------------------------------------------
// Build 35-day window
// ---------------------------------------------------------------------------

function buildDayWindow(): string[] {
  const today = todayUtcIso();
  const monday = lastMonday(today);
  // Go back 4 more weeks (28 days) from monday = 5 full weeks starting 4 Mondays back
  const start = addDays(monday, -28);
  const days: string[] = [];
  for (let i = 0; i < 35; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

// ---------------------------------------------------------------------------
// Week summaries
// ---------------------------------------------------------------------------

function buildWeekSummaries(
  days: string[],
  actMap: Map<string, ActivityEntry[]>,
  journalMap: Map<string, JournalEntry>,
): WeekSummary[] {
  // Group days into 5 Mon–Sun rows (7 per row)
  const weeks: WeekSummary[] = [];
  for (let w = 0; w < 5; w++) {
    const weekDays = days.slice(w * 7, w * 7 + 7);
    const mondayIso = weekDays[0];

    let totalRunKm = 0;
    let runCount = 0;
    let wellnessDays = 0;
    const energyValues: number[] = [];

    for (const d of weekDays) {
      const acts = actMap.get(d);
      if (acts) {
        for (const a of acts) {
          if (isRunSport(a.sportType)) {
            totalRunKm += a.km;
            runCount++;
          }
        }
      }
      const j = journalMap.get(d);
      if (j) {
        wellnessDays++;
        if (j.energy !== null) energyValues.push(j.energy);
      }
    }

    const avgEnergy =
      energyValues.length > 0
        ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length
        : null;

    weeks.push({
      label:        formatWeekLabel(mondayIso),
      isoMonday:    mondayIso,
      totalRunKm,
      runCount,
      wellnessDays,
      avgEnergy,
    });
  }
  // Newest first
  return weeks.reverse();
}

// ---------------------------------------------------------------------------
// Day cell
// ---------------------------------------------------------------------------

function DayCell({
  iso,
  todayIso,
  acts,
  journal,
  selected,
  onClick,
}: {
  iso:      string;
  todayIso: string;
  acts:     ActivityEntry[] | undefined;
  journal:  JournalEntry | undefined;
  selected: boolean;
  onClick:  () => void;
}) {
  const isFuture  = iso > todayIso;
  const isToday   = iso === todayIso;
  const hasDots   = acts && acts.length > 0;
  const dotsToShow = acts ? acts.slice(0, 2) : [];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${iso}${isToday ? ' (today)' : ''}${acts && acts.length ? `, ${acts.length} activity` : ''}${journal ? ', wellness logged' : ''}`}
      aria-pressed={selected}
      className={[
        'relative flex flex-col justify-between border border-ink-line/50 p-1 text-left transition-colors',
        'hover:bg-ink-line/30 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        'h-14 sm:h-16',
        selected   ? 'bg-ink-line/50'  : '',
        isFuture   ? 'opacity-30'      : '',
        isToday    ? 'ring-1 ring-accent' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Day number */}
      <span className="font-mono text-xs text-bone-mute leading-none">
        {formatDayNumber(iso)}
      </span>

      {/* Activity dots */}
      {hasDots && (
        <div className="flex gap-0.5 px-0.5">
          {dotsToShow.map((a, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={[
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                isRunSport(a.sportType) ? 'bg-accent' : 'bg-bone-dim',
              ].join(' ')}
            />
          ))}
        </div>
      )}

      {/* Wellness energy bar — 3px at bottom */}
      {journal && journal.energy !== null && (
        <span
          aria-hidden="true"
          className={[
            'absolute bottom-0 left-0 right-0 h-[3px]',
            energyBarClass(journal.energy),
          ].join(' ')}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Day detail panel
// ---------------------------------------------------------------------------

function DayDetail({
  iso,
  acts,
  journal,
  onClose,
  onSaved,
}: {
  iso:     string;
  acts:    ActivityEntry[] | undefined;
  journal: JournalEntry | undefined;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [notesValue, setNotesValue] = useState(journal?.notes ?? '');
  const [saving,     setSaving]     = useState(false);
  const [savedMsg,   setSavedMsg]   = useState(false);

  // Keep textarea in sync if journal changes (e.g. after save+refresh)
  useEffect(() => {
    setNotesValue(journal?.notes ?? '');
  }, [journal?.notes]);

  async function handleSave() {
    setSaving(true);
    try {
      await exec(
        `INSERT INTO journal (date, notes) VALUES (?,?)
         ON CONFLICT(date) DO UPDATE SET notes=excluded.notes`,
        [iso, notesValue],
      );
      await onSaved();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const heading = formatHeading(iso);

  return (
    <section
      aria-labelledby="day-detail-heading"
      className="border border-ink-line p-6 mt-4 space-y-6"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            day detail
          </p>
          <h2
            id="day-detail-heading"
            className="font-display text-2xl tracking-widest uppercase text-bone"
          >
            {heading}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-bone transition-colors mt-1"
          aria-label="Close day detail"
        >
          Close
        </button>
      </div>

      {/* Activities */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          activities
        </p>
        {acts && acts.length > 0 ? (
          <ul className="divide-y divide-ink-line border border-ink-line" role="list">
            {acts.map((a, i) => (
              <li key={i} className="px-4 py-3 flex items-center gap-3">
                <span className="font-mono text-xs text-bone-dim bg-ink-panel border border-ink-line px-2 py-0.5 flex-shrink-0">
                  {sportIcon(a.sportType)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-bone truncate">{a.name}</p>
                </div>
                <div className="flex-shrink-0 text-right space-y-0.5">
                  <p className="font-mono text-xs text-bone-dim">{a.km.toFixed(1)} km</p>
                  <p className="font-mono text-xs text-bone-mute">{formatTime(a.timeS)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-sm text-bone-mute">Rest day.</p>
        )}
      </div>

      {/* Wellness */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          wellness
        </p>
        {journal ? (
          <div className="flex flex-wrap gap-3 items-center">
            {journal.sleepQ !== null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-bone-mute">Sleep</span>
                <span
                  className={`font-mono text-xs border px-2 py-0.5 ${badgeClass(journal.sleepQ)}`}
                >
                  {journal.sleepQ}/5
                </span>
              </div>
            )}
            {journal.energy !== null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-bone-mute">Energy</span>
                <span
                  className={`font-mono text-xs border px-2 py-0.5 ${badgeClass(journal.energy)}`}
                >
                  {journal.energy}/5
                </span>
              </div>
            )}
            {journal.stress !== null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-bone-mute">Stress</span>
                <span
                  className={`font-mono text-xs border px-2 py-0.5 ${badgeClass(journal.stress)}`}
                >
                  {journal.stress}/5
                </span>
              </div>
            )}
            {journal.restingHr !== null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-bone-mute">RHR</span>
                <span className="font-mono text-xs text-bone-dim">
                  {journal.restingHr} bpm
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="font-mono text-sm text-bone-mute">No wellness data logged.</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label
          htmlFor="day-notes"
          className="font-mono text-xs text-bone-mute uppercase tracking-widest"
        >
          notes
        </label>
        <textarea
          id="day-notes"
          rows={3}
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          placeholder="How did training feel today?"
          className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-accent text-ink hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedMsg && (
            <span
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
// Week summaries table
// ---------------------------------------------------------------------------

function WeekSummaries({ summaries }: { summaries: WeekSummary[] }) {
  if (summaries.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="week-summaries-heading">
      <p
        id="week-summaries-heading"
        className="font-mono text-xs text-bone-mute uppercase tracking-widest"
      >
        weekly summaries
      </p>
      <div className="border border-ink-line divide-y divide-ink-line">
        {/* Column headers */}
        <div
          className="grid gap-2 px-4 py-2 text-xs font-mono text-bone-mute uppercase tracking-widest"
          style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
          aria-hidden="true"
        >
          <span>Week</span>
          <span className="text-right w-16">Run km</span>
          <span className="text-right w-12">Runs</span>
          <span className="text-right w-16">Wellness</span>
          <span className="text-right w-16">Avg nrg</span>
        </div>
        {summaries.map((wk) => (
          <div
            key={wk.isoMonday}
            className="grid gap-2 px-4 py-3 font-mono text-sm"
            style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
          >
            <span className="text-bone-dim">{wk.label}</span>
            <span className="text-right w-16 text-bone">
              {wk.totalRunKm > 0 ? `${wk.totalRunKm.toFixed(1)}` : '—'}
            </span>
            <span className="text-right w-12 text-bone-mute">
              {wk.runCount > 0 ? wk.runCount : '—'}
            </span>
            <span className="text-right w-16 text-bone-mute">
              {wk.wellnessDays > 0 ? `${wk.wellnessDays}d` : '—'}
            </span>
            <span className="text-right w-16 text-bone-mute">
              {wk.avgEnergy !== null ? wk.avgEnergy.toFixed(1) : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// JournalPage
// ---------------------------------------------------------------------------

const DOW_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function JournalPage() {
  const { ready } = useDb();

  const [actMap,     setActMap]     = useState<Map<string, ActivityEntry[]>>(new Map());
  const [journalMap, setJournalMap] = useState<Map<string, JournalEntry>>(new Map());
  const [days,       setDays]       = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayIso = todayUtcIso();

  const loadData = useCallback(async () => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 35);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const [actRows, journalRows] = await Promise.all([
      query(
        `SELECT date(start_date) as d, name, distance, moving_time, sport_type
         FROM activities WHERE start_date >= ? ORDER BY start_date ASC`,
        [cutoffIso],
      ),
      query(
        `SELECT id, date, sleep_quality, energy_level, stress_level, resting_hr, notes
         FROM journal WHERE date >= ? ORDER BY date ASC`,
        [cutoffIso],
      ),
    ]);

    // Build actMap
    const newActMap = new Map<string, ActivityEntry[]>();
    for (const r of actRows) {
      const d         = r[0] as string;
      const name      = r[1] as string;
      const distM     = r[2] as number | null;
      const timeS     = r[3] as number | null;
      const sportType = r[4] as string;
      const entry: ActivityEntry = {
        name,
        km:       distM != null ? distM / 1000 : 0,
        timeS:    timeS ?? 0,
        sportType,
      };
      const existing = newActMap.get(d);
      if (existing) existing.push(entry);
      else newActMap.set(d, [entry]);
    }

    // Build journalMap
    const newJournalMap = new Map<string, JournalEntry>();
    for (const r of journalRows) {
      const id       = r[0] as number;
      const date     = r[1] as string;
      const sleepQ   = r[2] as number | null;
      const energy   = r[3] as number | null;
      const stress   = r[4] as number | null;
      const restHr   = r[5] as number | null;
      const notes    = (r[6] as string | null) ?? '';
      newJournalMap.set(date, { id, sleepQ, energy, stress, restingHr: restHr, notes });
    }

    setActMap(newActMap);
    setJournalMap(newJournalMap);
    setDays(buildDayWindow());
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

  if (!ready) return <PageSkeleton />;

  const weekSummaries = buildWeekSummaries(days, actMap, journalMap);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <header className="border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-2">Ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Journal</h1>
        <p className="font-mono text-xs text-bone-mute mt-1">Training diary — last 5 weeks</p>
      </header>

      {/* Section 1: Calendar grid */}
      <section aria-labelledby="calendar-grid-heading">
        <p
          id="calendar-grid-heading"
          className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-3"
        >
          calendar
        </p>

        {/* Day-of-week column headers */}
        <div className="grid grid-cols-7 gap-px mb-px" role="row">
          {DOW_HEADERS.map((d) => (
            <div
              key={d}
              className="font-mono text-xs text-bone-mute text-center py-1"
              role="columnheader"
              aria-label={d}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid — 5 rows × 7 columns */}
        <div
          className="grid grid-cols-7 gap-px bg-ink-line/30"
          role="grid"
          aria-label="5-week training calendar"
        >
          {days.map((iso) => (
            <DayCell
              key={iso}
              iso={iso}
              todayIso={todayIso}
              acts={actMap.get(iso)}
              journal={journalMap.get(iso)}
              selected={selectedDate === iso}
              onClick={() =>
                setSelectedDate((prev) => (prev === iso ? null : iso))
              }
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
            <span className="font-mono text-xs text-bone-mute">Run</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bone-dim flex-shrink-0" aria-hidden="true" />
            <span className="font-mono text-xs text-bone-mute">Other sport</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-[3px] bg-signal-ok flex-shrink-0" aria-hidden="true" />
              <span className="font-mono text-xs text-bone-mute">High energy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-[3px] bg-signal-warn flex-shrink-0" aria-hidden="true" />
              <span className="font-mono text-xs text-bone-mute">Mid energy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-[3px] bg-signal-miss flex-shrink-0" aria-hidden="true" />
              <span className="font-mono text-xs text-bone-mute">Low energy</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Day detail panel */}
      {selectedDate && (
        <DayDetail
          iso={selectedDate}
          acts={actMap.get(selectedDate)}
          journal={journalMap.get(selectedDate)}
          onClose={() => setSelectedDate(null)}
          onSaved={loadData}
        />
      )}

      {/* Section 3: Week summaries */}
      <WeekSummaries summaries={weekSummaries} />
    </div>
  );
}
