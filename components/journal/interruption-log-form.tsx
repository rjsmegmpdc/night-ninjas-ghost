'use client';

import { useRef, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { logInterruption, type InterruptionResult } from '@/lib/actions/interruptions';

/**
 * Phase 4 - log a new interruption (injury / illness / travel / other).
 * Body region only applies to injuries, so it shows only when injury is the
 * selected type. Templated off the VO2 capture form.
 */

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

const BODY_REGIONS = [
  'calf', 'achilles', 'knee', 'hip', 'hamstring', 'quad',
  'shin', 'foot', 'ankle', 'lower back', 'IT band',
];

export function InterruptionLogForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<InterruptionResult | null>(null);
  const [type, setType] = useState<string>('injury');

  const today = new Date().toISOString().slice(0, 10);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      const r = await logInterruption(fd);
      setResult(r);
      if (r.ok) {
        formRef.current?.reset();
        setType('injury');
      }
    });
  };

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-5">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        log an interruption
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="type">
            <select name="type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="injury">Injury</option>
              <option value="illness">Illness</option>
              <option value="travel">Travel</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="severity">
            <select name="severity" className={inputClass} defaultValue="niggle">
              <option value="niggle">Niggle</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </Field>
        </div>

        {type === 'injury' && (
          <Field label="body region" hint="where it is">
            <input name="body_region" type="text" list="ns-body-regions" className={inputClass} placeholder="calf" />
            <datalist id="ns-body-regions">
              {BODY_REGIONS.map((r) => <option key={r} value={r} />)}
            </datalist>
          </Field>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="start date">
            <input name="start_date" type="date" className={inputClass} defaultValue={today} />
          </Field>
          <Field label="end date" hint="leave blank if ongoing">
            <input name="end_date" type="date" className={inputClass} />
          </Field>
        </div>

        <Field label="note (optional)">
          <input name="note" type="text" className={inputClass} placeholder="e.g. tweaked on the long run" />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={1.5} />
          {isPending ? 'Saving...' : 'Log it'}
        </button>
      </form>

      {result && (
        <div
          className={
            'rounded-lg p-3 text-sm ' +
            (result.ok ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
                       : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? 'Interruption logged.' : result.error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">{label}</span>
      {children}
      {hint && <span className="font-mono text-[10px] text-bone-mute block">{hint}</span>}
    </label>
  );
}
