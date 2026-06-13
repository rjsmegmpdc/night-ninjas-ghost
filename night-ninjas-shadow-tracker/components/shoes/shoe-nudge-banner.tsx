import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { getAllShoesWithStats } from '@/lib/shoes/queries';

/**
 * ShoeNudgeBanner — stacks one row per shoe over 80% of recommended life,
 * sorted by urgency (highest pctUsed first). Shown on Patrol page header.
 *
 * Empty (renders nothing) if no shoes are nudgeable. Each row shows the
 * shoe name, % used, and km / target. Clicking the row goes to /shoes
 * where the user can retire / dismiss / find replacements.
 *
 * For users running multiple pairs in rotation (typical case: 4-8
 * shoes), it's normal to have 2-3 nudgeable at any time. Stacking lets
 * the user see them all without hiding signal behind "show more".
 */
export async function ShoeNudgeBanner() {
  const all = await getAllShoesWithStats();
  const nudgeable = all
    .filter((s) => s.shouldNudge)
    .sort((a, b) => b.pctUsed - a.pctUsed);

  if (nudgeable.length === 0) return null;

  return (
    <div className="border border-accent/40 bg-ink-shadow divide-y divide-accent/20">
      {/* Header row */}
      <div className="px-4 py-2 flex items-center gap-2.5 bg-accent/5">
        <AlertTriangle size={14} strokeWidth={1.5} className="text-accent" />
        <span className="font-display tracking-wide-display uppercase text-xs text-accent">
          {nudgeable.length} shoe{nudgeable.length === 1 ? '' : 's'} near retirement
        </span>
        <Link
          href="/shoes"
          className="ml-auto font-display tracking-wide-display uppercase text-xs text-bone-dim hover:text-bone transition-colors"
        >
          Manage →
        </Link>
      </div>

      {/* One row per nudgeable shoe */}
      {nudgeable.map((shoe) => {
        const pct = Math.min(100, Math.max(0, shoe.pctUsed));
        return (
          <Link
            key={shoe.id}
            href="/shoes"
            className="px-4 py-2 grid grid-cols-[1fr_auto_120px] gap-3 items-center hover:bg-accent/5 transition-colors"
          >
            <div className="font-display tracking-wide-display uppercase text-sm text-bone truncate">
              {shoe.name}
            </div>
            <div className="font-mono text-xs text-bone-dim tabular-nums whitespace-nowrap">
              {shoe.totalKm.toFixed(0)} / {shoe.effectiveTargetKm.toFixed(0)} km
            </div>
            <div className="space-y-1">
              <div className="font-mono text-xs text-accent tabular-nums text-right">
                {pct.toFixed(0)}%
              </div>
              <div className="h-1 bg-ink-line">
                <div
                  className={
                    'h-full ' +
                    (pct >= 100 ? 'bg-accent' : pct >= 90 ? 'bg-accent/70' : 'bg-signal-warn')
                  }
                  style={{ width: pct + '%' }}
                />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
