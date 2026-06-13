'use client';

import { useState, useTransition } from 'react';
import { updateFirstDayOfWeek } from '@/lib/actions/first-day-of-week';
import type { FirstDayOfWeek } from '@/lib/store/settings';

/**
 * FirstDayOfWeekToggle - radio-style toggle for prefs.firstDayOfWeek.
 *
 * Two options:
 *   - "Monday" (default)  - column order Mon Tue Wed Thu Fri Sat Sun
 *   - "Sunday" (US conv.) - column order Sun Mon Tue Wed Thu Fri Sat
 *
 * Optimistic UI: clicking flips state immediately, server action runs
 * in a transition, page revalidates Patrol on completion.
 *
 * Display-only setting. The internal week model is always Mon=0..Sun=6;
 * this only changes how the matrix presents the columns.
 */
export function FirstDayOfWeekToggle({ initial }: { initial: FirstDayOfWeek }) {
  const [value, setValue] = useState<FirstDayOfWeek>(initial);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (next: FirstDayOfWeek) => {
    if (next === value) return;
    setValue(next);
    const fd = new FormData();
    fd.set('value', next);
    startTransition(() => {
      updateFirstDayOfWeek(fd);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => handleSelect('monday')}
        disabled={isPending}
        aria-pressed={value === 'monday'}
        className={
          'px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
          (value === 'monday'
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-ink-line text-bone-dim hover:border-bone-mute')
        }
      >
        Monday
      </button>
      <button
        type="button"
        onClick={() => handleSelect('sunday')}
        disabled={isPending}
        aria-pressed={value === 'sunday'}
        className={
          'px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
          (value === 'sunday'
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-ink-line text-bone-dim hover:border-bone-mute')
        }
      >
        Sunday
      </button>
    </div>
  );
}
