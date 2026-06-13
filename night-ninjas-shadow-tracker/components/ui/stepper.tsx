import { cn } from '@/lib/utils';

/**
 * Stepper — wizard progress indicator. Horizontal row of small numbered
 * cells, the active one accented with accent. Brutalist not friendly.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number; // 1-indexed
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const state =
          idx === current ? 'active' : idx < current ? 'done' : 'pending';
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 px-3 h-8 border',
                state === 'active' &&
                  'border-accent bg-accent text-bone',
                state === 'done' &&
                  'border-bone-dim text-bone-dim',
                state === 'pending' &&
                  'border-ink-line text-bone-mute'
              )}
            >
              <span className="font-mono text-xs">
                {idx.toString().padStart(2, '0')}
              </span>
              <span className="nn-caps">{label}</span>
            </div>
            {idx < steps.length && (
              <div className="w-4 h-px bg-ink-line" />
            )}
          </div>
        );
      })}
    </div>
  );
}
