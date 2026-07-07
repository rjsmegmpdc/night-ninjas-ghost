import { useState, useEffect, useCallback } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';

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

async function loadSetting(key: string): Promise<string | null> {
  const rows = await query('SELECT value FROM settings WHERE key = ?', [key]);
  return (rows[0]?.[0] as string) ?? null;
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AthleteForm {
  age: string;
  weight_kg: string;
  sex: 'male' | 'female' | '';
  max_hr: string;
  resting_hr: string;
}

interface HrZoneForm {
  easy_hr_cap: string;
  subt_hr_cap: string;
  hr_measured: boolean;
}

interface StrengthForm {
  modality: 'weights' | 'pilates' | 'yoga' | 'mixed' | 'none' | '';
  sessions_per_week: string;
}

interface CheckinForm {
  date: string;
  sleep_quality: number;
  energy_level: number;
}

// ---------------------------------------------------------------------------
// Feedback badge
// ---------------------------------------------------------------------------

type FeedbackStatus = 'idle' | 'saved' | 'error';

function FeedbackBadge({ status, message }: { status: FeedbackStatus; message?: string }) {
  if (status === 'idle') return null;
  if (status === 'saved') {
    return (
      <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
        Saved.
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-signal-miss" role="alert" aria-live="assertive">
      {message ?? 'Error saving.'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared field components
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

function NumberInput({
  id,
  value,
  onChange,
  step,
  min,
  max,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                 placeholder:text-bone-mute focus:outline-none focus:border-accent transition-colors"
    />
  );
}

function SaveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 m3-btn-outline text-accent hover:bg-accent hover:text-ink
                 font-mono text-xs uppercase tracking-widest transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Save
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card 1: Athlete Profile
// ---------------------------------------------------------------------------

function AthleteProfileCard({ initial }: { initial: AthleteForm }) {
  const [form, setForm] = useState<AthleteForm>(initial);
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Re-sync when parent loads data
  useEffect(() => { setForm(initial); }, [initial.age, initial.weight_kg, initial.sex, initial.max_hr, initial.resting_hr]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    try {
      await upsertSetting('profile.age', form.age);
      await upsertSetting('profile.weight_kg', form.weight_kg);
      await upsertSetting('profile.sex', form.sex);
      await upsertSetting('profile.max_hr', form.max_hr);
      await upsertSetting('profile.resting_hr', form.resting_hr);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="card-athlete">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          profile · biometrics
        </p>
        <h2
          id="card-athlete"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Athlete Profile
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="age">Age</FieldLabel>
          <NumberInput
            id="age"
            value={form.age}
            onChange={(v) => setForm((f) => ({ ...f, age: v }))}
            min="10"
            max="100"
            placeholder="e.g. 38"
          />
        </div>

        <div>
          <FieldLabel htmlFor="weight_kg">Weight (kg)</FieldLabel>
          <NumberInput
            id="weight_kg"
            value={form.weight_kg}
            onChange={(v) => setForm((f) => ({ ...f, weight_kg: v }))}
            step="0.1"
            min="30"
            max="200"
            placeholder="e.g. 75.5"
          />
        </div>

        <div>
          <FieldLabel htmlFor="sex">Sex</FieldLabel>
          <select
            id="sex"
            value={form.sex}
            onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value as AthleteForm['sex'] }))}
            className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="max_hr">Max HR (bpm)</FieldLabel>
          <NumberInput
            id="max_hr"
            value={form.max_hr}
            onChange={(v) => setForm((f) => ({ ...f, max_hr: v }))}
            min="100"
            max="230"
            placeholder="e.g. 185"
          />
        </div>

        <div>
          <FieldLabel htmlFor="resting_hr">Resting HR (bpm)</FieldLabel>
          <NumberInput
            id="resting_hr"
            value={form.resting_hr}
            onChange={(v) => setForm((f) => ({ ...f, resting_hr: v }))}
            min="30"
            max="120"
            placeholder="e.g. 52"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SaveButton onClick={handleSave} />
        <FeedbackBadge status={status} message={errMsg} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 2: HR Zones (NS Calibration)
// ---------------------------------------------------------------------------

function HrZonesCard({ initial }: { initial: HrZoneForm }) {
  const [form, setForm] = useState<HrZoneForm>(initial);
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => { setForm(initial); }, [initial.easy_hr_cap, initial.subt_hr_cap, initial.hr_measured]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    try {
      await upsertSetting('ns.easy_hr_cap', form.easy_hr_cap);
      await upsertSetting('ns.subt_hr_cap', form.subt_hr_cap);
      await upsertSetting('ns.hr_confidence', form.hr_measured ? 'measured' : 'estimated');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  const isEstimated = !form.hr_measured;

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="card-hr">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          profile · Norwegian Split
        </p>
        <h2
          id="card-hr"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          HR Zones (NS Calibration)
        </h2>
      </div>

      {isEstimated && (
        <div
          className="border border-signal-warn/40 bg-signal-warn/5 px-4 py-3 space-y-1"
          role="alert"
        >
          <p className="font-mono text-xs text-signal-warn uppercase tracking-widest">
            Estimated zones
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            HR ceilings are based on estimated max HR. Check "Max HR is measured" once you have
            a confirmed value from a field test.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="easy_hr_cap">Easy HR cap (bpm)</FieldLabel>
          <NumberInput
            id="easy_hr_cap"
            value={form.easy_hr_cap}
            onChange={(v) => setForm((f) => ({ ...f, easy_hr_cap: v }))}
            min="80"
            max="200"
            placeholder="128"
          />
        </div>

        <div>
          <FieldLabel htmlFor="subt_hr_cap">Subthreshold HR cap (bpm)</FieldLabel>
          <NumberInput
            id="subt_hr_cap"
            value={form.subt_hr_cap}
            onChange={(v) => setForm((f) => ({ ...f, subt_hr_cap: v }))}
            min="80"
            max="220"
            placeholder="141"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="hr_measured"
          type="checkbox"
          checked={form.hr_measured}
          onChange={(e) => setForm((f) => ({ ...f, hr_measured: e.target.checked }))}
          className="accent-accent w-4 h-4 cursor-pointer"
        />
        <label
          htmlFor="hr_measured"
          className="font-mono text-sm text-bone cursor-pointer select-none"
        >
          Max HR is measured (not estimated)
        </label>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SaveButton onClick={handleSave} />
        <FeedbackBadge status={status} message={errMsg} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 3: Strength Preferences
// ---------------------------------------------------------------------------

function StrengthCard({ initial }: { initial: StrengthForm }) {
  const [form, setForm] = useState<StrengthForm>(initial);
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => { setForm(initial); }, [initial.modality, initial.sessions_per_week]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    try {
      await upsertSetting('profile.strength_modality', form.modality);
      await upsertSetting('profile.strength_target_per_week', form.sessions_per_week);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="card-strength">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          profile · cross-training
        </p>
        <h2
          id="card-strength"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Strength Preferences
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="modality">Modality</FieldLabel>
          <select
            id="modality"
            value={form.modality}
            onChange={(e) =>
              setForm((f) => ({ ...f, modality: e.target.value as StrengthForm['modality'] }))
            }
            className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">Select…</option>
            <option value="weights">Weights</option>
            <option value="pilates">Pilates</option>
            <option value="yoga">Yoga</option>
            <option value="mixed">Mixed</option>
            <option value="none">None</option>
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="sessions_per_week">Sessions per week</FieldLabel>
          <select
            id="sessions_per_week"
            value={form.sessions_per_week}
            onChange={(e) => setForm((f) => ({ ...f, sessions_per_week: e.target.value }))}
            className="w-full bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       focus:outline-none focus:border-accent transition-colors"
          >
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SaveButton onClick={handleSave} />
        <FeedbackBadge status={status} message={errMsg} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 4: Morning Check-in
// ---------------------------------------------------------------------------

function CheckinCard() {
  const [form, setForm] = useState<CheckinForm>({
    date: todayIso(),
    sleep_quality: 5,
    energy_level: 5,
  });
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleSave() {
    try {
      await exec(
        `INSERT INTO journal (date, sleep_quality, energy_level)
         VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           sleep_quality = excluded.sleep_quality,
           energy_level  = excluded.energy_level`,
        [form.date, form.sleep_quality, form.energy_level],
      );
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  return (
    <section className="m3-card p-6 space-y-4" aria-labelledby="card-checkin">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          profile · daily log
        </p>
        <h2
          id="card-checkin"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Morning Check-in
        </h2>
      </div>

      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="checkin_date">Date</FieldLabel>
          <input
            id="checkin_date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="bg-ink-shadow m3-card px-3 py-2 font-mono text-sm text-bone
                       focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel htmlFor="sleep_quality">Sleep quality</FieldLabel>
            <span className="font-display tracking-widest text-xl text-accent leading-none">
              {form.sleep_quality}
            </span>
          </div>
          <input
            id="sleep_quality"
            type="range"
            min={1}
            max={10}
            value={form.sleep_quality}
            onChange={(e) =>
              setForm((f) => ({ ...f, sleep_quality: Number(e.target.value) }))
            }
            className="w-full accent-accent"
          />
          <div className="flex justify-between font-mono text-[10px] text-bone-mute mt-1 select-none">
            <span>1 poor</span>
            <span>10 excellent</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel htmlFor="energy_level">Energy level</FieldLabel>
            <span className="font-display tracking-widest text-xl text-accent leading-none">
              {form.energy_level}
            </span>
          </div>
          <input
            id="energy_level"
            type="range"
            min={1}
            max={10}
            value={form.energy_level}
            onChange={(e) =>
              setForm((f) => ({ ...f, energy_level: Number(e.target.value) }))
            }
            className="w-full accent-accent"
          />
          <div className="flex justify-between font-mono text-[10px] text-bone-mute mt-1 select-none">
            <span>1 drained</span>
            <span>10 energised</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SaveButton onClick={handleSave} />
        <FeedbackBadge status={status} message={errMsg} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page defaults
// ---------------------------------------------------------------------------

const DEFAULT_ATHLETE: AthleteForm = {
  age: '',
  weight_kg: '',
  sex: '',
  max_hr: '',
  resting_hr: '',
};

const DEFAULT_HR: HrZoneForm = {
  easy_hr_cap: '128',
  subt_hr_cap: '141',
  hr_measured: false,
};

const DEFAULT_STRENGTH: StrengthForm = {
  modality: '',
  sessions_per_week: '0',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { ready, error: dbError } = useDb();

  const [athlete, setAthlete] = useState<AthleteForm>(DEFAULT_ATHLETE);
  const [hrZone, setHrZone] = useState<HrZoneForm>(DEFAULT_HR);
  const [strength, setStrength] = useState<StrengthForm>(DEFAULT_STRENGTH);

  const load = useCallback(async () => {
    const age          = await loadSetting('profile.age');
    const weight_kg    = await loadSetting('profile.weight_kg');
    const sex          = await loadSetting('profile.sex');
    const max_hr       = await loadSetting('profile.max_hr');
    const resting_hr   = await loadSetting('profile.resting_hr');

    const easy_hr_cap  = await loadSetting('ns.easy_hr_cap');
    const subt_hr_cap  = await loadSetting('ns.subt_hr_cap');
    const hr_confidence = await loadSetting('ns.hr_confidence');

    const modality             = await loadSetting('profile.strength_modality');
    const sessions_per_week    = await loadSetting('profile.strength_target_per_week');

    setAthlete({
      age: age ?? '',
      weight_kg: weight_kg ?? '',
      sex: (sex as AthleteForm['sex']) ?? '',
      max_hr: max_hr ?? '',
      resting_hr: resting_hr ?? '',
    });

    setHrZone({
      easy_hr_cap: easy_hr_cap ?? '128',
      subt_hr_cap: subt_hr_cap ?? '141',
      hr_measured: hr_confidence === 'measured',
    });

    setStrength({
      modality: (modality as StrengthForm['modality']) ?? '',
      sessions_per_week: sessions_per_week ?? '0',
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    load().catch(() => {
      // Errors are surfaced per-card on save; silently ignore load failures
    });
  }, [ready, load]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-3xl mx-auto space-y-10">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
          Profile
        </h1>
        <p className="font-mono text-xs text-bone-mute">
          Athlete biometrics, HR zones, strength, and daily check-in.
        </p>
      </header>

      <AthleteProfileCard initial={athlete} />
      <HrZonesCard initial={hrZone} />
      <StrengthCard initial={strength} />
      <CheckinCard />
    </div>
  );
}
