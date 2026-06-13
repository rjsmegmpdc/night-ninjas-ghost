'use client';

import type { Level } from '@/lib/plans/types';

/**
 * LevelToggle - three-position selector for athlete level.
 *
 * Client-rendered, controlled. The parent picker holds the level state
 * and re-renders cards when level changes. Hero stats update accordingly.
 *
 * Buttons match the look of other Night Ninjas toggles (display font,
 * uppercase, accent for the active choice).
 */
export function LevelToggle({
  value,
  onChange,
}: {
  value: Level;
  onChange: (next: Level) => void;
}) {
  const options: Level[] = ['beginner', 'intermediate', 'advanced'];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={
            'px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
            (value === opt
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-ink-line text-bone-dim hover:border-bone-mute')
          }
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
