import { useState, useEffect, useCallback, useRef } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';
import { buildAthleteSnapshot } from '@/lib/ai/snapshot-builder';
import { snapshotToText } from '@/lib/ai/context-pure';
import { getCoachMessages } from '@/lib/coach/coach-voice-pure';
import { streamCoachReply } from '@/lib/ai/coach-client';
import { getSetting } from '@/lib/db/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalEntry {
  id: number;
  date: string;
  sleepQuality: number | null;
  energyLevel: number | null;
  stressLevel: number | null;
  restingHr: number | null;
  hrv: number | null;
  weightKg: number | null;
  notes: string | null;
}

interface ActivitySummary {
  cnt: number;
  km: number;
}

// ---------------------------------------------------------------------------
// Date helpers — UTC to avoid timezone drift on ISO date strings
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function cutoffIso(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Last N ISO date strings (today first) */
function last14Dates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates; // newest first
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function loadData(cutoff42: string): Promise<{
  journal: JournalEntry[];
  actMap: Map<string, ActivitySummary>;
}> {
  const [journalRows, actRows] = await Promise.all([
    query(
      'SELECT id, date, sleep_quality, energy_level, stress_level, resting_hr, hrv, weight_kg, notes FROM journal WHERE date >= ? ORDER BY date DESC',
      [cutoff42]
    ),
    query(
      "SELECT date(start_date) as d, COUNT(*) as cnt, ROUND(SUM(distance)/1000,1) as km FROM activities WHERE start_date >= ? GROUP BY date(start_date)",
      [cutoff42]
    ),
  ]);

  const journal: JournalEntry[] = journalRows.map((r) => ({
    id: r[0] as number,
    date: r[1] as string,
    sleepQuality: r[2] as number | null,
    energyLevel: r[3] as number | null,
    stressLevel: r[4] as number | null,
    restingHr: r[5] as number | null,
    hrv: r[6] as number | null,
    weightKg: r[7] as number | null,
    notes: r[8] as string | null,
  }));

  const actMap = new Map<string, ActivitySummary>();
  for (const r of actRows) {
    actMap.set(r[0] as string, { cnt: r[1] as number, km: r[2] as number });
  }

  return { journal, actMap };
}

// ---------------------------------------------------------------------------
// Emoji pickers
// ---------------------------------------------------------------------------

const SLEEP_OPTIONS = [
  { v: 1, label: '😴 1' },
  { v: 2, label: '😪 2' },
  { v: 3, label: '😐 3' },
  { v: 4, label: '😊 4' },
  { v: 5, label: '😄 5' },
];

const ENERGY_OPTIONS = [
  { v: 1, label: '😩 1' },
  { v: 2, label: '😔 2' },
  { v: 3, label: '😐 3' },
  { v: 4, label: '🙂 4' },
  { v: 5, label: '😄 5' },
];

const STRESS_OPTIONS = [
  { v: 1, label: '😌 1' },
  { v: 2, label: '🙂 2' },
  { v: 3, label: '😐 3' },
  { v: 4, label: '😟 4' },
  { v: 5, label: '😤 5' },
];

// ---------------------------------------------------------------------------
// EmojiPicker sub-component
// ---------------------------------------------------------------------------

function EmojiPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: number; label: string }[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(value === o.v ? null : o.v)}
            className={[
              'rounded-full px-2.5 py-1.5 font-mono text-sm transition-colors',
              value === o.v
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
            ].join(' ')}
            aria-pressed={value === o.v}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

interface SparklineProps {
  title: string;
  dates: string[];                        // 14 dates, newest first
  getValue: (entry: JournalEntry) => number | null;
  entries: JournalEntry[];
  yMin: number;
  yMax: number;
  color: string;                          // Tailwind stroke colour class alternative: SVG colour string
  invert?: boolean;                       // if true, low is good display (stress)
}

