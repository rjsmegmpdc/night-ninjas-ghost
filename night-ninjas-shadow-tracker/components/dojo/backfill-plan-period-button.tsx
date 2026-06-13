'use client';

import { useState, useTransition } from 'react';
import { Wrench, Check, AlertCircle } from 'lucide-react';
import { backfillActivePlanPeriod } from '@/lib/actions/backfill-plan-period';

/**
 * BackfillPlanPeriodButton - one-shot maintenance action that materialises
 * a plan_periods row from the current active plan settings.
 *
 * Safe to click multiple times. Idempotent. Reports outcome inline:
 *   - "inserted"        : just created the row (success)
 *   - "already-existed" : table already had a coverage row, no action
 *   - "no-active-plan"  : no goal race or dojo configured, can't backfill
 *
 * Lives on /dojo as a low-key admin button. Will be retired once enough
 * time has passed that nobody's affected by the original seeder bug.
 */
export function BackfillPlanPeriodButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof backfillActivePlanPeriod>> | null>(
    null
  );

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await backfillActivePlanPeriod();
      setResult(r);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          'inline-flex items-center gap-2 px-3 py-2 border font-mono text-xs uppercase tracking-wide transition-colors ' +
          (pending
            ? 'border-bone-mute/40 text-bone-mute cursor-wait'
            : 'border-ink-line text-bone-dim hover:border-accent hover:text-accent cursor-pointer')
        }
      >
        <Wrench size={12} strokeWidth={1.5} />
        {pending ? 'Backfilling...' : 'Backfill plan period'}
      </button>

      {result && <BackfillResultPanel result={result} />}
    </div>
  );
}

function BackfillResultPanel({
  result,
}: {
  result: Awaited<ReturnType<typeof backfillActivePlanPeriod>>;
}) {
  if (result.status === 'inserted') {
    return (
      <div className="flex items-start gap-2 p-3 border border-signal-ok/40 bg-signal-ok/5 font-mono text-xs">
        <Check size={14} strokeWidth={1.5} className="text-signal-ok mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <div className="text-signal-ok uppercase tracking-wide">Plan period created</div>
          <div className="text-bone-dim">
            {result.dojo} - starts {result.startDate}
          </div>
          <div className="text-bone-mute">
            Refresh /patrol - past weeks should now render against your dojo template, not base maintenance.
          </div>
        </div>
      </div>
    );
  }

  if (result.status === 'already-existed') {
    return (
      <div className="flex items-start gap-2 p-3 border border-bone-mute/30 bg-ink-shadow/30 font-mono text-xs">
        <Check size={14} strokeWidth={1.5} className="text-bone-mute mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <div className="text-bone-dim uppercase tracking-wide">No action needed</div>
          <div className="text-bone-mute">
            Active period already exists: {result.dojo} - starts {result.startDate}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3 border border-signal-warn/40 bg-signal-warn/5 font-mono text-xs">
      <AlertCircle size={14} strokeWidth={1.5} className="text-signal-warn mt-0.5 flex-shrink-0" />
      <div className="space-y-1">
        <div className="text-signal-warn uppercase tracking-wide">No active plan</div>
        <div className="text-bone-mute">
          The seeder needs both a goal race (with target time) and a dojo selected. Run /setup if either is missing.
        </div>
      </div>
    </div>
  );
}
