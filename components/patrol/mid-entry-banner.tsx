'use client';

import { X, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { dismissMidEntryBanner } from '@/lib/actions/mid-entry';
import type { MidEntryAssessment } from '@/lib/plans/mid-entry-pure';

interface MidEntryBannerProps {
  assessment: MidEntryAssessment;
  periodId: number;
}

const VERDICT_STYLE = {
  ok:      { bar: 'bg-signal-ok',   icon: CheckCircle,    iconClass: 'text-signal-ok',   label: 'LOAD MATCH' },
  caution: { bar: 'bg-signal-warn', icon: AlertCircle,    iconClass: 'text-signal-warn', label: 'LOAD CAUTION' },
  warning: { bar: 'bg-signal-miss', icon: AlertTriangle,  iconClass: 'text-signal-miss', label: 'LOAD GAP' },
} as const;

export function MidEntryBanner({ assessment, periodId }: MidEntryBannerProps) {
  const v = VERDICT_STYLE[assessment.verdict];
  const Icon = v.icon;

  const dismissAction = dismissMidEntryBanner.bind(null, periodId);

  return (
    <Card className="relative overflow-hidden border-ink-line">
      {/* accent bar on the left */}
      <div className={`absolute inset-y-0 left-0 w-0.5 ${v.bar}`} />

      <div className="pl-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={15} className={v.iconClass + ' shrink-0'} />
            <div className="min-w-0">
              <div className="nn-caps text-bone-dim">
                mid-program entry · week {assessment.weekNumber} · {v.label}
              </div>
              <div className="font-display tracking-wide-display text-lg uppercase leading-tight mt-0.5">
                {assessment.headline}
              </div>
            </div>
          </div>

          <form action={dismissAction} className="shrink-0">
            <button
              type="submit"
              className="font-mono text-xs text-bone-mute hover:text-bone transition-colors mt-1 flex items-center gap-1"
              aria-label="Dismiss mid-entry banner"
            >
              Dismiss <X size={14} />
            </button>
          </form>
        </div>

        {/* Body */}
        <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-2xl">
          {assessment.body}
        </p>

        {/* Suggested action */}
        {assessment.suggestedAction && (
          <div className="border border-ink-line bg-ink-surface px-3 py-2 max-w-2xl">
            <span className="nn-caps text-accent mr-2">suggested</span>
            <span className="font-mono text-xs text-bone leading-relaxed">
              {assessment.suggestedAction}
            </span>
          </div>
        )}

        {/* Stats strip */}
        <div className="flex items-center gap-6 pt-1 pb-1">
          <div>
            <div className="nn-caps">your chronic load</div>
            <div className="font-mono text-bone tabular-nums">
              {Math.round(assessment.chronicKm)}<span className="text-bone-dim text-xs ml-1">km/wk</span>
            </div>
          </div>
          <div className="text-bone-mute font-mono text-xs">vs</div>
          <div>
            <div className="nn-caps">week {assessment.weekNumber} target</div>
            <div className="font-mono text-bone tabular-nums">
              {Math.round(assessment.weekKmTarget)}<span className="text-bone-dim text-xs ml-1">km/wk</span>
            </div>
          </div>
          {assessment.weeksSkipped > 0 && (
            <>
              <div className="text-bone-mute font-mono text-xs">·</div>
              <div>
                <div className="nn-caps">transition weeks skipped</div>
                <div className="font-mono text-bone tabular-nums">
                  {assessment.weeksSkipped}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
