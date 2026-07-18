/**
 * RingGauge — Kiero visual pass. Pure SVG thick-arc ring: big center
 * numeral, small unit suffix, uppercase tracked label beneath. No chart
 * library.
 *
 * Presentational only — callers resolve `pct` (0-100 fill) and colour.
 * The arc strokes with `currentColor`, so callers set the colour with a
 * text-* utility class on `className` (e.g. the readiness score's own
 * Tailwind colour token). Track uses the M3 outline-variant role so it
 * re-themes with [data-theme].
 */
export interface RingGaugeProps {
  /** Big center numeral, already formatted (e.g. "57", "+12", "0.70"). */
  value: string;
  /** Small suffix after the numeral, e.g. "%". */
  unit?: string;
  /** Uppercase tracked label beneath the ring; omit to render no label. */
  label?: string;
  /** Arc fill, 0-100 (clamped). */
  pct: number;
  size?: number;
  /** Carries the text-* colour class that drives the arc + numeral. */
  className?: string;
}

export function RingGauge({ value, unit, label, pct, size = 96, className }: RingGaugeProps) {
  const stroke = Math.round(size * 0.1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--m3-outline-variant)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 300ms cubic-bezier(0.05, 0.7, 0.1, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold tabular-nums leading-none" style={{ fontSize: size * 0.26 }}>
            {value}
            {unit && (
              <span className="text-on-surface-variant font-normal" style={{ fontSize: size * 0.14 }}>
                {unit}
              </span>
            )}
          </span>
        </div>
      </div>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
      )}
    </div>
  );
}
