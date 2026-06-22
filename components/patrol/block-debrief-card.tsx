'use client';

import { useRef, useState, useTransition } from 'react';
import { Check, BookOpen } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import { logBlockDebrief, type BlockDebriefResult } from '@/lib/actions/block-debrief';

const inputClass =
  'w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none resize-none';

interface ExistingDebrief {
  feltAboutBlock: string | null;
  mainLearning: string | null;
  nextBlockFocus: string | null;
}

interface Props {
  planPeriodId: number;
  weekNumber: number;
  programWeeks: number;
  existing?: ExistingDebrief | null;
}

export function BlockDebriefCard({ planPeriodId, weekNumber, programWeeks, existing }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BlockDebriefResult | null>(null);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      setResult(await logBlockDebrief(fd));
    });
  };

  const alreadySaved = !!existing?.feltAboutBlock || !!existing?.mainLearning || !!existing?.nextBlockFocus;
  const weeksLeft = programWeeks - weekNumber;

  return (
    <Card className="space-y-4 border-accent/30 bg-accent/5">
      <CardLabel className="flex items-center gap-1.5">
        <BookOpen size={12} strokeWidth={1.5} className="text-accent" />
        block-end debrief
      </CardLabel>

      <div className="font-mono text-xs text-bone-dim leading-relaxed">
        {weeksLeft <= 0
          ? 'The block is complete. Capture what you learned before starting the next one.'
          : `${weeksLeft} week${weeksLeft === 1 ? '' : 's'} remaining. Lock in what you want to carry forward.`}
      </div>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        <input type="hidden" name="planPeriodId" value={planPeriodId} />

        <Field label="How did the block go overall?">
          <textarea
            name="feltAboutBlock"
            rows={2}
            className={inputClass}
            placeholder="Consistent, interrupted, fatigued, strong..."
            defaultValue={existing?.feltAboutBlock ?? ''}
          />
        </Field>

        <Field label="Main learning from this block">
          <textarea
            name="mainLearning"
            rows={2}
            className={inputClass}
            placeholder="What would you do differently, what confirmed a hunch..."
            defaultValue={existing?.mainLearning ?? ''}
          />
        </Field>

        <Field label="Focus for the next block">
          <textarea
            name="nextBlockFocus"
            rows={2}
            className={inputClass}
            placeholder="Goal shift, volume target, recovery habit..."
            defaultValue={existing?.nextBlockFocus ?? ''}
          />
        </Field>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-ink font-display tracking-wide-display uppercase text-xs hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <Check size={14} strokeWidth={1.5} />
          {isPending ? 'Saving...' : alreadySaved ? 'Update debrief' : 'Save debrief'}
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
          {result.ok ? 'Debrief saved.' : result.error}
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
