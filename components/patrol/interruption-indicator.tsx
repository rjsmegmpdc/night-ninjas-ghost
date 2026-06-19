import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { durationDays, type Interruption } from '@/lib/analysis/interruptions-pure';

/**
 * Phase 4 - compact Patrol banner listing active interruptions. Injury and
 * illness also pause automatic coach adjustments (surfaced on the coach card);
 * travel / other show here as context only. Renders nothing when there are no
 * active interruptions.
 */
export function InterruptionIndicator({ active }: { active: Interruption[] }) {
  if (active.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const pausesAuto = active.some((i) => i.type === 'injury' || i.type === 'illness');

  return (
    <Link
      href="/journal"
      className="block rounded-xl border border-signal-warn/50 bg-signal-warn/5 p-5 hover:border-signal-warn transition-colors"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            wellness - active interruption{active.length === 1 ? '' : 's'}
          </div>
          <ul className="space-y-0.5">
            {active.map((i) => {
              const days = durationDays(i, today);
              return (
                <li key={i.id} className="font-mono text-sm text-bone">
                  {labelFor(i)} - {days} day{days === 1 ? '' : 's'}
                </li>
              );
            })}
          </ul>
          {pausesAuto && (
            <div className="font-mono text-xs text-signal-warn">
              Automatic coach adjustments are paused while an injury or illness is active.
            </div>
          )}
          <div className="font-mono text-xs text-bone-mute pt-0.5">Manage on Journal -&gt;</div>
        </div>
      </div>
    </Link>
  );
}

function labelFor(i: Interruption): string {
  const region = i.type === 'injury' && i.bodyRegion ? ` (${i.bodyRegion})` : '';
  return `${i.type}${region} · ${i.severity}`;
}
