'use client';

import { useState, useTransition } from 'react';
import { setStreakMode } from '@/lib/actions/streak-settings';

/**
 * StreakModeToggle — radio-style toggle for streak.run_everyday setting.
 *
 * Two modes:
 *   - "Any exercise" (default, false) — gym/cycling/walk/run all count
 *   - "Run only" (true) — only Run/TrailRun/VirtualRun count
 *
 * Optimistic UI: clicking flips state immediately, server action runs
 * in a transition, page revalidates Patrol on completion. If the action
 * errors, the toggle would re-sync via revalidate.
 */
export function StreakModeToggle({ initial }: { initial: boolean }) {
  const [mode, setMode] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (next: boolean) => {
    if (next === mode) return;
    setMode(next);
    const fd = new FormData();
    fd.set('mode', next ? 'true' : 'false');
    startTransition(() => {
      setStreakMode(fd);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => handleSelect(false)}
        disabled={isPending}
        aria-pressed={!mode}
        className={
          'px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
          (!mode
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-ink-line text-bone-dim hover:border-bone-mute')
        }
      >
        Any exercise
      </button>
      <button
        type="button"
        onClick={() => handleSelect(true)}
        disabled={isPending}
        aria-pressed={mode}
        className={
          'px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
          (mode
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-ink-line text-bone-dim hover:border-bone-mute')
        }
      >
        Run only
      </button>
    </div>
  );
}
