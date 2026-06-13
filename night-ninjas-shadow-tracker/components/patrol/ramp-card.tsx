import { TrendingUp, ShieldCheck, AlertTriangle, AlertOctagon, Minus } from 'lucide-react';
import type { RampPlan } from '@/lib/plans/ramp';

/**
 * RampCard - surfaces during pre-program base.
 *
 * Shows the athlete's current chronic load vs the dojo's expected entry
 * load, with a verdict on whether the ramp gap fits the time available.
 *
 * Five severity tiers (from ramp.ts):
 *   safe       - signal-ok, shield icon
 *   stretch    - bone, trending-up icon
 *   caution    - signal-warn, alert icon
 *   at-risk    - signal-miss, alert-octagon icon
 *   no-target  - bone-mute, minus icon (custom dojo, no expectation)
 *
 * The card is informational only - the ramp is not a hard prescription.
 * The athlete uses it to gauge whether to ramp aggressively, hold steady,
 * or push the program back.
 */
export function RampCard({ ramp }: { ramp: RampPlan | null }) {
  if (!ramp) return null;

  const display = displayFor(ramp.severity);
  const Icon = display.Icon;

  return (
    <div className={'border p-5 space-y-4 ' + display.borderClass}>
      <div className="flex items-center justify-between">
        <div className={'flex items-center gap-2 font-display tracking-wide-display uppercase text-xs ' + display.titleColour}>
          <Icon size={14} strokeWidth={1.5} />
          <span>ramp to program - {display.label}</span>
        </div>
        <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
          ceiling {(ramp.ceilingPct * 100).toFixed(0)}%/wk
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            now
          </div>
          <div className="font-display text-3xl text-bone tabular-nums leading-none">
            {ramp.currentChronicKm.toFixed(0)}
            <span className="text-base text-bone-mute ml-1">km/wk</span>
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            current chronic load
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            target
          </div>
          <div className="font-display text-3xl text-bone tabular-nums leading-none">
            {ramp.targetEntryKm > 0 ? ramp.targetEntryKm.toFixed(0) : '-'}
            {ramp.targetEntryKm > 0 && <span className="text-base text-bone-mute ml-1">km/wk</span>}
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            program week 1 entry
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            ramp/wk
          </div>
          <div className={'font-display text-3xl tabular-nums leading-none ' + display.titleColour}>
            {ramp.peakWeeklyIncreasePct === 0 ? '0' : '+' + (ramp.peakWeeklyIncreasePct * 100).toFixed(1)}
            <span className="text-base text-bone-mute ml-1">%</span>
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            {ramp.weeksAvailable} week{ramp.weeksAvailable === 1 ? '' : 's'} available
          </div>
        </div>
      </div>

      {ramp.weeklyTargets.length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
            weekly targets
          </div>
          <div className="flex items-end gap-1.5 h-12">
            {ramp.weeklyTargets.map((km, i) => {
              const maxKm = Math.max(ramp.targetEntryKm, ...ramp.weeklyTargets);
              const heightPct = (km / maxKm) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col-reverse" title={`Week ${i + 1}: ${km}km`}>
                  <div className={display.barClass} style={{ height: `${heightPct}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between font-mono text-[9px] text-bone-mute tabular-nums">
            <span>{ramp.weeklyTargets[0]}km</span>
            <span>{ramp.weeklyTargets[ramp.weeklyTargets.length - 1]}km</span>
          </div>
        </div>
      )}

      <div className="border-t border-ink-line pt-3 font-mono text-[11px] leading-relaxed text-bone-dim">
        {ramp.message}
      </div>
    </div>
  );
}

interface SeverityDisplay {
  Icon: typeof ShieldCheck;
  label: string;
  borderClass: string;
  titleColour: string;
  barClass: string;
}

function displayFor(severity: RampPlan['severity']): SeverityDisplay {
  switch (severity) {
    case 'safe':
      return {
        Icon: ShieldCheck,
        label: 'safe',
        borderClass: 'border-signal-ok/40 bg-signal-ok/5',
        titleColour: 'text-signal-ok',
        barClass: 'bg-signal-ok',
      };
    case 'stretch':
      return {
        Icon: TrendingUp,
        label: 'stretch - manageable',
        borderClass: 'border-bone/40 bg-bone/5',
        titleColour: 'text-bone',
        barClass: 'bg-bone',
      };
    case 'caution':
      return {
        Icon: AlertTriangle,
        label: 'caution',
        borderClass: 'border-signal-warn/40 bg-signal-warn/5',
        titleColour: 'text-signal-warn',
        barClass: 'bg-signal-warn',
      };
    case 'at-risk':
      return {
        Icon: AlertOctagon,
        label: 'at risk',
        borderClass: 'border-signal-miss/40 bg-signal-miss/5',
        titleColour: 'text-signal-miss',
        barClass: 'bg-signal-miss',
      };
    case 'no-target':
      return {
        Icon: Minus,
        label: 'no target',
        borderClass: 'border-ink-line bg-ink-shadow/30',
        titleColour: 'text-bone-mute',
        barClass: 'bg-bone-mute',
      };
  }
}
