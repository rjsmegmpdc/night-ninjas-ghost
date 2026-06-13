import { TrendingUp, TrendingDown, Activity, AlertTriangle, Sparkles } from 'lucide-react';
import type { AthleteState, FormClass } from '@/lib/analysis/athlete-state';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';

/**
 * FreshnessChip - Patrol header indicator showing the athlete's current
 * Training Stress Balance (TSB) form classification.
 *
 * Five form states with semantic colour:
 *   - 'fresh'       (TSB > +25)  - signal-ok   - sparkles icon
 *   - 'on-form'     (+10 to +25) - signal-ok   - trending-up icon
 *   - 'maintained'  (-10 to +10) - bone        - activity icon
 *   - 'loaded'      (-25 to -10) - signal-warn - trending-down icon
 *   - 'overreached' (TSB < -25)  - signal-miss - alert-triangle icon
 *
 * Hover-card surfaces:
 *   - CTL (chronic / fitness, 28-day EWMA in Daniels points)
 *   - ATL (acute / fatigue, 7-day EWMA)
 *   - TSB (form, CTL - ATL)
 *   - Confidence rollup ('calibrated' / 'pace-only' / 'estimated')
 *   - Activity count over the 8-week window
 *
 * Renders nothing if athleteState is null (no activity history yet).
 */
export function FreshnessChip({ state }: { state: AthleteState | null }) {
  if (!state) return null;

  const { Icon, label, colourClass, labelColour, description } = displayFor(state.formClass);
  const confidenceLabel = formatConfidence(state.confidence);

  return (
    <HoverCardTrigger>
      <span
        className={
          'flex items-center gap-1.5 px-2.5 py-1 border font-mono text-xs cursor-default ' +
          colourClass
        }
      >
        <Icon size={12} strokeWidth={1.5} />
        <span className="tabular-nums">{label}</span>
      </span>
      <HoverCard>
        <div className="space-y-1.5">
          <div className={'font-display tracking-wide-display uppercase text-[10px] ' + labelColour}>
            form - {label}
          </div>
          <div>{description}</div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">ctl</div>
              <div className="text-bone tabular-nums">{state.ctl.toFixed(1)}</div>
              <div className="text-bone-mute text-[9px]">fitness</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">atl</div>
              <div className="text-bone tabular-nums">{state.atl.toFixed(1)}</div>
              <div className="text-bone-mute text-[9px]">fatigue</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">tsb</div>
              <div className={'tabular-nums ' + labelColour}>
                {state.tsb >= 0 ? '+' : ''}
                {state.tsb.toFixed(1)}
              </div>
              <div className="text-bone-mute text-[9px]">form</div>
            </div>
          </div>
          <div className="text-bone-mute pt-1 border-t border-ink-line">
            8-week window - {state.activityCount} activit{state.activityCount === 1 ? 'y' : 'ies'} - confidence: {confidenceLabel}
          </div>
        </div>
      </HoverCard>
    </HoverCardTrigger>
  );
}

interface FormDisplay {
  Icon: typeof Activity;
  label: string;
  colourClass: string;
  labelColour: string;
  description: string;
}

function displayFor(formClass: FormClass): FormDisplay {
  switch (formClass) {
    case 'fresh':
      return {
        Icon: Sparkles,
        label: 'fresh',
        colourClass: 'border-signal-ok/60 bg-signal-ok/10 text-signal-ok',
        labelColour: 'text-signal-ok',
        description:
          'High TSB - well-rested. Good window for racing or hard training, but extended periods here mean under-loading.',
      };
    case 'on-form':
      return {
        Icon: TrendingUp,
        label: 'on form',
        colourClass: 'border-signal-ok/60 bg-signal-ok/10 text-signal-ok',
        labelColour: 'text-signal-ok',
        description:
          'Recovery on top of training. Peak performance window - you should feel strong on key sessions.',
      };
    case 'maintained':
      return {
        Icon: Activity,
        label: 'maintained',
        colourClass: 'border-ink-line bg-bone/5 text-bone',
        labelColour: 'text-bone',
        description:
          'Steady state - load and recovery balanced. Productive baseline for sustained training blocks.',
      };
    case 'loaded':
      return {
        Icon: TrendingDown,
        label: 'loaded',
        colourClass: 'border-signal-warn/60 bg-signal-warn/10 text-signal-warn',
        labelColour: 'text-signal-warn',
        description:
          'Productive overload - you should feel tired. Normal for mid-block training. Recovery sessions matter here.',
      };
    case 'overreached':
      return {
        Icon: AlertTriangle,
        label: 'overreached',
        colourClass: 'border-signal-miss/60 bg-signal-miss/10 text-signal-miss',
        labelColour: 'text-signal-miss',
        description:
          'Heavy fatigue accumulation - injury and illness risk territory. Consider a recovery week or extra rest.',
      };
  }
}

function formatConfidence(c: 'calibrated' | 'pace-only' | 'estimated'): string {
  switch (c) {
    case 'calibrated':
      return 'calibrated (HR or pace)';
    case 'pace-only':
      return 'pace-based';
    case 'estimated':
      return 'estimated (no calibration yet)';
  }
}
