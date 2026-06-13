import type { AthleteState } from '@/lib/analysis/athlete-state';

/**
 * AthleteStateCard - large summary of current PMC state for Strike.
 *
 * Shows CTL / ATL / TSB as three big numbers, with form classification
 * label and confidence rollup. Designed as the dominant card on Strike.
 *
 * Includes a "what these mean" footer for users new to the PMC framework.
 */
export function AthleteStateCard({ state }: { state: AthleteState | null }) {
  if (!state) {
    return (
      <div className="border border-ink-line p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          athlete state
        </div>
        <div className="font-mono text-bone-dim text-sm">
          No activity history yet. Sync from Strava on Patrol to populate.
        </div>
      </div>
    );
  }

  const tsbColour = formColour(state.formClass);

  return (
    <div className="border border-ink-line p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          athlete state - 8-week window
        </div>
        <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
          {state.activityCount} activities - {state.confidence}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            ctl
          </div>
          <div className="font-display text-4xl text-bone tabular-nums leading-none">
            {state.ctl.toFixed(1)}
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            chronic - fitness
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            atl
          </div>
          <div className="font-display text-4xl text-bone tabular-nums leading-none">
            {state.atl.toFixed(1)}
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            acute - fatigue
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            tsb
          </div>
          <div className={'font-display text-4xl tabular-nums leading-none ' + tsbColour}>
            {state.tsb >= 0 ? '+' : ''}
            {state.tsb.toFixed(1)}
          </div>
          <div className={'font-mono text-[10px] uppercase tracking-wide ' + tsbColour}>
            {state.formClass.replace('-', ' ')}
          </div>
        </div>
      </div>

      <div className="border-t border-ink-line pt-3 font-mono text-[11px] leading-relaxed text-bone-dim">
        CTL is your fitness floor (28-day exponential average of training points).
        ATL is recent fatigue (7-day average). TSB = CTL - ATL is your form -
        positive means fresh, negative means loaded. Both are in Daniels points,
        a duration-x-intensity unit calibrated by your HR or pace zones.
      </div>
    </div>
  );
}

function formColour(formClass: string): string {
  switch (formClass) {
    case 'fresh':
    case 'on-form':
      return 'text-signal-ok';
    case 'maintained':
      return 'text-bone';
    case 'loaded':
      return 'text-signal-warn';
    case 'overreached':
      return 'text-signal-miss';
    default:
      return 'text-bone';
  }
}
