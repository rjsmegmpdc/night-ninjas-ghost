import { Card, CardLabel } from '@/components/ui/card';
import { Wrench } from 'lucide-react';
import { BackfillPlanPeriodButton } from '@/components/dojo/backfill-plan-period-button';
import { getProgramPhase } from '@/lib/plans/program-phase';
import { getRampPlanForActivePeriod } from '@/lib/plans/ramp-loader';
import { RampCard } from '@/components/patrol/ramp-card';
import { DojoPicker } from '@/components/dojo/dojo-picker';
import { switchDojo } from '@/lib/actions/switch-dojo';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { Dojo } from '@/lib/plans/types';

export default async function DojoPage() {
  const programPhase = await getProgramPhase();
  const rampPlan = await getRampPlanForActivePeriod(programPhase);

  // Read currently-selected dojo
  const db = getDb();
  const goalRace = await db
    .select()
    .from(schema.races)
    .where(eq(schema.races.isGoal, true))
    .get();
  const dojoRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'plan.dojo'))
    .get();
  const selectedDojo = (dojoRow?.value ?? null) as Dojo | null;
  const level = (goalRace?.level as 'beginner' | 'intermediate' | 'advanced') ?? 'intermediate';

  return (
    <div className="px-12 py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">training - methodology</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Methodology
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-3xl">
          Each dojo brings a different philosophy. Pick the one that
          matches the kind of athlete you want to be. Switch any time
          without losing your history.
        </div>
      </header>

      {/* Dojo selection grid - the centrepiece of this page */}
      <DojoPicker
        selectedDojo={selectedDojo}
        defaultLevel={level}
        onSelectFormAction={switchDojo}
      />

      {/* Ramp analysis - visible only during pre-program base. */}
      {rampPlan && <RampCard ramp={rampPlan} />}

      {/* Maintenance card - tucked at bottom for the backfill case. */}
      <Card className="space-y-4 max-w-2xl border-bone-mute/30">
        <CardLabel className="text-bone-mute flex items-center gap-2">
          <Wrench size={14} strokeWidth={1.5} />
          maintenance
        </CardLabel>
        <p className="text-bone-dim text-sm leading-relaxed">
          If your matrix shows past weeks as <span className="font-mono">(base)</span>
          even though you have an active dojo and goal race, the
          plan_periods row may not have been written. Click below to
          backfill it from your current settings.
        </p>
        <BackfillPlanPeriodButton />
      </Card>
    </div>
  );
}
