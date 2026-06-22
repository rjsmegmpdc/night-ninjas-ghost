import { logPageView } from '@/lib/store/instrument';
import { getInterruptionsView } from '@/lib/analysis/interruptions';
import { InterruptionLogForm } from '@/components/journal/interruption-log-form';
import { ActiveInterruptionBanner } from '@/components/journal/active-interruption-banner';
import { ReturnToTrainingCard } from '@/components/journal/return-to-training-card';
import { InjuryRiskCard } from '@/components/journal/injury-risk-card';
import { ReflectionLog } from '@/components/journal/reflection-log';

/**
 * Wellness / Journal - Phase 4 interruption tracking.
 *
 * Athlete-logged breaks in training: injury, illness, travel, other. Logged
 * injuries NEVER auto-change the plan (the athlete drives recovery); they
 * inform the injury-risk read and pause automatic coach adjustments.
 */
export default async function JournalPage() {
  logPageView('/journal');
  const view = await getInterruptionsView();

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - wellness</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Wellness
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Log the breaks that training plans never survive cleanly - injury,
          illness, travel. Logged injuries never auto-change your plan; they
          inform the risk read and pause automatic adjustments. You drive the
          recovery.
        </div>
      </header>

      <ActiveInterruptionBanner active={view.active} />

      <ReturnToTrainingCard returns={view.returns} />

      <InjuryRiskCard risk={view.risk} />

      <InterruptionLogForm />

      {/* Phase 9 — longitudinal Sunday reflection log */}
      <ReflectionLog />
    </div>
  );
}
