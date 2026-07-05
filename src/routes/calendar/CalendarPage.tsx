import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { NZ_RACES, type NzRace } from '@/data/nz-races-2026';

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
    case 'holiday':    return 'text-accent border-accent/40';
    case 'work_trip':  return 'text-signal-warn border-signal-warn/40';
    case 'sickness':   return 'text-signal-miss border-signal-miss/40';
    case 'birthday':   return 'text-bone border-bone/30';
    case 'commitment': return 'text-bone-dim border-bone-dim/30';
    default:           return 'text-bone-mute border-bone-mute/30';
  }
}

// ---------------------------------------------------------------------------
// Level badge
// ---------------------------------------------------------------------------

function LevelBadge({ level }: { level: string }) {
  const colour =
    level === 'beginner'     ? 'text-signal-ok border-signal-ok/40' :
    level === 'advanced'     ? 'text-accent border-accent/40' :
    /* intermediate */         'text-bone-dim border-bone-dim/30';

  return (
    <span className={`font-mono text-xs uppercase tracking-widest border px-2 py-0.5 ${colour}`}>
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

  const loadData = useCallback(async () => {
    const [goalRows, tuneupRows, eventRows, capRows] = await Promise.all([
      query('SELECT id, date, name, distance_km, goal_time, is_goal, level FROM races WHERE is_goal = 1 ORDER BY created_at DESC LIMIT 1'),
      query('SELECT id, date, name, distance_km, goal_time, is_goal, level FROM races WHERE is_goal = 0 ORDER BY date ASC'),
      query('SELECT id, date, title, type, notes FROM calendar_events ORDER BY date ASC'),
      query("SELECT key, value FROM settings WHERE key IN ('capacity.weekly_cap_km','capacity.long_run_cap_km')"),
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
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadData();
  }, [ready, loadData]);

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

      {/* Section 2: Capacity Caps */}
      <CapacitySection capacity={capacity} onRefresh={loadData} />

      {/* Section 3: Commitments */}
      <CommitmentsSection events={events} onRefresh={loadData} />
    </div>
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
    <section className="border border-ink-line p-6 space-y-4">
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
        className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full border border-ink-line border-t-0 bg-ink-shadow max-h-52 overflow-y-auto">
          {results.map((race) => (
            <li key={`${race.name}-${race.date}`}>
              <button
                type="button"
                onMouseDown={() => handleSelect(race)}
                className="w-full px-3 py-2 text-left flex items-center justify-between gap-3 hover:bg-ink-panel transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-bone block truncate">{race.name}</span>
                  <span className="font-mono text-[10px] text-bone-mute">{race.city}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-[10px] text-bone-mute block">
                    {new Date(race.date + 'T12:00:00Z').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="font-mono text-[10px] text-bone-dim">
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
        <p className="font-mono text-xs text-bone-dim uppercase tracking-widest">Goal Race</p>
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
    <div className="border border-accent/30 bg-ink-shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-display tracking-widest text-2xl uppercase text-bone">{race.name}</p>
          <p className="font-mono text-xs text-bone-dim">{formatDisplayDate(race.date)}</p>
        </div>
        <LevelBadge level={race.level} />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="font-mono text-sm text-bone-dim">
          {distanceLabelFromKm(race.distance_km)}
        </span>
        {race.goal_time && (
          <span className="font-mono text-sm text-bone-mute">
            Goal: {race.goal_time}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-ink-line">
        <button onClick={onEdit} className="font-mono text-xs text-bone-mute hover:text-accent transition-colors">
          Edit
        </button>
        {!confirmDel ? (
          <button onClick={onRequestDelete} className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors">
            Remove goal
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-signal-miss">Demote this race?</span>
            <button onClick={onConfirmDelete} className="font-mono text-xs text-signal-miss hover:underline">Yes</button>
            <button onClick={onCancelDelete} className="font-mono text-xs text-bone-mute hover:text-bone transition-colors">Cancel</button>
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
        <p className="font-mono text-xs text-bone-dim uppercase tracking-widest">Tune-up Races</p>
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
        <div className="divide-y divide-ink-line border border-ink-line">
          {tuneupRaces.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <p className="font-mono text-sm text-bone truncate">{r.name}</p>
                <p className="font-mono text-xs text-bone-mute">
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
    <div className="border border-ink-line bg-ink-shadow p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Date */}
        <div className="space-y-1">
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Date *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus:outline-none focus:border-accent"
          />
        </div>

        {/* Name — NZ race search combobox */}
        <div className="space-y-1">
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Race Name *</label>
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
                className="flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
              >
                Event page <ExternalLink size={10} aria-hidden="true" />
              </a>
              {form.raceSearchUrl && (
                <>
                  <span className="font-mono text-[10px] text-bone-mute">·</span>
                  <a
                    href={form.raceSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-[10px] text-bone-mute hover:text-bone hover:underline"
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
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Distance *</label>
          <select
            value={form.distanceLabel}
            onChange={(e) => onDistanceChange(e.target.value)}
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus:outline-none focus:border-accent"
          >
            {DISTANCE_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Custom distance_km if Other */}
        {isOther && (
          <div className="space-y-1">
            <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Distance (km) *</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.distance_km}
              onChange={(e) => onChange({ ...form, distance_km: e.target.value })}
              placeholder="e.g. 60"
              className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
            />
          </div>
        )}

        {/* Goal time */}
        <div className="space-y-1">
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Goal Time (optional)</label>
          <input
            type="text"
            value={form.goal_time}
            onChange={(e) => onChange({ ...form, goal_time: e.target.value })}
            placeholder="H:MM:SS"
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
          />
        </div>

        {/* Level */}
        {showLevel && (
          <div className="space-y-1">
            <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Level</label>
            <select
              value={form.level}
              onChange={(e) => onChange({ ...form, level: e.target.value as Level })}
              className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus:outline-none focus:border-accent"
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
          className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-accent text-ink hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-ink-line text-bone-mute hover:text-bone transition-colors"
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
    <section className="border border-ink-line p-6 space-y-4">
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
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            Weekly Volume Cap (km)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            placeholder="e.g. 80"
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            Long Run Cap (km)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={longRun}
            onChange={(e) => setLongRun(e.target.value)}
            placeholder="e.g. 32"
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-accent text-ink hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    <section className="border border-ink-line p-6 space-y-4">
      <SectionLabel>commitments</SectionLabel>

      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-bone-dim uppercase tracking-widest">Calendar Events</p>
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
        <div className="divide-y divide-ink-line border border-ink-line">
          {events.map((ev) => (
            <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono text-sm text-bone">{ev.title}</p>
                  <span className={`font-mono text-xs border px-1.5 py-0.5 ${eventTypeBadgeClass(ev.type)}`}>
                    {EVENT_TYPE_LABELS[ev.type as EventType] ?? ev.type}
                  </span>
                </div>
                <p className="font-mono text-xs text-bone-mute">{formatDisplayDate(ev.date)}</p>
                {ev.notes && (
                  <p className="font-mono text-xs text-bone-mute leading-relaxed">{ev.notes}</p>
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
        <div className="border border-ink-line bg-ink-shadow p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus:outline-none focus:border-accent"
              />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Christmas Day"
                className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus:outline-none focus:border-accent"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional details"
                className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleAdd}
              disabled={saving || !form.date || !form.title}
              className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-accent text-ink hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Add Event'}
            </button>
            <button
              onClick={() => { setAdding(false); setForm(BLANK_EVENT_FORM); }}
              disabled={saving}
              className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-ink-line text-bone-mute hover:text-bone transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
