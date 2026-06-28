'use client';

import { useState } from 'react';
import { logInterruption } from '@/lib/actions/interruptions';
import { createCalendarEvent } from '@/lib/actions/calendar-events';

type Mode = 'injury' | 'sick' | 'away' | null;

const BODY_REGIONS = [
  'calf', 'knee', 'hamstring', 'IT band', 'achilles',
  'shin', 'quad', 'hip', 'ankle', 'foot', 'lower back',
] as const;

const SEVERITIES = ['niggle', 'moderate', 'severe'] as const;

const IMPACT_OPTIONS: { value: string; label: string }[] = [
  { value: 'reduced', label: 'Reduced' },
  { value: 'travel_only', label: 'Travel only' },
  { value: 'no_training', label: 'No training' },
];

const INPUT_CLS =
  'bg-ink border border-ink-line text-bone px-1.5 py-0.5 text-[11px] font-mono [color-scheme:dark]';

const BTN_SUBMIT =
  'font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border border-accent text-accent hover:bg-accent/10 transition-colors';

const BTN_CANCEL =
  'font-mono text-[11px] text-bone-mute hover:text-bone transition-colors leading-none';

/**
 * QuickLogStrip — a compact one-line action bar on Patrol for logging the
 * three most common user-input events: injury, illness, time away.
 *
 * Clicking a chip opens a minimal inline form directly below the strip.
 * Submitting revalidates /patrol via the existing server actions so the
 * InterruptionIndicator and matrix calendar events update immediately.
 */
export function QuickLogStrip() {
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function open(m: Mode) {
    setError(null);
    setMode((prev) => (prev === m ? null : m));
  }

  function close() {
    setMode(null);
    setError(null);
  }

  async function handleInjury(formData: FormData) {
    const result = await logInterruption(formData);
    if (result.ok) close();
    else setError(result.error ?? 'Could not log injury.');
  }

  async function handleSick(formData: FormData) {
    const result = await logInterruption(formData);
    if (result.ok) close();
    else setError(result.error ?? 'Could not log illness.');
  }

  async function handleAway(formData: FormData) {
    try {
      await createCalendarEvent(formData);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log event.');
    }
  }

  const chips: [Mode, string][] = [
    ['injury', '+ injury'],
    ['sick', '+ sick'],
    ['away', '+ away'],
  ];

  return (
    <div className="space-y-1.5">

      {/* Chip strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="nn-caps text-bone-mute">log</span>
        {chips.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => open(id)}
            className={
              'font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors ' +
              (mode === id
                ? 'border-accent text-accent bg-accent/5'
                : 'border-ink-line text-bone-mute hover:border-bone-mute hover:text-bone-dim')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Injury panel ─────────────────────────────────────────────── */}
      {mode === 'injury' && (
        <form
          action={handleInjury}
          className="flex items-center gap-3 flex-wrap px-3 py-2 border border-ink-line bg-ink-shadow"
        >
          <input type="hidden" name="type" value="injury" />
          <input type="hidden" name="start_date" value={today} />

          <label className="flex items-center gap-1.5 font-mono text-[11px] text-bone-mute">
            Region
            <select name="body_region" className={INPUT_CLS}>
              {BODY_REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <fieldset className="flex items-center gap-2.5 border-0 p-0 m-0">
            <span className="font-mono text-[11px] text-bone-mute">Severity</span>
            {SEVERITIES.map((s, i) => (
              <label key={s} className="flex items-center gap-1 font-mono text-[11px] text-bone cursor-pointer">
                <input type="radio" name="severity" value={s} defaultChecked={i === 0} className="accent-accent" />
                {s}
              </label>
            ))}
          </fieldset>

          <div className="flex items-center gap-2.5 ml-auto">
            {error && <span className="font-mono text-[10px] text-signal-miss">{error}</span>}
            <button type="submit" className={BTN_SUBMIT}>Log</button>
            <button type="button" onClick={close} className={BTN_CANCEL}>×</button>
          </div>
        </form>
      )}

      {/* ── Sick panel ───────────────────────────────────────────────── */}
      {mode === 'sick' && (
        <form
          action={handleSick}
          className="flex items-center gap-3 flex-wrap px-3 py-2 border border-ink-line bg-ink-shadow"
        >
          <input type="hidden" name="type" value="illness" />
          <input type="hidden" name="start_date" value={today} />

          <fieldset className="flex items-center gap-2.5 border-0 p-0 m-0">
            <span className="font-mono text-[11px] text-bone-mute">Severity</span>
            {SEVERITIES.map((s, i) => (
              <label key={s} className="flex items-center gap-1 font-mono text-[11px] text-bone cursor-pointer">
                <input type="radio" name="severity" value={s} defaultChecked={i === 0} className="accent-accent" />
                {s}
              </label>
            ))}
          </fieldset>

          <div className="flex items-center gap-2.5 ml-auto">
            {error && <span className="font-mono text-[10px] text-signal-miss">{error}</span>}
            <button type="submit" className={BTN_SUBMIT}>Log sick</button>
            <button type="button" onClick={close} className={BTN_CANCEL}>×</button>
          </div>
        </form>
      )}

      {/* ── Away panel ───────────────────────────────────────────────── */}
      {mode === 'away' && (
        <form
          action={handleAway}
          className="flex items-center gap-3 flex-wrap px-3 py-2 border border-ink-line bg-ink-shadow"
        >
          <input type="hidden" name="eventType" value="holiday" />
          <input type="hidden" name="title" value="Away" />

          <label className="flex items-center gap-1.5 font-mono text-[11px] text-bone-mute">
            From
            <input type="date" name="startDate" defaultValue={today} className={INPUT_CLS} />
          </label>

          <label className="flex items-center gap-1.5 font-mono text-[11px] text-bone-mute">
            To
            <input type="date" name="endDate" defaultValue={today} className={INPUT_CLS} />
          </label>

          <label className="flex items-center gap-1.5 font-mono text-[11px] text-bone-mute">
            Impact
            <select name="impact" className={INPUT_CLS}>
              {IMPACT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2.5 ml-auto">
            {error && <span className="font-mono text-[10px] text-signal-miss">{error}</span>}
            <button type="submit" className={BTN_SUBMIT}>Log away</button>
            <button type="button" onClick={close} className={BTN_CANCEL}>×</button>
          </div>
        </form>
      )}

    </div>
  );
}
