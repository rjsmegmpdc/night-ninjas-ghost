import type { FrameworkStat } from '@/lib/analysis/framework-stats';

const STATUS_CLASS: Record<string, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
  neutral: 'text-bone',
};

export function FrameworkStatRow({ stats }: { stats: FrameworkStat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
      {stats.map((stat, i) => {
        const valClass = stat.status ? (STATUS_CLASS[stat.status] ?? 'text-bone') : 'text-bone';
        return (
          <div key={i} className="bg-ink p-6">
            <span className="nn-caps">{stat.label}</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`nn-stat font-mono tabular-nums leading-none text-5xl ${valClass}`}>
                {stat.value}
              </span>
              {stat.unit && (
                <span className="font-mono text-bone-dim text-xs uppercase tracking-wider">
                  {stat.unit}
                </span>
              )}
            </div>
            {stat.subline && (
              <div className="font-mono text-xs text-bone-mute mt-2">{stat.subline}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
