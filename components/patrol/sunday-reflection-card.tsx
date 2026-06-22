'use client';

import { useRef, useState, useTransition } from 'react';
import { Check, PenLine } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import { logSundayReflection, type SundayReflectionResult } from '@/lib/actions/sunday-reflection';

const inputClass =
  'w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none resize-none';

interface ExistingReflection {
  reflectionFelt: string | null;
  reflectionWorked: string | null;
  reflectionUncertain: string | null;
}

interface Props {
  date: string;
  existing?: ExistingReflection | null;
}

export function SundayReflectionCard({ date, existing }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SundayReflectionResult | null>(null);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      setResult(await logSundayReflection(fd));
    });
  };

  const alreadySaved = !!existing?.reflectionFelt || !!existing?.reflectionWorked || !!existing?.reflectionUncertain;

  return (
    <Card className="space-y-4 border-bone-mute/30">
      <CardLabel className="flex items-center gap-1.5">
        <PenLine size={12} strokeWidth={1.5} className="text-bone-mute" />
        sunday reflection
      </CardLabel>

      <div className="font-mono text-xs text-bone-dim leading-relaxed">
        End-of-week reflection. Three questions — takes two minutes.
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <input type="hidden" name="date" value={date} />

        <Field label="How did training feel this week?">
          <textarea
            name="reflectionFelt"
            rows={2}
            className={inputClass}
            placeholder="Energy levels, body feel, motivation..."
            defaultValue={existing?.reflectionFelt ?? ''}
          />
        </Field>

        <Field label="What worked well?">
          <textarea
            name="reflectionWorked"
            rows={2}
            className={inputClass}
            placeholder="Sessions that went well, pacing, recovery..."
            defaultValue={existing?.reflectionWorked ?? ''}
          />
        </Field>

        <Field label="What are you uncertain about heading into next week?">
          <textarea
            name="reflectionUncertain"
            rows={2}
            className={inputClass}
            placeholder="Fatigue, niggles, schedule concerns..."
            defaultValue={existing?.reflectionUncertain ?? ''}
          />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-ink font-display tracking-wide-display uppercase text-xs hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <Check size={14} strokeWidth={1.5} />
          {isPending ? 'Saving...' : alreadySaved ? 'Update reflection' : 'Save reflection'}
        </button>
      </form>

      {result && (
        <div
          className={
            'p-3 font-mono text-xs ' +
            (result.ok
              ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
              : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? 'Reflection saved.' : result.error}
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">{label}</span>
      {children}
    </label>
  );
}
