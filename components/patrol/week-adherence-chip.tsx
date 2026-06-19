import type { DayCompliance } from '@/lib/analysis/compliance';

/**
 * R2 part 2 - compact 7-bar weekly adherence chip for the Patrol header.
 *
 * One bar per day Mon..Sun, coloured by that day's compliance:
 *   hit (on target), partial (off-band but done), miss (planned, not done),
 *   rest (no prescription), pending (a future day this week - not yet due).
 *
 * Reuses the week compliance Patrol already computes; no extra query.
 */

type DayStatus = 'hit' | 'partial' | 'miss' | 'rest' | 'pending';

const BAR_TONE: Record<DayStatus, string> = {
  hit: 'bg-signal-ok',
  partial: 'bg-signal-warn',
  miss: 'bg-signal-miss',
  rest: 'bg-ink-line',
  pending: 'bg-ink-line/40',
};

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dayStatus(day: DayCompliance | undefined, dow: number, todayDow: number): DayStatus {
  if (dow > todayDow) return 'pending';
  if (!day) return 'rest';
  const real = day.sessions.filter((s) => s.target.type !== 'rest');
  if (real.length === 0) return 'rest';
  if (real.some((s) => s.flag === 'miss' || s.flag === 'none')) return 'miss';
  if (real.some((s) => s.flag === 'warn' || s.flag === 'fast' || s.flag === 'slow' || s.flag === 'short')) {
    return 'partial';
  }
  return 'hit';
}

export function WeekAdherenceChip({ days, todayDow }: { days: DayCompliance[]; todayDow: number }) {
  const byDow = new Map(days.map((d) => [d.dow, d]));
  return (
    <div
      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-ink-line rounded-lg"
      title="This week's adherence (Mon-Sun)"
    >
      {Array.from({ length: 7 }, (_, dow) => {
        const status = dayStatus(byDow.get(dow), dow, todayDow);
        return (
          <span key={dow} className="flex flex-col items-center gap-1">
            <span className={`w-1.5 h-4 rounded-sm ${BAR_TONE[status]}`} />
            <span className="font-mono text-[8px] text-bone-mute leading-none">{DOW_LABELS[dow]}</span>
          </span>
        );
      })}
    </div>
  );
}
