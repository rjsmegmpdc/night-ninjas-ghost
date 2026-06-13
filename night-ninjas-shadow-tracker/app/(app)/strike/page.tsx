import { logPageView } from '@/lib/store/instrument';
import { getAthleteState } from '@/lib/analysis/athlete-state';
import {
  getWeeklyIntensityHistory,
  getWeeklyMileageHistory,
} from '@/lib/analysis/weekly-history';
import { checkLongRunProportion } from '@/lib/analysis/progression';
import { currentWeekRange } from '@/lib/plans/active-plan';
import { AthleteStateCard } from '@/components/strike/athlete-state-card';
import { IntensityHistoryCard } from '@/components/strike/intensity-history-card';
import { MileageTrajectoryCard } from '@/components/strike/mileage-trajectory-card';

/**
 * Strike - athlete state visualisation.
 *
 * Phase 2 surface for the data layer built in Session A. Shows current
 * CTL/ATL/TSB and 8-week histories of intensity distribution + mileage.
 *
 * What's NOT here yet (deferred):
 *   - Full PMC line chart (Recharts integration with daily CTL/ATL/TSB
 *     overlay over the 8-week window)
 *   - Hover-over data points
 *   - Year-over-year comparison
 *   - Personal records ranking (the original Strike concept)
 *
 * The hard analytical work is done. The chart-rich visualisations come
 * in a follow-up session when the value-to-effort ratio justifies the
 * Recharts complexity.
 */
export default async function StrikePage() {
  logPageView('/strike');

  // All four queries run in parallel.
  // Calibration is empty for now - Phase 5 builds the profile UI.
  const [athleteState, intensityHistory, mileageHistory, longRunCheck] = await Promise.all([
    getAthleteState({}),
    getWeeklyIntensityHistory(8, {}),
    getWeeklyMileageHistory(8),
    (async () => {
      const { startIso } = currentWeekRange();
      return checkLongRunProportion(startIso);
    })(),
  ]);

  return (
    <div className="px-12 py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">analytics - athlete state</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Athlete State
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Where you actually are. Fitness, fatigue, form - and how your
          training has been distributed and progressing across the last
          eight weeks.
        </div>
      </header>

      {/* Top: athlete state full-width */}
      <AthleteStateCard state={athleteState} />

      {/* Two-column: intensity history + mileage trajectory */}
      <div className="grid lg:grid-cols-2 gap-6">
        <IntensityHistoryCard history={intensityHistory} />
        <MileageTrajectoryCard history={mileageHistory} />
      </div>

      {/* Long-run snapshot - this week's long run proportion */}
      {longRunCheck && (
        <div className="border border-ink-line p-6 space-y-3">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            long run - this week
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
                long run
              </div>
              <div className="font-display text-3xl text-bone tabular-nums leading-none">
                {longRunCheck.longRunKm}
                <span className="text-base text-bone-mute ml-1">km</span>
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
                of weekly total
              </div>
              <div className="font-display text-3xl text-bone tabular-nums leading-none">
                {longRunCheck.proportionPct.toFixed(0)}
                <span className="text-base text-bone-mute ml-1">%</span>
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
                vs 2 weeks ago
              </div>
              <div className="font-display text-3xl text-bone tabular-nums leading-none">
                {longRunCheck.growthVs2WeeksKm >= 0 ? '+' : ''}
                {longRunCheck.growthVs2WeeksKm.toFixed(1)}
                <span className="text-base text-bone-mute ml-1">km</span>
              </div>
            </div>
          </div>
          <div className="border-t border-ink-line pt-3 font-mono text-[11px] leading-relaxed text-bone-dim">
            {longRunCheck.message}
          </div>
        </div>
      )}
    </div>
  );
}
