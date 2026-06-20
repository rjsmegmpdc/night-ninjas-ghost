'use client';

import { useRef, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { logRaceDebrief, type DebriefResult } from '@/lib/actions/race-debrief';

/**
 * Phase 6 part 2 - post-race debrief form. Captures finish time, conditions,
 * RPE, and lessons into race_results. Prefills from an existing debrief so it
 * doubles as an editor.
 */

const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

interface ExistingDebrief {
  finishTimeS: number | null;
  conditions: string | null;
  rpe: number | null;
  lessons: string | null;
}

function formatHms(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${h}:${pad(m)}:${pad(sec)}`;
}

export function RaceDebriefForm({ existing }: { existing?: ExistingDebrief | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DebriefResult | null>(null);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      setResult(await logRaceDebrief(fd));
    });
  };

  return (
    <div className="space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        {existing ? 'race debrief' : 'log your debrief'}
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="finish time" hint="H:MM:SS">
            <input
              name="finishTime"
              type="text"
              className={inputClass}
              placeholder="2:58:30"
              defaultValue={existing?.finishTimeS != null ? formatHms(existing.finishTimeS) : ''}
            />
          </Field>
          <Field label="RPE" hint="1-10, how hard it felt">
            <input
              name="rpe"
              type="number"
              min={1}
              max={10}
              className={inputClass}
              placeholder="9"
              defaultValue={existing?.rpe ?? ''}
            />
          </Field>
        </div>

        <Field label="conditions">
          <input
            name="conditions"
            type="text"
            className={inputClass}
            placeholder="warm, humid, hilly back half"
            defaultValue={existing?.conditions ?? ''}
          />
        </Field>

        <Field label="lessons" hint="what to carry into the next block">
          <textarea
            name="lessons"
            rows={3}
            className={inputClass}
            placeholder="Went out 8s/km too quick; fuelling held up well."
            defaultValue={existing?.lessons ?? ''}
          />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          <Check size={16} strokeWidth={1.5} />
          {isPending ? 'Saving...' : existing ? 'Update debrief' : 'Save debrief'}
        </button>
      </form>

      {result && (
        <div
          className={
            'rounded-lg p-3 text-sm ' +
            (result.ok
              ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
              : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? 'Debrief saved.' : result.error}
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