function Sparkline({ title, dates, getValue, entries, yMin, yMax, color, invert }: SparklineProps) {
  const entryByDate = new Map(entries.map((e) => [e.date, e]));

  // Oldest to newest for left-to-right display
  const orderedDates = [...dates].reverse();

  const points: { x: number; y: number }[] = [];
  orderedDates.forEach((iso, i) => {
    const entry = entryByDate.get(iso);
    const val = entry ? getValue(entry) : null;
    if (val !== null) {
      const xPct = i / (orderedDates.length - 1);
      const rawY = (val - yMin) / (yMax - yMin);
      const clamped = Math.max(0, Math.min(1, rawY));
      // SVG: 0 = top, so invert
      const y = (1 - clamped) * 46 + 2; // 2px padding top/bottom, 50px tall
      points.push({ x: xPct * 100, y });
    }
  });

  // Latest value (first in dates array = newest)
  const latestEntry = entryByDate.get(dates[0]);
  const latestVal = latestEntry ? getValue(latestEntry) : null;

  // Build polyline points string — skip gaps
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-1">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{title}</p>
      <div className="flex items-center gap-3">
        <span className="font-mono tabular-nums text-bone text-sm w-5">
          {latestVal !== null ? latestVal : '--'}
        </span>
        {invert && latestVal !== null && (
          <span className="font-mono text-xs text-bone-mute">(lower=better)</span>
        )}
      </div>
      <svg
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        className="w-full h-12"
        aria-hidden="true"
      >
        {points.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Dot for latest value */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="2.5"
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Wellness sparklines
// ---------------------------------------------------------------------------

function WellnessSparklines({
  entries,
  dates14,
}: {
  entries: JournalEntry[];
  dates14: string[];
}) {
  const cutoff14 = dates14[dates14.length - 1]; // oldest date in window
  const recentEntries = entries.filter((e) => e.date >= cutoff14);

  if (recentEntries.length < 3) {
    return (
      <section className="m3-card p-6 space-y-3">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          wellness · 14-day trends
        </p>
        <p className="font-mono text-sm text-bone-dim">
          Log a few entries to see trends.
        </p>
      </section>
    );
  }

  return (
    <section className="m3-card p-6 space-y-4">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        wellness · 14-day trends
      </p>
      <div className="grid grid-cols-2 gap-6">
        <Sparkline
          title="sleep quality"
          dates={dates14}
          entries={recentEntries}
          getValue={(e) => e.sleepQuality}
          yMin={1}
          yMax={5}
          color="#26D0AE"
        />
        <Sparkline
          title="energy"
          dates={dates14}
          entries={recentEntries}
          getValue={(e) => e.energyLevel}
          yMin={1}
          yMax={5}
          color="#26D0AE"
        />
        <Sparkline
          title="stress"
          dates={dates14}
          entries={recentEntries}
          getValue={(e) => e.stressLevel}
          yMin={1}
          yMax={5}
          color="#EAB308"
          invert
        />
        <Sparkline
          title="resting HR"
          dates={dates14}
          entries={recentEntries}
          getValue={(e) => e.restingHr}
          yMin={40}
          yMax={100}
          color="#A5A5A0"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Quick log form
// ---------------------------------------------------------------------------

interface LogFormState {
  sleepQ: number | null;
  energyL: number | null;
  stressL: number | null;
  restingHr: string;
  hrv: string;
  bodyBattery: string;
  notes: string;
}

function formFromEntry(e: JournalEntry | undefined): LogFormState {
  return {
    sleepQ:      e?.sleepQuality ?? null,
    energyL:     e?.energyLevel ?? null,
    stressL:     e?.stressLevel ?? null,
    restingHr:   e?.restingHr != null ? String(e.restingHr) : '',
    hrv:         e?.hrv != null ? String(e.hrv) : '',
    bodyBattery: '',
    notes:       e?.notes ?? '',
  };
}

function TodayLogForm({
  todayEntry,
  onSaved,
  onSavedWithText,
}: {
  todayEntry: JournalEntry | undefined;
  onSaved: () => void;
  onSavedWithText?: (notes: string) => void;
}) {
  const [form, setForm] = useState<LogFormState>(() => formFromEntry(todayEntry));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Load today's body battery from daily_health_metrics on mount
  useEffect(() => {
    const today = todayIso();
    query(
      `SELECT body_battery FROM daily_health_metrics WHERE date = ? ORDER BY synced_at DESC LIMIT 1`,
      [today]
    ).then((rows) => {
      const bb = rows[0]?.[0] as number | null ?? null;
      setForm((f) => ({ ...f, bodyBattery: bb != null ? String(bb) : '' }));
    }).catch(() => { /* table may not exist in older DBs */ });
  }, []);

  // Sync if todayEntry changes (after re-query)
  useEffect(() => {
    setForm((prev) => ({ ...formFromEntry(todayEntry), bodyBattery: prev.bodyBattery }));
  }, [todayEntry]);

  async function handleSave() {
    setSaving(true);
    try {
      const today = todayIso();
      const hr  = form.restingHr   !== '' ? parseInt(form.restingHr, 10)   : null;
      const hrv = form.hrv         !== '' ? parseInt(form.hrv, 10)          : null;
      const bb  = form.bodyBattery !== '' ? parseInt(form.bodyBattery, 10)  : null;

      await exec(
        `INSERT INTO journal (date, sleep_quality, energy_level, stress_level, resting_hr, hrv, notes)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(date) DO UPDATE SET
           sleep_quality=excluded.sleep_quality,
           energy_level=excluded.energy_level,
           stress_level=excluded.stress_level,
           resting_hr=excluded.resting_hr,
           hrv=excluded.hrv,
           notes=excluded.notes`,
        [today, form.sleepQ ?? null, form.energyL ?? null, form.stressL ?? null,
         hr ?? null, hrv ?? null, form.notes || null]
      );

      if (bb != null) {
        await exec(
          `INSERT INTO daily_health_metrics (date, source, body_battery)
           VALUES (?, 'manual', ?)
           ON CONFLICT(date, source) DO UPDATE SET body_battery=excluded.body_battery, synced_at=datetime('now')`,
          [today, bb]
        );
      }

      onSaved();
      onSavedWithText?.(form.notes);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="m3-card p-6 space-y-5">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        today's check-in · {formatDateHeader(todayIso())}
      </p>

      <EmojiPicker
        label="Sleep Quality"
        options={SLEEP_OPTIONS}
        value={form.sleepQ}
        onChange={(v) => setForm((f) => ({ ...f, sleepQ: v }))}
      />
      <EmojiPicker
        label="Energy"
        options={ENERGY_OPTIONS}
        value={form.energyL}
        onChange={(v) => setForm((f) => ({ ...f, energyL: v }))}
      />
      <EmojiPicker
        label="Stress (1=calm, 5=high)"
        options={STRESS_OPTIONS}
        value={form.stressL}
        onChange={(v) => setForm((f) => ({ ...f, stressL: v }))}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="resting-hr" className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            Resting HR
          </label>
          <input
            id="resting-hr"
            type="number"
            inputMode="numeric"
            min={30}
            max={200}
            placeholder="bpm"
            value={form.restingHr}
            onChange={(e) => setForm((f) => ({ ...f, restingHr: e.target.value }))}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hrv-ms" className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            HRV
          </label>
          <input
            id="hrv-ms"
            type="number"
            inputMode="numeric"
            min={10}
            max={200}
            placeholder="ms"
            value={form.hrv}
            onChange={(e) => setForm((f) => ({ ...f, hrv: e.target.value }))}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="body-battery" className="font-mono text-xs text-bone-mute uppercase tracking-widest">
            Body Battery
          </label>
          <input
            id="body-battery"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            placeholder="0–100"
            value={form.bodyBattery}
            onChange={(e) => setForm((f) => ({ ...f, bodyBattery: e.target.value }))}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          Notes
        </label>
        <textarea
          id="notes"
          rows={2}
          placeholder="How's the body feeling?"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors resize-none"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold font-mono text-xs uppercase tracking-widest hover:shadow-md active:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedMsg && (
          <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
            Saved.
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rating dots pill
// ---------------------------------------------------------------------------

function RatingDots({ value, color }: { value: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: i <= value ? color : '#2A2A2A' }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline edit form for history entries
// ---------------------------------------------------------------------------

function InlineEditForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: JournalEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<LogFormState>({
    sleepQ: entry.sleepQuality,
    energyL: entry.energyLevel,
    stressL: entry.stressLevel,
    restingHr: entry.restingHr != null ? String(entry.restingHr) : '',
    hrv: entry.hrv != null ? String(entry.hrv) : '',
    bodyBattery: '',
    notes: entry.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const hr = form.restingHr !== '' ? parseInt(form.restingHr, 10) : null;
      await exec(
        `UPDATE journal SET
           sleep_quality=?, energy_level=?, stress_level=?, resting_hr=?, notes=?
         WHERE id=?`,
        [form.sleepQ ?? null, form.energyL ?? null, form.stressL ?? null, hr ?? null, form.notes || null, entry.id]
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-line space-y-4">
      <EmojiPicker label="Sleep" options={SLEEP_OPTIONS} value={form.sleepQ} onChange={(v) => setForm((f) => ({ ...f, sleepQ: v }))} />
      <EmojiPicker label="Energy" options={ENERGY_OPTIONS} value={form.energyL} onChange={(v) => setForm((f) => ({ ...f, energyL: v }))} />
      <EmojiPicker label="Stress" options={STRESS_OPTIONS} value={form.stressL} onChange={(v) => setForm((f) => ({ ...f, stressL: v }))} />
      <div className="space-y-1">
        <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Resting HR</label>
        <input
          type="number"
          inputMode="numeric"
          min={30}
          max={200}
          placeholder="bpm"
          value={form.restingHr}
          onChange={(e) => setForm((f) => ({ ...f, restingHr: e.target.value }))}
          className="w-32 bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
        />
      </div>
      <div className="space-y-1">
        <label className="font-mono text-xs text-bone-mute uppercase tracking-widest">Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors resize-none"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-primary text-on-primary px-5 py-2 font-bold font-mono text-xs uppercase tracking-widest hover:shadow-md active:opacity-90 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Update'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-1.5 bg-surface-container text-on-surface-variant hover:bg-surface-container-high font-mono text-xs uppercase tracking-widest transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History entry row
// ---------------------------------------------------------------------------

function HistoryRow({
  entry,
  actSummary,
  onReload,
}: {
  entry: JournalEntry;
  actSummary: ActivitySummary | undefined;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    await exec('DELETE FROM journal WHERE id=?', [entry.id]);
    onReload();
  }

  const notesPreview =
    entry.notes && entry.notes.length > 80
      ? entry.notes.slice(0, 80) + '…'
      : entry.notes;

  return (
    <div className="py-4 border-b border-ink-line last:border-b-0 space-y-2">
      {/* Date + activity pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-xs text-bone-dim">{formatDateHeader(entry.date)}</span>
        {actSummary && (
          <span className="px-2 py-0.5 font-mono text-xs rounded-sm"
            style={{ backgroundColor: 'rgba(255,95,0,0.2)', color: '#FF5F00' }}>
            {actSummary.cnt} {actSummary.cnt === 1 ? 'run' : 'runs'} · {actSummary.km}km
          </span>
        )}
      </div>

      {/* Ratings row */}
      <div className="flex items-center gap-4 flex-wrap">
        {entry.sleepQuality !== null && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-bone-mute">
            sleep <RatingDots value={entry.sleepQuality} color="#26D0AE" />
          </span>
        )}
        {entry.energyLevel !== null && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-bone-mute">
            energy <RatingDots value={entry.energyLevel} color="#26D0AE" />
          </span>
        )}
        {entry.stressLevel !== null && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-bone-mute">
            stress <RatingDots value={entry.stressLevel} color="#EAB308" />
          </span>
        )}
        {entry.restingHr !== null && (
          <span className="font-mono text-xs text-bone-mute">
            &#9829; {entry.restingHr}bpm
          </span>
        )}
      </div>

      {/* Notes */}
      {entry.notes && (
        <div>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            {expanded ? entry.notes : notesPreview}
          </p>
          {entry.notes.length > 80 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="font-mono text-xs text-bone-mute hover:text-bone transition-colors mt-0.5"
            >
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          onClick={() => { setEditing(!editing); setConfirmDelete(false); }}
          className="font-mono text-xs text-bone-mute hover:text-accent transition-colors uppercase tracking-widest"
        >
          {editing ? 'Cancel edit' : 'Edit'}
        </button>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors uppercase tracking-widest"
          >
            Delete
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-signal-miss">Sure?</span>
            <button
              type="button"
              onClick={handleDelete}
              className="font-mono text-xs text-signal-miss hover:text-bone transition-colors uppercase tracking-widest"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="font-mono text-xs text-bone-mute hover:text-bone transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <InlineEditForm
          entry={entry}
          onSaved={() => { setEditing(false); onReload(); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Journal history list
// ---------------------------------------------------------------------------

function HistoryList({
  entries,
  actMap,
  onReload,
}: {
  entries: JournalEntry[];
  actMap: Map<string, ActivitySummary>;
  onReload: () => void;
}) {
  return (
    <section className="m3-card p-6">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-4">
        journal history · last 42 days
      </p>
      {entries.length === 0 ? (
        <p className="font-mono text-sm text-bone-dim">
          No entries yet. Log your first check-in above.
        </p>
      ) : (
        <div>
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              actSummary={actMap.get(entry.date)}
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: 14-day activity bars
// ---------------------------------------------------------------------------

function ActivityBars({
  dates14,
  actMap,
}: {
  dates14: string[];           // newest first
  actMap: Map<string, ActivitySummary>;
}) {
  // oldest first for left-to-right
  const orderedDates = [...dates14].reverse();

  const kms = orderedDates.map((d) => actMap.get(d)?.km ?? 0);
  const maxKm = Math.max(...kms, 0.1); // prevent div-by-zero

  function barColor(km: number): string {
    if (km === 0) return 'bg-ink-line';
    if (km < 5) return 'bg-bone-mute/40';
    if (km < 10) return 'bg-bone-dim';
    return 'bg-accent';
  }

  function dayLabel(iso: string, idx: number): string {
    const d = new Date(iso + 'T00:00:00Z');
    const dow = d.getUTCDay(); // 0=Sun
    // Show Mon/Wed/Fri labels
    if (dow === 1 || dow === 3 || dow === 5) {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
    }
    // Otherwise show date number every 7 days
    if (idx % 7 === 0) return String(d.getUTCDate());
    return '';
  }

  return (
    <section className="m3-card p-6">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-3">
        activity · last 14 days
      </p>
      <div className="flex items-end gap-1" style={{ height: '40px' }}>
        {orderedDates.map((iso, idx) => {
          const km = kms[idx];
          const heightPct = maxKm > 0 ? (km / maxKm) * 100 : 0;
          return (
            <div
              key={iso}
              className="flex-1 flex flex-col justify-end"
              style={{ height: '40px' }}
              title={km > 0 ? `${iso}: ${km}km` : iso}
            >
              <div
                className={`w-full transition-all ${barColor(km)}`}
                style={{ height: `${Math.max(heightPct, km > 0 ? 4 : 2)}%` }}
                role="img"
                aria-label={`${iso}: ${km}km`}
              />
            </div>
          );
        })}
      </div>
      {/* Day labels row */}
      <div className="flex gap-1 mt-1">
        {orderedDates.map((iso, idx) => (
          <div key={iso} className="flex-1">
            <span className="font-mono text-[9px] text-bone-mute block text-center leading-none">
              {dayLabel(iso, idx)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI Coach Panel — canned messages (no Worker configured)
// ---------------------------------------------------------------------------

function AiCoachCannedPanel() {
  const { ready } = useDb();
  const [planInfo, setPlanInfo] = useState<{ dojo: string; weekNumber: number; programWeeks: number } | null>(null);

  useEffect(() => {
    if (!ready) return;
    query(
      `SELECT p.dojo, p.params_json, pp.start_date
       FROM plan_periods pp JOIN plans p ON p.id = pp.plan_id
       WHERE pp.end_date IS NULL ORDER BY pp.start_date DESC LIMIT 1`,
    ).then((planRows) => {
      if (planRows.length) {
        const dojo = planRows[0][0] as string;
        const startDate = planRows[0][2] as string;
        let programWeeks = 18;
        try {
          const params = JSON.parse(planRows[0][1] as string);
          if (params.programWeeks) programWeeks = params.programWeeks;
        } catch { /* ignore */ }
        const days = Math.round(
          (new Date().getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86_400_000
        );
        const wk = Math.max(1, Math.floor(days / 7) + 1);
        setPlanInfo({ dojo, weekNumber: wk, programWeeks });
      }
    }).catch(() => { /* ignore */ });
  }, [ready]);

  const cannedMessages = planInfo
    ? getCoachMessages({ dojo: planInfo.dojo, weekNumber: planInfo.weekNumber, programWeeks: planInfo.programWeeks })
    : [];

  return (
    <section className="rounded-2xl bg-primary-container/40 p-6 space-y-4">
      <p className="font-mono text-xs text-accent uppercase tracking-widest">ai coach</p>
      {cannedMessages.length > 0 ? (
        <div className="space-y-4">
          {cannedMessages.map((m, i) => (
            <div key={i} className="space-y-1">
              <p className="font-display tracking-widest text-lg uppercase text-bone">{m.headline}</p>
              <p className="font-mono text-xs text-bone-dim leading-relaxed">{m.body}</p>
            </div>
          ))}
          <p className="font-mono text-xs text-bone-mute pt-2 border-t border-ink-line">
            Configure the Night Ninjas coach worker in{' '}
            <a href="/settings" className="text-accent hover:underline">Settings</a>
            {' '}to get personalised AI coaching.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-display tracking-widest text-lg uppercase text-bone-dim">No plan active</p>
          <p className="font-mono text-xs text-bone-mute leading-relaxed">
            Set a training plan in{' '}
            <a href="/dojo" className="text-accent hover:underline">Dojo</a>
            {' '}to see coaching notes here.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ask Coach Card — Worker SSE streaming (post-save)
// ---------------------------------------------------------------------------

const WORKER_URL_COACH_LOG = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

type AskCoachState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

function AskCoachCard({ savedNotes }: { savedNotes: string }) {
  const [state, setState] = useState<AskCoachState>('idle');
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  async function handleAsk() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    setText('');

    try {
      const [snapshot, athleteIdRaw, modelRaw] = await Promise.all([
        buildAthleteSnapshot(),
        getSetting('strava_athlete_id'),
        getSetting('ai_coach_model'),
      ]);

      const athleteId = athleteIdRaw ? Number(athleteIdRaw) : 0;
      const model = modelRaw ?? 'claude-haiku-4-5-20251001';
      const snapshotText = snapshotToText(snapshot);
      const context = savedNotes
        ? `Today's journal entry: ${savedNotes}\n\n${snapshotText}`
        : snapshotText;

      setState('streaming');

      const gen = streamCoachReply(
        { athleteId, context, question: "I just logged my wellness. Any coaching note for today?", model },
        ctrl.signal,
      );

      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        setText((prev) => prev + chunk);
      }

      if (!ctrl.signal.aborted) {
        setState('done');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState('error');
    }
  }

  return (
    <div className="rounded-2xl bg-surface-container p-5 mt-2">
      <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-3">
        ai coach
      </p>

      {state === 'idle' && (
        <button
          type="button"
          onClick={() => { void handleAsk(); }}
          className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 text-sm font-mono uppercase tracking-widest hover:shadow-sm transition-all"
        >
          Ask coach
        </button>
      )}

      {state === 'loading' && (
        <p className="font-mono text-xs text-on-surface-variant animate-pulse">Thinking…</p>
      )}

      {(state === 'streaming' || state === 'done') && (
        <div>
          <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
            {text}
            {state === 'streaming' && <span className="animate-pulse">|</span>}
          </p>
          {state === 'done' && (
            <button
              type="button"
              onClick={() => { setText(''); setState('idle'); }}
              className="mt-3 font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
            >
              Ask again
            </button>
          )}
        </div>
      )}

      {state === 'error' && (
        <p className="text-on-surface-variant text-sm">Coach unavailable</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function CoachLogPage() {
  const { ready, error: dbError } = useDb();
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [actMap, setActMap] = useState<Map<string, ActivitySummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savedNotes, setSavedNotes] = useState<string | null>(null);

  const dates14 = last14Dates(); // newest first
  const today = todayIso();

  const reload = useCallback(async () => {
    const cutoff = cutoffIso(42);
    const { journal: j, actMap: a } = await loadData(cutoff);
    setJournal(j);
    setActMap(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    reload();
  }, [ready, reload]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || loading) return <PageSkeleton />;

  const todayEntry = journal.find((e) => e.date === today);
  const workerConfigured = WORKER_URL_COACH_LOG !== '';

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          ghost · wellness
        </p>
        <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
          Coach Log
        </h1>
        <p className="font-mono text-xs text-bone-mute">Training wellness — last 42 days</p>
      </header>

      {/* AI Coach panel — canned messages when no worker; hidden when worker is configured (post-save card handles it) */}
      {!workerConfigured && <AiCoachCannedPanel />}

      {/* Section 4: Activity bars — narrow strip, always visible */}
      <ActivityBars dates14={dates14} actMap={actMap} />

      {/* Section 1: Wellness sparklines */}
      <WellnessSparklines entries={journal} dates14={dates14} />

      {/* Section 2: Today's log form */}
      <TodayLogForm
        todayEntry={todayEntry}
        onSaved={reload}
        onSavedWithText={(notes) => setSavedNotes(notes)}
      />

      {/* Ask coach — revealed after saving today's entry (Worker path) */}
      {workerConfigured && savedNotes !== null && (
        <AskCoachCard savedNotes={savedNotes} />
      )}

      {/* Section 3: History list */}
      <HistoryList entries={journal} actMap={actMap} onReload={reload} />
    </div>
  );
}
