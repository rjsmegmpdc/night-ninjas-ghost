import type { AdjustmentHistoryRow, AdjustmentStatus } from '@/lib/plans/adjustment-history';

/**
 * Phase 3b part 2 - the coach proposal history list (server component).
 * Reverse-chronological audit trail of every state-aware adjustment.
 */

const TRIGGER_LABEL: Record<string, string> = {
  'acwr-high': 'ACWR rail',
  'acwr-caution': 'ACWR caution',
  'tsb-low': 'Low form',
  overreached: 'Overreached',
  monotony: 'Monotony',
  'sickness-window': 'Illness',
  'travel-window': 'Travel',
};

const STATUS_STYLE: Record<AdjustmentStatus, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'text-signal-warn border-signal-warn/40 bg-signal-warn/5' },
  applied: { label: 'Applied', tone: 'text-signal-ok border-signal-ok/40 bg-signal-ok/5' },
  'auto-applied': { label: 'Auto-applied', tone: 'text-signal-ok border-signal-ok/40 bg-signal-ok/5' },
  dismissed: { label: 'Dismissed', tone: 'text-bone-mute border-ink-line bg-ink-panel/40' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

export function ProposalHistory({ rows }: { rows: AdjustmentHistoryRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const s = STATUS_STYLE[r.status];
        const triggerLabel = TRIGGER_LABEL[r.trigger] ?? r.trigger;
        const showDelta = r.beforeKm != null && r.afterKm != null && r.beforeKm !== r.afterKm;
        return (
          <div key={r.id} className="nn-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="font-display tracking-wide-display uppercase text-sm text-bone">
                  {triggerLabel}
                </span>
                <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.tone}`}>
                  {s.label}
                </span>
              </div>
              {showDelta && (
                <span className="font-mono text-xs text-bone-dim whitespace-nowrap">
                  {r.beforeKm} → {r.afterKm}km
                </span>
              )}
            </div>
            <p className="text-sm text-bone-dim leading-relaxed">{r.rationale}</p>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap font-mono text-[10px] uppercase tracking-widest text-bone-mute">
              {r.weekStartIso && <span>week of {fmtDate(r.weekStartIso)}</span>}
              <span>proposed {fmtDate(r.proposedAt)}</span>
              {r.decidedAt && r.status !== 'pending' && (
                <span>
                  {r.status === 'auto-applied' ? 'auto-applied' : r.status} {fmtDate(r.decidedAt)}
                </span>
              )}
              <span>· {r.mode}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
