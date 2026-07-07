import { useState, useEffect, useCallback } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';
import {
  resolveVo2,
  cooperVo2,
  rockportVo2,
  vo2FitnessBand,
} from '@/lib/analysis/vo2max-pure';
import type { Vo2Observation, ResolvedVo2 } from '@/lib/analysis/vo2max-pure';
import { buildVo2Insights } from '@/lib/analysis/vo2max-insights';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ObsRow {
  id: number;
  date: string;
  source: string;
  value: number;
  note: string | null;
}

interface Profile {
  age: number | null;
  weightKg: number | null;
  sex: 'male' | 'female' | null;
  maxHr: number | null;
  restingHr: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt1(n: number | null): string {
  if (n === null) return '--';
  return n.toFixed(1);
}

const SOURCE_LABEL: Record<string, string> = {
  'manual-lab': 'Lab',
  cooper: 'Cooper',
  rockport: 'Rockport',
  device: 'Device',
};

const SOURCE_BADGE_CLASS: Record<string, string> = {
  'manual-lab': 'border-signal-ok text-signal-ok',
  cooper: 'border-accent text-accent',
  rockport: 'border-bone-dim text-bone-dim',
  device: 'border-bone-mute text-bone-mute',
};

const BAND_CLASS: Record<string, string> = {
  superior: 'text-accent',
  excellent: 'text-signal-ok',
  good: 'text-bone',
  fair: 'text-signal-warn',
  developing: 'text-signal-miss',
};

// ---------------------------------------------------------------------------
// Shared micro-components
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-mono text-xs text-bone-mute uppercase tracking-widest mb-1"
    >
      {children}
    </label>
  );
}

