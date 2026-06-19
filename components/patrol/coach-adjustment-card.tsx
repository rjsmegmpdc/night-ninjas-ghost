'use client';

import { useState, useTransition } from 'react';
import { Bot, AlertTriangle, Check, X } from 'lucide-react';
import { applyPlanAdjustment, dismissPlanAdjustment } from '@/lib/actions/plan-adjustments';

/**
 * Phase 3b - the coach's voice on the dashboard.
 *
 * Renders the state-aware interpretation of the current week:
 *   pending      - proposal with Apply / Dismiss (rail rows need an extra
 *                  confirmation step before dismissal)
 *   auto-applied - notification that automatic mode adjusted the week
 *   applied      - confirmation the athlete accepted a proposal
 *   none/dismissed - renders nothing
 */

export interface CoachCardProps {
  adjustmentId: number | null;
  status: 'none' | 'pending' | 'applied' | 'auto-applied' | 'dismissed';
  rail: boolean;
  trigger: string | null;
  rationale: string;
  changes: string[];
  rawTotalKm: number;
  adjustedTotalKm: number;
  /** Phase 4: automatic mode paused by an active injury/illness. */
  injuryPaused?: boolean;
}

export function CoachAdjustmentCard(props: CoachCardProps) {
  const { adjustmentId, status, rail, rationale, changes, rawTotalKm, adjustedTotalKm, injuryPaused } = props;
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (status === 'none' || status === 'dismissed' || adjustmentId === null) return null;

  const act = (action: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set('id', String(adjustmentId));
    startTransition(() => {
      action(fd);
    });
  };

  const tone = rail
    ? 'border-signal-miss/50 bg-signal-miss/5'
    : status === 'pending'
      ? 'border-signal-warn/50 bg-signal-warn/5'
      : 'border-signal-ok/40 bg-signal-ok/5';

  return (
    <div className={`rounded-xl border shadow-card p-5 space-y-4 ${tone}`}>
      <div className="flex items-start gap-3">
        {rail ? (
          <AlertTriangle size={20} strokeWidth={1.5} className="text-signal-miss shrink-0 mt-0.5" />
        ) : (
          <Bot size={20} strokeWidth={1.5} className={status === 'pending' ? 'text-signal-warn shrink-0 mt-0.5' : 'text-signal-ok shrink-0 mt-0.5'} />
        )}
        <div className="flex-1 space-y-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            {rail ? 'coach - safety rail' : 'coach'}
          </div>
          <div className="font-display tracking-wide-display uppercase text-lg text-bone">
            {status === 'pending' && (rail ? 'Volume cut required' : 'Adjustment proposed')}
            {status === 'auto-applied' && 'Week adjusted automatically'}
            {status === 'applied' && 'Adjustment applied'}
          </div>
        </div>
        {status === 'pending' && (
          <div className="font-mono text-xs text-bone-dim whitespace-nowrap">
            {rawTotalKm} → {adjustedTotalKm}km
          </div>
        )}
      </div>

      {injuryPaused && (
        <div className="flex items-start gap-2 rounded-lg border border-signal-warn/40 bg-signal-warn/5 px-3 py-2 text-xs text-signal-warn">
          <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>Managing an injury - automatic adjustments are paused. This is shown for you to apply, not applied for you.</span>
        </div>
      )}

      <p className="text-sm text-bone-dim leading-relaxed">{rationale}</p>

      {changes.length > 0 && (
        <ul className="font-mono text-xs text-bone-dim space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-bone-mute shrink-0">·</span>
              {c}
            </li>
          ))}
        </ul>
      )}

      {status === 'pending' && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {!confirmingDismiss ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => (rail ? setConfirmingDismiss(true) : act(dismissPlanAdjustment))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-bone-dim hover:text-bone border border-ink-line hover:border-ink-line-bold disabled:opacity-50"
              >
                <X size={14} strokeWidth={1.5} />
                Dismiss
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(applyPlanAdjustment)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-ink font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
              >
                <Check size={14} strokeWidth={1.5} />
                Apply
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-signal-miss">
                This is an injury-risk rail. It will re-raise until your load ratio drops. Dismiss anyway?
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingDismiss(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-bone-dim border border-ink-line hover:border-ink-line-bold"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(dismissPlanAdjustment)}
                className="px-3 py-1.5 rounded-lg text-xs text-signal-miss border border-signal-miss/40 hover:bg-signal-miss/10 disabled:opacity-50"
              >
                Dismiss anyway
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
