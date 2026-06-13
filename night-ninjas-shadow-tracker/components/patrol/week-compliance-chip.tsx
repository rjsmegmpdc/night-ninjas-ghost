import { Check, Minus, X } from 'lucide-react';
import type { WeekCompliance } from '@/lib/analysis/compliance';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';

/**
 * WeekComplianceChip — small at-a-glance "am I on track" indicator for
 * Patrol header. Shows percentage of scheduled sessions hit so far this
 * week, with semantic colour band:
 *
 *   ≥ 80%  → ok (signal-ok green) ✓
 *   50-79% → soft (signal-warn) ~
 *   < 50%  → miss (signal-miss) ✗
 *
 * Hover-card breaks down hit/soft/miss counts and explains the rule.
 *
 * Renders nothing if no scheduled sessions have come due yet (e.g. on
 * Monday morning before the first session of the week — nothing to
 * evaluate yet, so the chip stays silent rather than showing 0%).
 */
export function WeekComplianceChip({ compliance }: { compliance: WeekCompliance }) {
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // Mon=0..Sun=6

  // Count only sessions on days that are today-or-past
  let scheduled = 0;
  let hits = 0;
  let softs = 0;

  for (const day of compliance.days) {
    if (day.dow > todayDow) continue; // future day, skip
    if (day.sessions.length === 0) continue; // rest day, skip
    scheduled++;

    // Worst-of-day reduction
    let worst: 'hit' | 'soft' | 'miss' = 'hit';
    for (const s of day.sessions) {
      if (s.flag === 'miss' || s.flag === 'none') {
        worst = 'miss';
        break;
      }
      if (s.flag !== 'ok' && worst === 'hit') {
        worst = 'soft';
      }
    }

    if (worst === 'hit') hits++;
    else if (worst === 'soft') softs++;
  }

  if (scheduled === 0) return null;

  const misses = scheduled - hits - softs;
  const pct = Math.round((hits / scheduled) * 100);
  const isOk = pct >= 80;
  const isSoft = pct >= 50 && pct < 80;

  const colourClass = isOk
    ? 'border-signal-ok/60 bg-signal-ok/10 text-signal-ok'
    : isSoft
    ? 'border-signal-warn/60 bg-signal-warn/10 text-signal-warn'
    : 'border-signal-miss/60 bg-signal-miss/10 text-signal-miss';

  const labelClass = isOk
    ? 'text-signal-ok'
    : isSoft
    ? 'text-signal-warn'
    : 'text-signal-miss';

  const Icon = isOk ? Check : isSoft ? Minus : X;

  return (
    <HoverCardTrigger>
      <span
        className={
          'flex items-center gap-1.5 px-2.5 py-1 border font-mono text-xs cursor-default ' +
          colourClass
        }
      >
        <Icon size={12} strokeWidth={1.5} />
        <span className="tabular-nums">{pct}%</span>
      </span>
      <HoverCard>
        <div className="space-y-1.5">
          <div
            className={
              'font-display tracking-wide-display uppercase text-[10px] ' + labelClass
            }
          >
            compliance · {pct}%
          </div>
          <div>
            Sessions completed against this week's plan, so far.
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">hit</div>
              <div className="text-signal-ok tabular-nums">{hits}</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">soft</div>
              <div className="text-signal-warn tabular-nums">{softs}</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">miss</div>
              <div className="text-signal-miss tabular-nums">{misses}</div>
            </div>
          </div>
          <div className="text-bone-mute pt-1 border-t border-ink-line">
            Past + today (if completed). Future days are excluded.
            ≥80% green · 50-79% yellow · &lt;50% red.
          </div>
        </div>
      </HoverCard>
    </HoverCardTrigger>
  );
}
