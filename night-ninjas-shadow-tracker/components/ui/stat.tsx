import { cn } from '@/lib/utils';

/**
 * Stat — the signature data display unit. Tiny caps label above a large
 * mono-spaced value. Used everywhere in the dashboard to show paces,
 * distances, times, counts.
 *
 * Optional `accent` prop tints the value accent — used for current
 * state (this week's volume, latest PB) and missed compliance.
 */
export function Stat({
  label,
  value,
  unit,
  accent = false,
  size = 'md',
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const valueSize = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
    xl: 'text-7xl',
  }[size];

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="nn-caps">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'nn-stat font-mono tabular-nums leading-none',
            valueSize,
            accent ? 'text-accent' : 'text-bone'
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-bone-dim text-xs uppercase tracking-wider">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
