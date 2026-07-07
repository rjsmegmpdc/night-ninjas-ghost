import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';
import {
  fetchClubData,
  startClubAdminAuth,
  captureClubAdminToken,
  hasClubAdminSession,
  endClubAdminSession,
  addMember,
  addResult,
  upsertChampsEntry,
  setWinner,
  ClubNotConfiguredError,
  type ClubData,
  type ClubChampsRow,
} from '@/lib/club/api';
import {
  rankChamps,
  ageGroupFor,
  parseTimeS,
  formatTimeS,
  AGE_GROUPS,
  type ChampsEntry,
  type AgeGroup,
} from '@/lib/club/champs-pure';
import {
  buildLeaderboard,
  type CourseResult,
  type WindowFilter,
  type SexFilter,
} from '@/lib/club/leaderboard-pure';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatActivityTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatActivityDate(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** Monday-based ISO week start for a given date string (YYYY-MM-DD). */
function weekStart(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - daysFromMon);
  const y = mon.getUTCFullYear();
  const mo = String(mon.getUTCMonth() + 1).padStart(2, '0');
  const day = String(mon.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Short week label: "14 Jun" from a YYYY-MM-DD string. */
function weekLabel(isoMonday: string): string {
  const d = new Date(isoMonday + 'T12:00:00');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunRow {
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  name: string;
}

interface GoalRace {
  date: string;
  name: string;
  distance_km: number;
}

interface WeekBucket {
  label: string;
  km: number;
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

type SaveStatus = 'idle' | 'saved';

function SavedBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
      Saved.
    </span>
  );
}

const INPUT_CLASS =
  'w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-bone ' +
  'placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors';

const LABEL_CLASS = 'block font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-1';

// ---------------------------------------------------------------------------
// Courses — definitions
// ---------------------------------------------------------------------------

type CourseTab = 'champs' | 'ninja-loop' | 'waiwera' | 'parkrun' | 'relays' | 'mine';

const TABS: { key: CourseTab; label: string }[] = [
  { key: 'champs',     label: 'Ninja Champs' },
  { key: 'ninja-loop', label: 'Ninja Loop' },
  { key: 'waiwera',    label: 'Waiwera' },
  { key: 'parkrun',    label: 'Parkrun' },
  { key: 'relays',     label: 'Road Relays' },
  { key: 'mine',       label: 'My Training' },
];

// External sites — URLs to come; null renders a "coming soon" card
const PARKRUN_URL: string | null = null;
const RELAYS_URL: string | null = null;

// ---------------------------------------------------------------------------
// Admin bar
// ---------------------------------------------------------------------------

function AdminBar({ isAdmin, onSignOut }: { isAdmin: boolean; onSignOut: () => void }) {
  if (isAdmin) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-signal-ok">● Admin mode</span>
        <button
          type="button"
          onClick={onSignOut}
          className="font-mono text-[10px] text-bone-mute hover:text-bone transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={startClubAdminAuth}
      className="font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-accent transition-colors"
    >
      Admin →
    </button>
  );
}

// ---------------------------------------------------------------------------
// Member picker — select existing or add new inline (shared by both forms)
// ---------------------------------------------------------------------------

function MemberPicker({
  members,
  value,
  onChange,
  onNewMember,
}: {
  members: ClubData['members'];
  value: number | 'new' | '';
  onChange: (v: number | 'new' | '') => void;
  onNewMember: (m: { name: string; sex: 'M' | 'F'; yob: number | null }) => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [newSex, setNewSex] = useState<'M' | 'F'>('M');
  const [newYob, setNewYob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNew() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onNewMember({
        name: newName.trim(),
        sex: newSex,
        yob: /^\d{4}$/.test(newYob.trim()) ? Number(newYob.trim()) : null,
      });
      setNewName(''); setNewYob('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className={LABEL_CLASS}>Athlete</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === 'new' ? 'new' : e.target.value === '' ? '' : Number(e.target.value))}
        className={INPUT_CLASS}
      >
        <option value="">Select athlete…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
        <option value="new">+ New member…</option>
      </select>

      {value === 'new' && (
        <div className="m3-card p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            className={INPUT_CLASS}
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={newSex} onChange={(e) => setNewSex(e.target.value as 'M' | 'F')} className={INPUT_CLASS}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={newYob}
              onChange={(e) => setNewYob(e.target.value)}
              placeholder="Birth year (opt.)"
              className={INPUT_CLASS}
            />
          </div>
          {error && <p className="font-mono text-xs text-signal-miss">{error}</p>}
          <button
            type="button"
            onClick={() => void saveNew()}
            disabled={busy || !newName.trim()}
            className="w-full font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add member'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course leaderboard (Ninja Loop / Waiwera)
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS: { value: WindowFilter; label: string }[] = [
  { value: 'rolling-12mo',  label: 'Last 12 months' },
  { value: 'calendar-year', label: 'This year' },
  { value: 'all-time',      label: 'All time' },
];

function LeaderboardView({
  course,
  data,
  isAdmin,
  onRefresh,
}: {
  course: 'ninja-loop' | 'waiwera';
  data: ClubData;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [win, setWin] = useState<WindowFilter>('rolling-12mo');
  const [sex, setSex] = useState<SexFilter>('all');
  const [ageGroup, setAgeGroup] = useState<AgeGroup | 'all'>('all');
  const [legend, setLegend] = useState(false);

  const courseResults: CourseResult[] = useMemo(
    () => data.results
      .filter((r) => r.course === course)
      .map((r) => ({
        id: r.id, memberId: r.member_id, name: r.name, sex: r.sex, yob: r.yob,
        date: r.date, timeS: r.time_s,
      })),
    [data.results, course],
  );

  const board = useMemo(
    () => buildLeaderboard(courseResults, { window: win, sex, ageGroup, legend }, todayIso()),
    [courseResults, win, sex, ageGroup, legend],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={win} onChange={(e) => setWin(e.target.value as WindowFilter)} className="bg-surface-container-high rounded-lg border border-transparent px-2 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-colors">
          {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex gap-1">
          {(['all', 'M', 'F'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`px-3 py-1.5 font-mono text-xs uppercase rounded-full transition-colors ${sex === s ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup | 'all')} className="bg-surface-container-high rounded-lg border border-transparent px-2 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-colors">
          <option value="all">All ages</option>
          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setLegend(!legend)}
          className={`px-3 py-1.5 rounded-full font-mono text-xs uppercase tracking-widest transition-colors ${legend ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
          title="Rank by number of efforts, like Strava's Local Legend"
        >
          ★ Legend
        </button>
      </div>

      {/* Table */}
      {board.length === 0 ? (
        <p className="font-mono text-sm text-bone-mute py-4">No efforts recorded{win !== 'all-time' ? ' in this window' : ''} yet.</p>
      ) : (
        <div className="m3-card divide-y divide-ink-line">
          {board.map((row) => (
            <div key={row.memberId} className="px-3 sm:px-4 py-2.5 flex items-center gap-3 hover:bg-on-surface/4 transition-colors">
              <span className={`font-display tracking-widest text-lg w-7 text-right shrink-0 ${row.rank <= 3 ? 'text-accent' : 'text-bone-mute'}`}>
                {row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-bone truncate">{row.name}</p>
                <p className="font-mono text-[10px] text-bone-mute">
                  {row.sex}{row.ageGroup ? ` · ${row.ageGroup}` : ''} · {formatShortDate(row.date)}
                </p>
              </div>
              <div className="text-right shrink-0">
                {legend ? (
                  <p className="font-display tracking-widest text-lg text-bone leading-none">{row.efforts}<span className="font-mono text-[10px] text-bone-mute ml-1">efforts</span></p>
                ) : (
                  <>
                    <p className="font-display tracking-widest text-lg text-bone leading-none tabular-nums">{formatTimeS(row.bestTimeS!)}</p>
                    {row.efforts > 1 && <p className="font-mono text-[10px] text-bone-mute">{row.efforts} efforts</p>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && <AddResultForm course={course} data={data} onSaved={onRefresh} />}
    </div>
  );
}

function AddResultForm({
  course,
  data,
  onSaved,
}: {
  course: string;
  data: ClubData;
  onSaved: () => void;
}) {
  const [member, setMember] = useState<number | 'new' | ''>('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const timeS = parseTimeS(time);
  const canSave = typeof member === 'number' && !!date && timeS !== null;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setStatus(null);
    try {
      await addResult({ memberId: member as number, course, date, timeS: timeS! });
      setTime('');
      setStatus({ type: 'ok', msg: 'Saved — leaderboard updated.' });
      onSaved();
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-primary-container/30 p-4 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">Add effort</p>
      <MemberPicker
        members={data.members}
        value={member}
        onChange={setMember}
        onNewMember={async (m) => { const id = await addMember(m); onSaved(); setMember(id); }}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Time</label>
          <input
            type="text"
            inputMode="numeric"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="mm:ss"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      {status && (
        <p className={`font-mono text-xs ${status.type === 'ok' ? 'text-signal-ok' : 'text-signal-miss'}`} role="status">{status.msg}</p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || busy}
        className="w-full sm:w-auto font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save effort'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ninja Champs
// ---------------------------------------------------------------------------

function champsRowToEntry(r: ClubChampsRow): ChampsEntry {
  return {
    id: r.id, name: r.name, sex: r.sex, yob: r.yob,
    pb5kS: r.pb5k_s, pb10kS: r.pb10k_s, pb21kS: r.pb21k_s, actualS: r.actual_s,
  };
}

function improvementLabel(improvement: number): { text: string; cls: string } {
  const pct = (improvement - 1) * 100;
  if (pct >= 0) return { text: `+${pct.toFixed(1)}%`, cls: 'text-signal-ok' };
  return { text: `${pct.toFixed(1)}%`, cls: 'text-signal-warn' };
}

function ChampsView({
  data,
  isAdmin,
  onRefresh,
}: {
  data: ClubData;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const currentYear = Number(todayIso().slice(0, 4));
  const years = useMemo(() => {
    const ys = new Set<number>([currentYear, ...data.champsEntries.map((e) => e.year)]);
    return [...ys].sort((a, b) => b - a);
  }, [data.champsEntries, currentYear]);
  const [year, setYear] = useState(currentYear);

  const yearEntries = data.champsEntries.filter((e) => e.year === year);
  const ranked = useMemo(() => rankChamps(yearEntries.map(champsRowToEntry)), [yearEntries]);

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-2xl">
        Once a year at the Millwater Half Marathon. Your baseline is a
        Riegel-predicted half time from your best 5k / 10k / 21.1k over the
        last 12 months — the ranking rewards <strong className="text-bone">improvement</strong>,
        not raw speed. Registration happens on the day; Night Ninjas members only.
      </p>

      {/* Year selector */}
      <div className="flex items-center gap-2">
        <label className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Year</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-surface-container-high rounded-lg border border-transparent px-2 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-colors">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Live standings */}
      {ranked.length === 0 ? (
        <p className="font-mono text-sm text-bone-mute py-2">No entries for {year} yet.</p>
      ) : (
        <div className="m3-card divide-y divide-ink-line">
          {ranked.map((e) => (
            <div key={e.id} className="px-3 sm:px-4 py-2.5 flex items-center gap-3 hover:bg-on-surface/4 transition-colors">
              <span className={`font-display tracking-widest text-lg w-7 text-right shrink-0 ${e.rank === 1 ? 'text-accent' : e.rank ? 'text-bone-dim' : 'text-bone-mute'}`}>
                {e.rank ?? '—'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-bone truncate">{e.name}</p>
                <p className="font-mono text-[10px] text-bone-mute">
                  {e.baselineS
                    ? `baseline ${formatTimeS(e.baselineS)} (from ${e.baselineSource})`
                    : 'no PBs entered'}
                  {e.sex ? ` · ${e.sex}` : ''}{ageGroupFor(e.yob, year) ? ` · ${ageGroupFor(e.yob, year)}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                {e.actualS ? (
                  <>
                    <p className="font-display tracking-widest text-lg text-bone leading-none tabular-nums">{formatTimeS(e.actualS)}</p>
                    {e.improvement !== null && (
                      <p className={`font-mono text-xs font-bold ${improvementLabel(e.improvement).cls}`}>
                        {improvementLabel(e.improvement).text}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-mono text-xs text-bone-mute">registered</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && <ChampsEntryForm year={year} data={data} onSaved={onRefresh} />}

      {/* Past winners */}
      <div className="space-y-3">
        <p className="font-mono text-xs text-bone uppercase tracking-widest">Past winners</p>
        {data.champsWinners.length === 0 ? (
          <p className="font-mono text-sm text-bone-mute">No winners recorded yet.</p>
        ) : (
          <div className="m3-card divide-y divide-ink-line">
            {data.champsWinners.map((w) => (
              <div key={w.year} className="px-4 py-2.5 flex items-center gap-4">
                <span className="font-display tracking-widest text-lg text-accent shrink-0">{w.year}</span>
                <span className="font-mono text-sm text-bone flex-1 min-w-0 truncate">{w.name}</span>
                {w.note && <span className="font-mono text-[10px] text-bone-mute shrink-0">{w.note}</span>}
              </div>
            ))}
          </div>
        )}
        {isAdmin && <WinnerForm onSaved={onRefresh} />}
      </div>
    </div>
  );
}

function ChampsEntryForm({
  year,
  data,
  onSaved,
}: {
  year: number;
  data: ClubData;
  onSaved: () => void;
}) {
  const [member, setMember] = useState<number | 'new' | ''>('');
  const [pb5k, setPb5k] = useState('');
  const [pb10k, setPb10k] = useState('');
  const [pb21k, setPb21k] = useState('');
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Pre-fill when picking an athlete who already has an entry this year
  useEffect(() => {
    if (typeof member !== 'number') return;
    const existing = data.champsEntries.find((e) => e.member_id === member && e.year === year);
    setPb5k(existing?.pb5k_s ? formatTimeS(existing.pb5k_s) : '');
    setPb10k(existing?.pb10k_s ? formatTimeS(existing.pb10k_s) : '');
    setPb21k(existing?.pb21k_s ? formatTimeS(existing.pb21k_s) : '');
    setActual(existing?.actual_s ? formatTimeS(existing.actual_s) : '');
  }, [member, year, data.champsEntries]);

  function parseOpt(v: string): { ok: boolean; value: number | null } {
    if (!v.trim()) return { ok: true, value: null };
    const s = parseTimeS(v);
    return { ok: s !== null, value: s };
  }

  const p5 = parseOpt(pb5k), p10 = parseOpt(pb10k), p21 = parseOpt(pb21k), pAct = parseOpt(actual);
  const allValid = p5.ok && p10.ok && p21.ok && pAct.ok;
  const canSave = typeof member === 'number' && allValid;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setStatus(null);
    try {
      await upsertChampsEntry({
        memberId: member as number, year,
        pb5kS: p5.value, pb10kS: p10.value, pb21kS: p21.value, actualS: pAct.value,
      });
      setStatus({ type: 'ok', msg: 'Saved — standings updated.' });
      onSaved();
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-primary-container/30 p-4 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
        Register / update entry · {year}
      </p>
      <MemberPicker
        members={data.members}
        value={member}
        onChange={setMember}
        onNewMember={async (m) => { const id = await addMember(m); onSaved(); setMember(id); }}
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={LABEL_CLASS}>5k PB</label>
          <input type="text" inputMode="numeric" value={pb5k} onChange={(e) => setPb5k(e.target.value)} placeholder="19:30" className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>10k PB</label>
          <input type="text" inputMode="numeric" value={pb10k} onChange={(e) => setPb10k(e.target.value)} placeholder="41:00" className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>21.1k PB</label>
          <input type="text" inputMode="numeric" value={pb21k} onChange={(e) => setPb21k(e.target.value)} placeholder="1:32:00" className={INPUT_CLASS} />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Millwater finish time (leave blank until they cross the line)</label>
        <input type="text" inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="1:29:05" className={INPUT_CLASS} />
      </div>
      {!allValid && <p className="font-mono text-xs text-signal-warn">Times are mm:ss or h:mm:ss.</p>}
      {status && (
        <p className={`font-mono text-xs ${status.type === 'ok' ? 'text-signal-ok' : 'text-signal-miss'}`} role="status">{status.msg}</p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || busy}
        className="w-full sm:w-auto font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save entry'}
      </button>
    </div>
  );
}

function WinnerForm({ onSaved }: { onSaved: () => void }) {
  const [year, setYear] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = /^\d{4}$/.test(year.trim()) && !!name.trim();

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await setWinner({ year: Number(year), name: name.trim(), note: note.trim() || null });
      setYear(''); setName(''); setNote('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m3-card p-4 space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Record a past winner</p>
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <input type="text" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className={INPUT_CLASS} />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Winner's name" className={INPUT_CLASS} />
      </div>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional, e.g. +6.2%)" className={INPUT_CLASS} />
      {error && <p className="font-mono text-xs text-signal-miss">{error}</p>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || busy}
        className="font-mono text-xs uppercase tracking-widest rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 hover:shadow-sm transition-all disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save winner'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// External course cards (Parkrun / Road Relays)
// ---------------------------------------------------------------------------

function ExternalCourseCard({ title, url, blurb }: { title: string; url: string | null; blurb: string }) {
  return (
    <div className="m3-card p-6 space-y-3">
      <h3 className="font-display tracking-widest text-2xl uppercase text-bone">{title}</h3>
      <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-xl">{blurb}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all"
        >
          Open results site <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : (
        <p className="font-mono text-xs text-bone-mute m3-card inline-block px-3 py-1.5">
          Results site coming soon
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy personal sections (My Training tab)
// ---------------------------------------------------------------------------

function IdentitySection() {
  const [athleteName, setAthleteName] = useState('');
  const [parkrunId, setParkrunId] = useState('');
  const [nameStatus, setNameStatus] = useState<SaveStatus>('idle');
  const [parkrunStatus, setParkrunStatus] = useState<SaveStatus>('idle');
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parkrunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const rows = await query(
        "SELECT key, value FROM settings WHERE key IN ('club.athlete_name','club.parkrun_id')",
      );
      for (const r of rows) {
        if (r[0] === 'club.athlete_name') setAthleteName((r[1] as string) ?? '');
        if (r[0] === 'club.parkrun_id') setParkrunId((r[1] as string) ?? '');
      }
    }
    load().catch(() => undefined);
  }, []);

  async function handleNameBlur() {
    await upsertSetting('club.athlete_name', athleteName);
    setNameStatus('saved');
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => setNameStatus('idle'), 2000);
  }

  async function handleParkrunBlur() {
    await upsertSetting('club.parkrun_id', parkrunId);
    setParkrunStatus('saved');
    if (parkrunTimerRef.current) clearTimeout(parkrunTimerRef.current);
    parkrunTimerRef.current = setTimeout(() => setParkrunStatus('idle'), 2000);
  }

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="club-identity">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · identity</p>
        <h2 id="club-identity" className="font-display tracking-widest text-2xl uppercase text-bone">
          Your Details
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="club-athlete-name" className={LABEL_CLASS}>
            Athlete name
          </label>
          <input
            id="club-athlete-name"
            type="text"
            value={athleteName}
            onChange={(e) => setAthleteName(e.target.value)}
            onBlur={() => { handleNameBlur().catch(() => undefined); }}
            placeholder="e.g. Matt Harkness"
            className={INPUT_CLASS}
          />
          <div className="mt-1 h-4">
            <SavedBadge status={nameStatus} />
          </div>
        </div>

        <div>
          <label htmlFor="club-parkrun-id" className={LABEL_CLASS}>
            parkrun ID
          </label>
          <div className="flex">
            <span
              aria-hidden="true"
              className="flex items-center px-3 bg-ink-panel border border-r-0 border-ink-line font-mono text-sm text-bone-mute select-none"
            >
              A
            </span>
            <input
              id="club-parkrun-id"
              type="text"
              value={parkrunId}
              onChange={(e) => setParkrunId(e.target.value.replace(/\D/g, ''))}
              onBlur={() => { handleParkrunBlur().catch(() => undefined); }}
              placeholder="e.g. 12345"
              aria-label="parkrun ID number"
              className={INPUT_CLASS}
            />
          </div>
          <div className="mt-1 h-4">
            <SavedBadge status={parkrunStatus} />
          </div>
        </div>
      </div>
    </section>
  );
}

function WeekBarChart({ weeks }: { weeks: WeekBucket[] }) {
  const maxKm = Math.max(0.1, ...weeks.map((w) => w.km));
  const BAR_MAX_PX = 60;

  return (
    <div className="flex items-end gap-2 h-20" role="img" aria-label="Weekly kilometre chart">
      {weeks.map((w) => {
        const barH = Math.round((w.km / maxKm) * BAR_MAX_PX);
        return (
          <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-bone-mute tabular-nums">
              {w.km > 0 ? w.km.toFixed(0) : '—'}
            </span>
            <div className="w-full bg-accent/30 relative" style={{ height: `${BAR_MAX_PX}px` }} title={`${w.label}: ${w.km.toFixed(1)} km`}>
              <div className="absolute bottom-0 left-0 right-0 bg-accent transition-all" style={{ height: `${barH}px` }} />
            </div>
            <span className="font-mono text-[10px] text-bone-mute text-center leading-tight">
              {w.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface SummaryData {
  totalKm: number;
  totalRuns: number;
  avgKm: number;
  longestKm: number;
  totalTimeS: number;
  weeks: WeekBucket[];
}

function SummaryCard({ data }: { data: SummaryData }) {
  const { totalKm, totalRuns, longestKm, totalTimeS, weeks } = data;

  const stats: { label: string; value: string }[] = [
    { label: 'Total km', value: totalKm.toFixed(1) },
    { label: 'Total runs', value: String(totalRuns) },
    { label: 'Longest run', value: `${longestKm.toFixed(1)} km` },
    { label: 'Total time', value: formatTime(totalTimeS) },
  ];

  return (
    <section className="m3-card p-6 space-y-6" aria-labelledby="club-summary">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · last 4 weeks</p>
        <h2 id="club-summary" className="font-display tracking-widest text-2xl uppercase text-bone">
          Training Summary
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-container rounded-xl p-4 sm:p-5 space-y-1">
            <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
              {s.label}
            </p>
            <p className="font-display tracking-widest text-2xl text-bone leading-none">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-3">
          Weekly km
        </p>
        <WeekBarChart weeks={weeks} />
      </div>
    </section>
  );
}

function ShareCard({
  summary,
  athleteName,
  parkrunId,
  goalRace,
}: {
  summary: SummaryData;
  athleteName: string;
  parkrunId: string;
  goalRace: GoalRace | null;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasEnoughData = summary.totalRuns >= 3;

  function buildShareText(): string {
    const name = athleteName.trim() || 'Night Ninja';
    const dateStr = new Date().toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const lines: string[] = [
      `${name} · Training Summary`,
      dateStr,
      '',
      'Last 4 weeks:',
      `• ${summary.totalRuns} runs · ${summary.totalKm.toFixed(1)}km total`,
      `• Longest run: ${summary.longestKm.toFixed(1)}km`,
      `• Weekly avg: ${summary.avgKm.toFixed(1)}km`,
    ];
    if (goalRace) {
      lines.push('');
      lines.push(`Goal race: ${goalRace.name} · ${goalRace.date}`);
    }
    if (parkrunId.trim()) {
      lines.push('');
      lines.push(`parkrun ID: A${parkrunId.trim()}`);
    }
    return lines.join('\n');
  }

  function handleCopy() {
    if (!hasEnoughData) return;
    const text = buildShareText();
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(() => undefined);
  }

  const previewText = hasEnoughData ? buildShareText() : '';

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="club-share">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · share</p>
        <h2 id="club-share" className="font-display tracking-widest text-2xl uppercase text-bone">
          Share Training
        </h2>
      </div>

      {!hasEnoughData ? (
        <p className="font-mono text-sm text-bone-dim leading-relaxed">
          Sync your Strava activities in Setup to generate a summary.
        </p>
      ) : (
        <>
          <pre
            className="bg-surface-container-high rounded-lg px-4 py-3 font-mono text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap break-words"
            aria-label="Share text preview"
          >
            {previewText}
          </pre>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 font-mono text-xs uppercase tracking-widest hover:shadow-sm transition-all"
            >
              Copy training summary
            </button>
            {copyStatus === 'copied' && (
              <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
                Copied to clipboard!
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function RecentRunsSection({ runs }: { runs: RunRow[] }) {
  const recent = runs.slice(0, 10);

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="club-recent">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          club · recent runs
        </p>
        <h2 id="club-recent" className="font-display tracking-widest text-2xl uppercase text-bone">
          Recent Activity
        </h2>
      </div>

      {recent.length === 0 ? (
        <p className="font-mono text-sm text-bone-dim">No runs in the last 4 weeks.</p>
      ) : (
        <ul className="divide-y divide-ink-line" role="list">
          {recent.map((run, i) => {
            const km = run.distance_m / 1000;
            const name = run.name.length > 40 ? run.name.slice(0, 40) + '…' : run.name;
            return (
              <li
                key={`${run.start_date}-${i}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
                    {formatActivityDate(run.start_date)}
                  </p>
                  <p className="font-mono text-sm text-bone truncate">{name}</p>
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  <p className="font-display tracking-widest text-base text-bone leading-none">
                    {km.toFixed(1)} km
                  </p>
                  <p className="font-mono text-[10px] text-bone-mute tabular-nums">
                    {formatActivityTime(run.moving_time_s)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClubPage() {
  const { ready, error: dbError } = useDb();

  // Legacy personal data
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [athleteName, setAthleteName] = useState('');
  const [parkrunId, setParkrunId] = useState('');
  const [goalRace, setGoalRace] = useState<GoalRace | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Club shared data
  const [tab, setTab] = useState<CourseTab>('champs');
  const [clubData, setClubData] = useState<ClubData | null>(null);
  const [clubError, setClubError] = useState<'not-configured' | string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadClub = useCallback(async () => {
    try {
      const data = await fetchClubData();
      setClubData(data);
      setClubError(null);
    } catch (e) {
      if (e instanceof ClubNotConfiguredError) setClubError('not-configured');
      else setClubError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Returning from the Access admin login?
  useEffect(() => {
    if (captureClubAdminToken()) setIsAdmin(true);
    else if (hasClubAdminSession()) setIsAdmin(true);
  }, []);

  useEffect(() => {
    void loadClub();
  }, [loadClub]);

  const load = useCallback(async () => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 28);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const [actRows, settingsRows, raceRows] = await Promise.all([
      query(
        `SELECT start_date, distance, moving_time, sport_type, name
         FROM activities WHERE start_date >= ? ORDER BY start_date DESC`,
        [cutoffIso],
      ),
      query("SELECT key, value FROM settings WHERE key IN ('club.parkrun_id','club.athlete_name')"),
      query("SELECT date, name, distance_km FROM races WHERE is_goal = 1 LIMIT 1"),
    ]);

    let name = '';
    let pid = '';
    for (const r of settingsRows) {
      if (r[0] === 'club.athlete_name') name = (r[1] as string) ?? '';
      if (r[0] === 'club.parkrun_id') pid = (r[1] as string) ?? '';
    }

    const runRows: RunRow[] = actRows
      .filter((r) => String(r[3]).toLowerCase().includes('run'))
      .map((r) => ({
        start_date: r[0] as string,
        distance_m: (r[1] as number) ?? 0,
        moving_time_s: (r[2] as number) ?? 0,
        name: (r[4] as string) ?? '',
      }));

    let race: GoalRace | null = null;
    if (raceRows.length > 0) {
      race = {
        date: raceRows[0][0] as string,
        name: raceRows[0][1] as string,
        distance_km: raceRows[0][2] as number,
      };
    }

    setRuns(runRows);
    setAthleteName(name);
    setParkrunId(pid);
    setGoalRace(race);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    load().catch(() => undefined);
  }, [ready, load]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || !loaded) return <PageSkeleton />;

  // Legacy summary computation
  const totalKm = runs.reduce((s, r) => s + r.distance_m / 1000, 0);
  const totalRuns = runs.length;
  const avgKm = totalRuns > 0 ? totalKm / totalRuns : 0;
  const longestKm = Math.max(0, ...runs.map((r) => r.distance_m / 1000));
  const totalTimeS = runs.reduce((s, r) => s + r.moving_time_s, 0);

  const weekMap = new Map<string, number>();
  for (const run of runs) {
    const ws = weekStart(run.start_date);
    weekMap.set(ws, (weekMap.get(ws) ?? 0) + run.distance_m / 1000);
  }

  const now = new Date();
  const nowDow = now.getUTCDay();
  const daysFromMon = nowDow === 0 ? 6 : nowDow - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysFromMon);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const weekBuckets: WeekBucket[] = [];
  for (let i = 3; i >= 0; i--) {
    const mon = new Date(thisMonday);
    mon.setUTCDate(thisMonday.getUTCDate() - i * 7);
    const y = mon.getUTCFullYear();
    const mo = String(mon.getUTCMonth() + 1).padStart(2, '0');
    const day = String(mon.getUTCDate()).padStart(2, '0');
    const key = `${y}-${mo}-${day}`;
    weekBuckets.push({ label: weekLabel(key), km: weekMap.get(key) ?? 0 });
  }

  const summaryData: SummaryData = {
    totalKm, totalRuns, avgKm, longestKm, totalTimeS, weeks: weekBuckets,
  };

  const needsClubData = tab === 'champs' || tab === 'ninja-loop' || tab === 'waiwera';

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
            <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
              Club
            </h1>
            <p className="font-mono text-xs text-bone-mute">Night Ninjas — courses, leaderboards, Champs.</p>
          </div>
          <AdminBar isAdmin={isAdmin} onSignOut={() => { endClubAdminSession(); setIsAdmin(false); }} />
        </div>
      </header>

      {/* Course tabs — swipeable on mobile */}
      <nav className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Club courses">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-1.5 font-mono text-xs uppercase tracking-widest rounded-full transition-colors ${
              tab === t.key
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Shared-data tabs */}
      {needsClubData && clubError === 'not-configured' && (
        <div className="m3-card p-6 space-y-2">
          <p className="font-mono text-xs text-bone uppercase tracking-widest">Not switched on yet</p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-xl">
            The club datastore hasn't been set up on this deployment. Admin: see{' '}
            <code className="text-bone">docs/CLUB-SETUP.md</code> — one D1 database and two
            config lines.
          </p>
        </div>
      )}
      {needsClubData && clubError && clubError !== 'not-configured' && (
        <div className="border border-signal-miss/40 p-4">
          <p className="font-mono text-xs text-signal-miss">Couldn't load club data: {clubError}</p>
          <button type="button" onClick={() => void loadClub()} className="font-mono text-xs text-bone-mute hover:text-bone mt-2">
            Retry →
          </button>
        </div>
      )}

      {needsClubData && clubData && !clubError && (
        <>
          {tab === 'champs' && (
            <ChampsView data={clubData} isAdmin={isAdmin} onRefresh={() => void loadClub()} />
          )}
          {tab === 'ninja-loop' && (
            <LeaderboardView course="ninja-loop" data={clubData} isAdmin={isAdmin} onRefresh={() => void loadClub()} />
          )}
          {tab === 'waiwera' && (
            <LeaderboardView course="waiwera" data={clubData} isAdmin={isAdmin} onRefresh={() => void loadClub()} />
          )}
        </>
      )}

      {tab === 'parkrun' && (
        <ExternalCourseCard
          title="Parkrun"
          url={PARKRUN_URL}
          blurb="Saturday 9am, everywhere. Club parkrun results live on an external site."
        />
      )}
      {tab === 'relays' && (
        <ExternalCourseCard
          title="Road Relays"
          url={RELAYS_URL}
          blurb="Team relay events. Results and team allocations live on an external site."
        />
      )}

      {tab === 'mine' && (
        <div className="space-y-8">
          <IdentitySection />
          <SummaryCard data={summaryData} />
          <ShareCard
            summary={summaryData}
            athleteName={athleteName}
            parkrunId={parkrunId}
            goalRace={goalRace}
          />
          <RecentRunsSection runs={runs} />
        </div>
      )}
    </div>
  );
}
