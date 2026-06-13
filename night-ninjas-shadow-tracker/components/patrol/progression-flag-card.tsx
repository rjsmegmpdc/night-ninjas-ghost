import { TriangleAlert, AlertOctagon } from 'lucide-react';
import type { MileageProgression, LongRunCheck } from '@/lib/analysis/progression';

/**
 * ProgressionFlagCard - Patrol body indicator that surfaces ONLY when
 * mileage progression or long-run proportion crosses caution or risk
 * thresholds. Stays silent when both checks are 'ok'.
 *
 * Two checks displayed (when applicable):
 *   1. Weekly mileage progression - week-over-week + 4-week mean checks
 *   2. Long-run proportion - % of weekly total + growth rate
 *
 * Severity colours:
 *   - 'caution' - signal-warn  (rising volume, watch the trend)
 *   - 'risk'    - signal-miss  (volume spike, consider cutback)
 *
 * Card chooses worst-of-both severity for its border colour.
 */
export function ProgressionFlagCard({
  mileage,
  longRun,
}: {
  mileage: MileageProgression | null;
  longRun: LongRunCheck | null;
}) {
  // Filter to only flag-worthy entries
  const flags: FlagEntry[] = [];
  if (mileage && mileage.severity !== 'ok') {
    flags.push({
      severity: mileage.severity,
      title: 'Weekly mileage',
      message: mileage.message,
    });
  }
  if (longRun && longRun.severity !== 'ok') {
    flags.push({
      severity: longRun.severity,
      title: 'Long run',
      message: longRun.message,
    });
  }

  if (flags.length === 0) return null;

  const worstSeverity = flags.some((f) => f.severity === 'risk') ? 'risk' : 'caution';
  const isRisk = worstSeverity === 'risk';
  const Icon = isRisk ? AlertOctagon : TriangleAlert;
  const borderColour = isRisk
    ? 'border-signal-miss/60 bg-signal-miss/5'
    : 'border-signal-warn/60 bg-signal-warn/5';
  const titleColour = isRisk ? 'text-signal-miss' : 'text-signal-warn';

  return (
    <div className={'border p-4 space-y-3 ' + borderColour}>
      <div className={'flex items-center gap-2 font-display tracking-wide-display uppercase text-xs ' + titleColour}>
        <Icon size={14} strokeWidth={1.5} />
        <span>training load - {worstSeverity}</span>
      </div>
      <div className="space-y-2">
        {flags.map((flag, i) => {
          const flagColour = flag.severity === 'risk' ? 'text-signal-miss' : 'text-signal-warn';
          return (
            <div key={i} className="space-y-0.5">
              <div className={'font-mono text-[10px] uppercase tracking-widest ' + flagColour}>
                {flag.title}
              </div>
              <div className="text-bone text-sm font-mono leading-relaxed">{flag.message}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FlagEntry {
  severity: 'caution' | 'risk';
  title: string;
  message: string;
}