function TextInput({
  id,
  type = 'text',
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                 placeholder:text-bone-mute focus:outline-none focus:border-accent transition-colors"
    />
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'primary',
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'ghost';
}) {
  const cls =
    variant === 'danger'
      ? 'border-signal-miss text-signal-miss hover:bg-signal-miss hover:text-ink'
      : variant === 'ghost'
        ? 'border-ink-line text-bone-dim hover:border-bone-dim hover:text-bone'
        : 'border-accent text-accent hover:bg-accent hover:text-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 border font-mono text-xs uppercase tracking-widest transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

function SourceBadge({ source }: { source: string }) {
  const cls = SOURCE_BADGE_CLASS[source] ?? 'border-bone-mute text-bone-mute';
  const label = SOURCE_LABEL[source] ?? source;
  return (
    <span className={`border font-mono text-[10px] uppercase tracking-widest rounded-full px-1.5 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section 1: VO2 Trend Card
// ---------------------------------------------------------------------------

function Sparkline({ series }: { series: Vo2Observation[] }) {
  if (series.length < 2) return null;

  const values = series.map((o) => o.value);
  const raw_min = Math.min(...values);
  const raw_max = Math.max(...values);
  const yMin = raw_min - 5;
  const yMax = raw_max + 5;
  const range = yMax - yMin || 1;

  const W = 300;
  const H = 80;
  const pad = 4;

  const pts = series.map((o, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (o.value - yMin) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const firstDate = series[0].dateIso;
  const lastDate = series[series.length - 1].dateIso;

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        aria-hidden="true"
        className="overflow-visible"
      >
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((o, i) => {
          const x = pad + (i / (series.length - 1)) * (W - pad * 2);
          const y = pad + (1 - (o.value - yMin) / range) * (H - pad * 2);
          return (
            <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="var(--color-accent)" />
          );
        })}
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-bone-mute">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

function TrendCard({
  resolved,
  profile,
}: {
  resolved: ResolvedVo2;
  profile: Profile;
}) {
  const { current, currentSource, currentDateIso, series } = resolved;

  const band =
    current !== null && profile.age !== null && profile.sex !== null
      ? vo2FitnessBand(current, profile.age, profile.sex)
      : null;

  const delta =
    current !== null && series.length >= 2
      ? current - series[0].value
      : null;

  const deltaSign = delta !== null && delta > 0 ? '+' : '';
  const deltaClass =
    delta === null ? '' : delta > 0 ? 'text-signal-ok' : delta < 0 ? 'text-signal-warn' : 'text-bone-dim';

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="vo2-trend-heading">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          vo2 max Â· aerobic ceiling
        </p>
        <h2 id="vo2-trend-heading" className="font-display tracking-widest text-2xl uppercase text-bone">
          Current Estimate
        </h2>
      </div>

      {series.length === 0 ? (
        <p className="font-mono text-sm text-bone-dim">
          No observations recorded yet. Add one below.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Big number row */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="font-display tracking-widest text-6xl text-bone leading-none">
                {fmt1(current)}
              </span>
              <span className="font-mono text-xs text-bone-mute ml-1">ml/kg/min</span>
            </div>
            <div className="flex flex-col gap-1 pb-1">
              {currentSource && <SourceBadge source={currentSource} />}
              {currentDateIso && (
                <span className="font-mono text-[10px] text-bone-mute">{currentDateIso}</span>
              )}
            </div>
          </div>

          {/* Band + delta */}
          <div className="flex flex-wrap gap-4 items-center">
            {band && (
              <span className={`font-mono text-sm uppercase tracking-widest ${BAND_CLASS[band] ?? 'text-bone'}`}>
                {band}
              </span>
            )}
            {delta !== null && (
              <span className={`font-mono text-sm ${deltaClass}`}>
                {deltaSign}{fmt1(delta)} from first reading
              </span>
            )}
          </div>

          {/* Sparkline */}
          {series.length >= 2 && <Sparkline series={series} />}

          {/* Disclaimer */}
          <p className="font-mono text-[10px] text-bone-mute border-t border-ink-line pt-3">
            Observed only â€” does not affect training paces.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Insights
// ---------------------------------------------------------------------------

const TONE_BG: Record<string, string> = {
  positive: 'bg-[var(--color-signal-ok)]/10',
  neutral: '',
  caution: 'bg-[var(--color-signal-warn)]/10',
};

function InsightsCard({ series }: { series: Vo2Observation[] }) {
  if (series.length < 2) return null;

  const report = buildVo2Insights(series, {
    recentWeeklyKm: 0,
    priorWeeklyKm: 0,
    recentSleepHours: null,
    recentRestingHr: null,
    priorRestingHr: null,
  });

  if (!report.hasInsights) return null;

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="vo2-insights-heading">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">vo2 max Â· analysis</p>
        <h2 id="vo2-insights-heading" className="font-display tracking-widest text-2xl uppercase text-bone">
          Insights
        </h2>
      </div>

      <div className="space-y-3">
        {report.insights.map((insight, i) => (
          <div
            key={i}
            className={`p-3 m3-card space-y-1 ${TONE_BG[insight.tone] ?? ''}`}
          >
            <p className="font-mono text-xs text-bone font-bold">{insight.title}</p>
            <p className="font-mono text-xs text-bone-dim leading-relaxed">{insight.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Add Observation tabs
// ---------------------------------------------------------------------------

type AddTab = 'cooper' | 'rockport' | 'lab';

interface CooperForm {
  distanceM: string;
  date: string;
}

interface RockportForm {
  weightKg: string;
  timeMin: string;
  endHr: string;
  age: string;
  sex: 'male' | 'female' | '';
  date: string;
}

interface LabForm {
  value: string;
  date: string;
  note: string;
}

function ComputedPreview({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="m3-card bg-ink-shadow px-4 py-3 flex items-center gap-3">
      <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">{label}</span>
      <span className="font-display text-2xl text-accent tracking-widest">{fmt1(value)}</span>
      <span className="font-mono text-xs text-bone-mute">ml/kg/min</span>
    </div>
  );
}

function CooperTab({
  profile,
  onAdded,
}: {
  profile: Profile;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<CooperForm>({ distanceM: '', date: todayIso() });
  const [computed, setComputed] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  function handleCompute() {
    const d = parseFloat(form.distanceM);
    if (isNaN(d) || d < 1000 || d > 6000) { setComputed(null); return; }
    setComputed(cooperVo2(d));
  }

  async function handleSubmit() {
    const d = parseFloat(form.distanceM);
    if (isNaN(d) || d < 1000 || d > 6000) return;
    const value = cooperVo2(d);
    setSaving(true);
    try {
      await exec(
        'INSERT INTO vo2max_observations (date, source, value, inputs) VALUES (?,?,?,?)',
        [form.date, 'cooper', value, JSON.stringify({ distanceM: d })],
      );
      setStatus('saved');
      setForm({ distanceM: '', date: todayIso() });
      setComputed(null);
      onAdded();
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  // suppress unused profile warning â€” profile available for future pre-fill
  void profile;

  const distM = parseFloat(form.distanceM);
  const canCompute = !isNaN(distM) && distM >= 1000 && distM <= 6000;

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        Enter the distance you covered in a maximal 12-minute run.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="cooper-dist">Distance (m)</FieldLabel>
          <TextInput
            id="cooper-dist"
            type="number"
            value={form.distanceM}
            onChange={(v) => { setForm((f) => ({ ...f, distanceM: v })); setComputed(null); }}
            min="1000"
            max="6000"
            placeholder="e.g. 2800"
          />
        </div>
        <div>
          <FieldLabel htmlFor="cooper-date">Date</FieldLabel>
          <TextInput
            id="cooper-date"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
        </div>
      </div>

      {canCompute && (
        <ActionButton variant="ghost" onClick={handleCompute}>
          Preview computed value
        </ActionButton>
      )}

      <ComputedPreview label="Computed VO2 max" value={computed} />

      <div className="flex items-center gap-4">
        <ActionButton onClick={handleSubmit} disabled={saving || !canCompute || !form.date}>
          {saving ? 'Savingâ€¦' : 'Save observation'}
        </ActionButton>
        {status === 'saved' && (
          <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">Saved.</span>
        )}
        {status === 'error' && (
          <span className="font-mono text-xs text-signal-miss" role="alert" aria-live="assertive">{errMsg}</span>
        )}
      </div>
    </div>
  );
}

function RockportTab({
  profile,
  onAdded,
}: {
  profile: Profile;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<RockportForm>({
    weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
    timeMin: '',
    endHr: '',
    age: profile.age != null ? String(profile.age) : '',
    sex: profile.sex ?? '',
    date: todayIso(),
  });
  const [computed, setComputed] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Re-prefill when profile loads
  useEffect(() => {
    setForm((f) => ({
      ...f,
      weightKg: profile.weightKg != null ? String(profile.weightKg) : f.weightKg,
      age: profile.age != null ? String(profile.age) : f.age,
      sex: profile.sex ?? f.sex,
    }));
  }, [profile.weightKg, profile.age, profile.sex]);

  function isFormValid() {
    const wkg = parseFloat(form.weightKg);
    const tmin = parseFloat(form.timeMin);
    const ehr = parseFloat(form.endHr);
    const age = parseFloat(form.age);
    return (
      !isNaN(wkg) && wkg > 0 &&
      !isNaN(tmin) && tmin > 0 &&
      !isNaN(ehr) && ehr > 0 &&
      !isNaN(age) && age > 0 &&
      (form.sex === 'male' || form.sex === 'female') &&
      !!form.date
    );
  }

  function computeValue(): number | null {
    if (!isFormValid()) return null;
    return rockportVo2({
      weightKg: parseFloat(form.weightKg),
      age: parseFloat(form.age),
      sex: form.sex as 'male' | 'female',
      timeMin: parseFloat(form.timeMin),
      endHr: parseFloat(form.endHr),
    });
  }

  function handleCompute() {
    setComputed(computeValue());
  }

  async function handleSubmit() {
    const value = computeValue();
    if (value === null) return;
    setSaving(true);
    try {
      await exec(
        'INSERT INTO vo2max_observations (date, source, value, inputs) VALUES (?,?,?,?)',
        [
          form.date,
          'rockport',
          value,
          JSON.stringify({
            weightKg: parseFloat(form.weightKg),
            age: parseFloat(form.age),
            sex: form.sex,
            timeMin: parseFloat(form.timeMin),
            endHr: parseFloat(form.endHr),
          }),
        ],
      );
      setStatus('saved');
      setForm((f) => ({ ...f, timeMin: '', endHr: '', date: todayIso() }));
      setComputed(null);
      onAdded();
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  const valid = isFormValid();

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        Rockport 1-mile walk test. Walk 1.609 km (1 mile) as fast as possible and record time and
        finish heart rate.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="rp-weight">Weight (kg)</FieldLabel>
          <TextInput
            id="rp-weight"
            type="number"
            value={form.weightKg}
            onChange={(v) => { setForm((f) => ({ ...f, weightKg: v })); setComputed(null); }}
            min="30"
            max="200"
            step="0.1"
            placeholder="e.g. 75.5"
          />
        </div>
        <div>
          <FieldLabel htmlFor="rp-age">Age</FieldLabel>
          <TextInput
            id="rp-age"
            type="number"
            value={form.age}
            onChange={(v) => { setForm((f) => ({ ...f, age: v })); setComputed(null); }}
            min="10"
            max="100"
            placeholder="e.g. 38"
          />
        </div>
        <div>
          <FieldLabel htmlFor="rp-sex">Sex</FieldLabel>
          <select
            id="rp-sex"
            value={form.sex}
            onChange={(e) => { setForm((f) => ({ ...f, sex: e.target.value as RockportForm['sex'] })); setComputed(null); }}
            className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">Selectâ€¦</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="rp-time">Time (minutes)</FieldLabel>
          <TextInput
            id="rp-time"
            type="number"
            value={form.timeMin}
            onChange={(v) => { setForm((f) => ({ ...f, timeMin: v })); setComputed(null); }}
            min="8"
            max="30"
            step="0.1"
            placeholder="e.g. 14.5"
          />
        </div>
        <div>
          <FieldLabel htmlFor="rp-hr">Finish HR (bpm)</FieldLabel>
          <TextInput
            id="rp-hr"
            type="number"
            value={form.endHr}
            onChange={(v) => { setForm((f) => ({ ...f, endHr: v })); setComputed(null); }}
            min="60"
            max="220"
            placeholder="e.g. 148"
          />
        </div>
        <div>
          <FieldLabel htmlFor="rp-date">Date</FieldLabel>
          <TextInput
            id="rp-date"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
        </div>
      </div>

      {valid && (
        <ActionButton variant="ghost" onClick={handleCompute}>
          Preview computed value
        </ActionButton>
      )}

      <ComputedPreview label="Computed VO2 max" value={computed} />

      <div className="flex items-center gap-4">
        <ActionButton onClick={handleSubmit} disabled={saving || !valid}>
          {saving ? 'Savingâ€¦' : 'Save observation'}
        </ActionButton>
        {status === 'saved' && (
          <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">Saved.</span>
        )}
        {status === 'error' && (
          <span className="font-mono text-xs text-signal-miss" role="alert" aria-live="assertive">{errMsg}</span>
        )}
      </div>
    </div>
  );
}

function LabTab({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<LabForm>({ value: '', date: todayIso(), note: '' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const val = parseFloat(form.value);
  const canSubmit = !isNaN(val) && val >= 20 && val <= 90 && !!form.date;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await exec(
        'INSERT INTO vo2max_observations (date, source, value, note) VALUES (?,?,?,?)',
        [form.date, 'manual-lab', val, form.note || null],
      );
      setStatus('saved');
      setForm({ value: '', date: todayIso(), note: '' });
      onAdded();
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        Enter a directly measured value from a graded exercise test or clinical lab.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="lab-value">VO2 max (ml/kg/min)</FieldLabel>
          <TextInput
            id="lab-value"
            type="number"
            value={form.value}
            onChange={(v) => setForm((f) => ({ ...f, value: v }))}
            min="20"
            max="90"
            step="0.1"
            placeholder="e.g. 52.4"
          />
        </div>
        <div>
          <FieldLabel htmlFor="lab-date">Date</FieldLabel>
          <TextInput
            id="lab-date"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="lab-note">Note (optional)</FieldLabel>
          <input
            id="lab-note"
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. Sports lab treadmill test"
            className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       placeholder:text-bone-mute focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ActionButton onClick={handleSubmit} disabled={saving || !canSubmit}>
          {saving ? 'Savingâ€¦' : 'Save observation'}
        </ActionButton>
        {status === 'saved' && (
          <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">Saved.</span>
        )}
        {status === 'error' && (
          <span className="font-mono text-xs text-signal-miss" role="alert" aria-live="assertive">{errMsg}</span>
        )}
      </div>
    </div>
  );
}

function AddObservationCard({
  profile,
  onAdded,
}: {
  profile: Profile;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<AddTab>('cooper');

  const tabs: { id: AddTab; label: string }[] = [
    { id: 'cooper', label: 'Cooper' },
    { id: 'rockport', label: 'Rockport' },
    { id: 'lab', label: 'Lab' },
  ];

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="vo2-add-heading">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">vo2 max Â· log</p>
        <h2 id="vo2-add-heading" className="font-display tracking-widest text-2xl uppercase text-bone">
          Add Observation
        </h2>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 m3-card w-fit" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors
              ${tab === t.id
                ? 'bg-accent text-ink'
                : 'text-bone-dim hover:text-bone hover:bg-ink-panel'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'cooper' && <CooperTab profile={profile} onAdded={onAdded} />}
      {tab === 'rockport' && <RockportTab profile={profile} onAdded={onAdded} />}
      {tab === 'lab' && <LabTab onAdded={onAdded} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Observation History
// ---------------------------------------------------------------------------

function HistoryCard({ rows, onDeleted }: { rows: ObsRow[]; onDeleted: () => void }) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      await exec('DELETE FROM vo2max_observations WHERE id = ?', [id]);
      setConfirmId(null);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const sorted = [...rows].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="vo2-history-heading">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">vo2 max Â· history</p>
        <h2 id="vo2-history-heading" className="font-display tracking-widest text-2xl uppercase text-bone">
          All Observations
        </h2>
      </div>

      {sorted.length === 0 ? (
        <p className="font-mono text-sm text-bone-dim">No observations yet.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 py-2 border-b border-ink-line last:border-b-0"
            >
              <span className="font-mono text-xs text-bone-mute w-24 shrink-0">{row.date}</span>
              <SourceBadge source={row.source} />
              <span className="font-display text-xl text-bone tracking-widest leading-none">
                {fmt1(row.value)}
              </span>
              <span className="font-mono text-[10px] text-bone-mute">ml/kg/min</span>
              {row.note && (
                <span className="font-mono text-xs text-bone-dim truncate max-w-xs">{row.note}</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {confirmId === row.id ? (
                  <>
                    <span className="font-mono text-xs text-signal-miss">Delete?</span>
                    <ActionButton
                      variant="danger"
                      onClick={() => handleDelete(row.id)}
                      disabled={deleting}
                    >
                      Confirm
                    </ActionButton>
                    <ActionButton variant="ghost" onClick={() => setConfirmId(null)}>
                      Cancel
                    </ActionButton>
                  </>
                ) : (
                  <ActionButton variant="ghost" onClick={() => setConfirmId(row.id)}>
                    Delete
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Profile Quick-form (collapsible)
// ---------------------------------------------------------------------------

function ProfileQuickForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    age: profile.age != null ? String(profile.age) : '',
    weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
    sex: profile.sex ?? ('' as 'male' | 'female' | ''),
    maxHr: profile.maxHr != null ? String(profile.maxHr) : '',
    restingHr: profile.restingHr != null ? String(profile.restingHr) : '',
  });
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    setForm({
      age: profile.age != null ? String(profile.age) : '',
      weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
      sex: profile.sex ?? '',
      maxHr: profile.maxHr != null ? String(profile.maxHr) : '',
      restingHr: profile.restingHr != null ? String(profile.restingHr) : '',
    });
  }, [profile.age, profile.weightKg, profile.sex, profile.maxHr, profile.restingHr]);

  async function upsert(key: string, val: string) {
    if (!val) return;
    await exec(
      `INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
      [key, val],
    );
  }

  async function handleSave() {
    try {
      await upsert('profile.age', form.age);
      await upsert('profile.weight_kg', form.weightKg);
      await upsert('profile.sex', form.sex);
      await upsert('profile.max_hr', form.maxHr);
      await upsert('profile.resting_hr', form.restingHr);
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  return (
    <section className="m3-card" aria-labelledby="vo2-profile-heading">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="vo2-profile-panel"
        className="w-full flex items-center justify-between p-4 font-mono text-xs uppercase tracking-widest
                   text-bone-dim hover:text-bone transition-colors"
      >
        <span id="vo2-profile-heading">Edit profile</span>
        <span aria-hidden="true">{open ? 'â–²' : 'â–¼'}</span>
      </button>

      {open && (
        <div id="vo2-profile-panel" className="px-6 pb-6 space-y-4 border-t border-ink-line pt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="qp-age">Age</FieldLabel>
              <TextInput
                id="qp-age"
                type="number"
                value={form.age}
                onChange={(v) => setForm((f) => ({ ...f, age: v }))}
                min="10"
                max="100"
                placeholder="e.g. 38"
              />
            </div>
            <div>
              <FieldLabel htmlFor="qp-weight">Weight (kg)</FieldLabel>
              <TextInput
                id="qp-weight"
                type="number"
                value={form.weightKg}
                onChange={(v) => setForm((f) => ({ ...f, weightKg: v }))}
                step="0.1"
                min="30"
                max="200"
                placeholder="e.g. 75.5"
              />
            </div>
            <div>
              <FieldLabel htmlFor="qp-sex">Sex</FieldLabel>
              <select
                id="qp-sex"
                value={form.sex}
                onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value as typeof form.sex }))}
                className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                           focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">Selectâ€¦</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="qp-maxhr">Max HR (bpm)</FieldLabel>
              <TextInput
                id="qp-maxhr"
                type="number"
                value={form.maxHr}
                onChange={(v) => setForm((f) => ({ ...f, maxHr: v }))}
                min="100"
                max="230"
                placeholder="e.g. 185"
              />
            </div>
            <div>
              <FieldLabel htmlFor="qp-resthr">Resting HR (bpm)</FieldLabel>
              <TextInput
                id="qp-resthr"
                type="number"
                value={form.restingHr}
                onChange={(v) => setForm((f) => ({ ...f, restingHr: v }))}
                min="30"
                max="120"
                placeholder="e.g. 52"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <ActionButton onClick={handleSave}>Save</ActionButton>
            {status === 'saved' && (
              <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">Saved.</span>
            )}
            {status === 'error' && (
              <span className="font-mono text-xs text-signal-miss" role="alert" aria-live="assertive">{errMsg}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function parseProfile(rows: unknown[][]): Profile {
  const map: Record<string, string> = {};
  for (const r of rows) {
    const key = r[0] as string;
    const val = r[1] as string;
    map[key] = val;
  }
  return {
    age: map['profile.age'] ? Number(map['profile.age']) : null,
    weightKg: map['profile.weight_kg'] ? Number(map['profile.weight_kg']) : null,
    sex: (map['profile.sex'] as 'male' | 'female') ?? null,
    maxHr: map['profile.max_hr'] ? Number(map['profile.max_hr']) : null,
    restingHr: map['profile.resting_hr'] ? Number(map['profile.resting_hr']) : null,
  };
}

function parseObsRows(rows: unknown[][]): { obsRows: ObsRow[]; observations: Vo2Observation[] } {
  const obsRows: ObsRow[] = rows.map((r) => ({
    id: r[0] as number,
    date: r[1] as string,
    source: r[2] as string,
    value: r[3] as number,
    note: (r[4] as string | null) ?? null,
  }));
  const observations: Vo2Observation[] = obsRows.map((o) => ({
    dateIso: o.date,
    source: o.source as Vo2Observation['source'],
    value: o.value,
  }));
  return { obsRows, observations };
}

export default function Vo2maxPage() {
  const { ready, error: dbError } = useDb();

  const [obsRows, setObsRows] = useState<ObsRow[]>([]);
  const [resolved, setResolved] = useState<ResolvedVo2>({
    current: null,
    currentSource: null,
    currentDateIso: null,
    series: [],
  });
  const [profile, setProfile] = useState<Profile>({
    age: null,
    weightKg: null,
    sex: null,
    maxHr: null,
    restingHr: null,
  });

  const loadData = useCallback(async () => {
    const [obsResult, profileResult] = await Promise.all([
      query('SELECT id, date, source, value, note FROM vo2max_observations ORDER BY date ASC'),
      query(
        "SELECT key, value FROM settings WHERE key IN ('profile.age','profile.weight_kg','profile.sex','profile.max_hr','profile.resting_hr')",
      ),
    ]);

    const { obsRows: newObs, observations } = parseObsRows(obsResult);
    setObsRows(newObs);
    setResolved(resolveVo2(observations));
    setProfile(parseProfile(profileResult));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadData().catch(() => {
      // silently ignore â€” error state shown via dbError from useDb()
    });
  }, [ready, loadData]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
          VO2 Max
        </h1>
        <p className="font-mono text-xs text-bone-mute">
          Aerobic ceiling â€” training reference
        </p>
      </header>

      {/* S1: Trend */}
      <TrendCard resolved={resolved} profile={profile} />

      {/* S2: Insights (conditional) */}
      <InsightsCard series={resolved.series} />

      {/* S3: Add observation */}
      <AddObservationCard profile={profile} onAdded={loadData} />

      {/* S4: History */}
      <HistoryCard rows={obsRows} onDeleted={loadData} />

      {/* S5: Profile quick-form */}
      <ProfileQuickForm profile={profile} onSaved={loadData} />
    </div>
  );
}
