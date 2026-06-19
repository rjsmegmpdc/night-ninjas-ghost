import { logPageView } from '@/lib/store/instrument';
import { getRaceExecution } from '@/lib/race/execution';
import { EmptyState } from '@/components/ui/empty-state';
import { PacePlanCard } from '@/components/race/pace-plan-card';
import { FuelingCard } from '@/components/race/fueling-card';
import { CarbLoadCard } from '@/components/race/carb-load-card';
import { ForecastCard } from '@/components/race/forecast-card';
import { formatDuration } from '@/lib/plans/derive';

/**
 * Race execution (Phase 6) - pacing, fuelling and carb-loading for the goal
 * race, computed from target time + weight. The execution side of the plan.
 */
export default async function RacePage() {
  logPageView('/race');
  const view = await getRaceExecution();

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">training - race execution</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">Race Day</h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Pacing, fuelling and carb-loading for your goal race - computed from your
          target time and weight. Plan the execution, not just the training.
        </div>
      </header>

      {!view ? (
        <EmptyState
          label="race · no goal"
          title="No goal race with a target time"
          reason="Race execution needs a goal race and a target finish time. Set them on the Calendar and the pacing, fuelling and carb-load plans appear here."
          action={{ href: '/calendar#tune-ups', label: 'Set goal race' }}
        />
      ) : (
        <>
          <div className="border border-accent/40 rounded-xl p-6 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <div className="font-display tracking-wide-display uppercase text-2xl text-bone">{view.race.name}</div>
              <div className="font-mono text-xs text-bone-mute mt-1">
                {view.race.distanceKm}km · target {formatDuration(view.race.targetTimeS)}
              </div>
            </div>
            {view.daysToRace !== null && view.daysToRace >= 0 && (
              <div className="text-right">
                <div className="font-display text-4xl text-accent tabular-nums leading-none">{view.daysToRace}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">days to go</div>
              </div>
            )}
          </div>

          <ForecastCard
            forecast={view.forecast}
            heat={view.heat}
            goalPaceSpk={view.goalPaceSpk}
            heatAdjustedPaceSpk={view.heatAdjustedPaceSpk}
            raceDate={view.race.raceDate}
          />
          <PacePlanCard pacing={view.pacing} />
          <FuelingCard fueling={view.fueling} />
          <CarbLoadCard carbLoad={view.carbLoad} />
        </>
      )}
    </div>
  );
}
