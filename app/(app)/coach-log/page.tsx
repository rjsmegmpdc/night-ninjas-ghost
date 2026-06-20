import { logPageView } from '@/lib/store/instrument';
import { getPlanAdjustmentsHistory } from '@/lib/plans/adjustment-history';
import { EmptyState } from '@/components/ui/empty-state';
import { ProposalHistory } from '@/components/patrol/proposal-history';

/**
 * Phase 3b part 2 - coach proposal history. The full audit trail of every
 * state-aware adjustment (proposed / applied / auto-applied / dismissed), across
 * all triggers and modes. The live current-week proposal lives on the Patrol
 * dashboard; this is the longitudinal record of how the plan has flexed.
 */
export default async function CoachLogPage() {
  logPageView('/coach-log');
  const rows = await getPlanAdjustmentsHistory();

  return (
    <div className="px-12 py-10 max-w-4xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">analytics - coach log</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">Coach Log</h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Every state-aware adjustment the coach has proposed - applied, automatic, or
          dismissed. The reasoning trail behind how your plan has flexed to your training state.
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          label="coach log · empty"
          title="No coach proposals yet"
          reason="As your training state moves - load ramps, form dips, monotony climbs, or you log an illness or travel window - the coach proposes plan adjustments. They appear here as a running history you can look back on."
          action={{ href: '/patrol', label: 'Go to dashboard' }}
        />
      ) : (
        <ProposalHistory rows={rows} />
      )}
    </div>
  );
}
