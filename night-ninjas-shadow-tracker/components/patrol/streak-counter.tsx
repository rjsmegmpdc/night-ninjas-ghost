import Link from 'next/link';
import { Flame, AlertTriangle } from 'lucide-react';
import { getStreakState } from '@/lib/analysis/streak';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';

/**
 * StreakCounter — small top-right indicator on Patrol.
 *
 * Three render states:
 *   - No data — renders nothing (pre-sync)
 *   - Active streak — flame glyph + day count, accent colour
 *   - Broken — alarm icon + last-known count, signal-warn colour
 *
 * Each visible state has a hover-card explaining what counts toward the
 * streak, when the alarm fires, and how to switch modes via Settings.
 * Compact by design — single chip, hover for context.
 */
export async function StreakCounter() {
  const streak = await getStreakState();

  if (!streak) return null;

  const modeLabel = streak.runEverydayMode ? 'Run only' : 'Any exercise';
  const modeDescription = streak.runEverydayMode
    ? 'Only Run / TrailRun / VirtualRun count'
    : 'Any sport_type counts (gym, ride, walk, run)';

  // Edge case: no qualifying activities ever
  if (streak.count === 0 && streak.lastQualifyingDate === null) {
    return (
      <HoverCardTrigger>
        <span className="flex items-center gap-1.5 px-2.5 py-1 border border-ink-line text-bone-mute font-mono text-xs cursor-default">
          <Flame size={12} strokeWidth={1.5} />
          <span className="tabular-nums">0d</span>
        </span>
        <HoverCard>
          <div className="space-y-1.5">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-dim">
              streak · no qualifying days
            </div>
            <div>
              No matching activities found in the last 400 days.
            </div>
            <div className="text-bone-mute">
              Mode: <span className="text-bone">{modeLabel}</span> · {modeDescription}
            </div>
            <div className="pt-1 border-t border-ink-line">
              <Link
                href="/settings#streak"
                className="text-accent hover:underline pointer-events-auto"
              >
                ↳ change mode in Settings
              </Link>
            </div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  if (streak.isBroken) {
    return (
      <HoverCardTrigger>
        <span className="flex items-center gap-1.5 px-2.5 py-1 border border-signal-warn/60 bg-signal-warn/10 text-signal-warn font-mono text-xs cursor-default">
          <AlertTriangle size={12} strokeWidth={1.5} />
          <span className="tabular-nums">{streak.count}d</span>
        </span>
        <HoverCard>
          <div className="space-y-1.5">
            <div className="font-display tracking-wide-display uppercase text-[10px] text-signal-warn">
              streak broken
            </div>
            <div>
              Yesterday had no {streak.runEverydayMode ? 'run' : 'qualifying activity'}.
              The {streak.count}-day streak ends with the day before.
            </div>
            <div className="text-bone-mute">
              Mode: <span className="text-bone">{modeLabel}</span> · {modeDescription}
            </div>
            <div className="text-bone-mute">
              Today is excluded — sync after today's session to start a new streak.
            </div>
            <div className="pt-1 border-t border-ink-line">
              <Link
                href="/settings#streak"
                className="text-accent hover:underline pointer-events-auto"
              >
                ↳ change mode in Settings
              </Link>
            </div>
          </div>
        </HoverCard>
      </HoverCardTrigger>
    );
  }

  return (
    <HoverCardTrigger>
      <span className="flex items-center gap-1.5 px-2.5 py-1 border border-accent/60 bg-accent/10 text-accent font-mono text-xs cursor-default">
        <Flame size={12} strokeWidth={1.5} />
        <span className="tabular-nums">{streak.count}d</span>
      </span>
      <HoverCard>
        <div className="space-y-1.5">
          <div className="font-display tracking-wide-display uppercase text-[10px] text-accent">
            streak · {streak.count} day{streak.count === 1 ? '' : 's'}
          </div>
          <div>
            Consecutive days with {streak.runEverydayMode ? 'a run' : 'an activity'},
            ending yesterday.
          </div>
          <div className="text-bone-mute">
            Mode: <span className="text-bone">{modeLabel}</span> · {modeDescription}
          </div>
          <div className="text-bone-mute">
            Alarm fires when the previous completed day has no qualifying activity.
            Today is excluded — it's still in progress.
          </div>
          <div className="pt-1 border-t border-ink-line">
            <Link
              href="/settings#streak"
              className="text-accent hover:underline pointer-events-auto"
            >
              ↳ change mode in Settings
            </Link>
          </div>
        </div>
      </HoverCard>
    </HoverCardTrigger>
  );
}
