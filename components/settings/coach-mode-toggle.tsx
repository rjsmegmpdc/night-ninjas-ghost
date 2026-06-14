'use client';

import { useState, useTransition } from 'react';
import { updateCoachMode } from '@/lib/actions/coach-mode';
import type { CoachMode } from '@/lib/store/settings';

const OPTIONS: { value: CoachMode; label: string; blurb: string }[] = [
  {
    value: 'manual',
    label: 'Manual',
    blurb: 'Surface insights only. You change the plan yourself.',
  },
  {
    value: 'assisted',
    label: 'Assisted',
    blurb: 'Propose adjustments. Nothing changes until you apply.',
  },
  {
    value: 'automatic',
    label: 'Automatic',
    blurb: 'Apply adjustments when thresholds breach, and notify you.',
  },
];

/**
 * Phase 3b - three-position coach mode selector.
 *
 * Regardless of mode, two rails hold: the ACWR >= 1.5 cut keeps
 * re-proposing until the ratio drops, and athlete-logged injuries are
 * never auto-adjusted.
 */
export function CoachModeToggle({ initial }: { initial: CoachMode }) {
  const [value, setValue] = useState<CoachMode>(initial);
  const [isPending, startTransition] = useTransition();

  const select = (next: CoachMode) => {
    if (next === value) return;
    setValue(next);
    const fd = new FormData();
    fd.set('value', next);
    startTransition(() => {
      updateCoachMode(fd);
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => select(opt.value)}
          disabled={isPending}
          aria-pressed={value === opt.value}
          className={
            'text-left p-3 rounded-lg border transition-colors ' +
            (value === opt.value
              ? 'border-accent bg-accent-faint'
              : 'border-ink-line bg-ink-shadow hover:border-ink-line-bold')
          }
        >
          <div
            className={
              'font-display tracking-wide-display uppercase text-sm ' +
              (value === opt.value ? 'text-accent' : 'text-bone')
            }
          >
            {opt.label}
          </div>
          <div className="text-xs text-bone-dim mt-1 leading-relaxed">{opt.blurb}</div>
        </button>
      ))}
    </div>
  );
}
