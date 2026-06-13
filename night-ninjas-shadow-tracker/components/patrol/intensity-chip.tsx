import { Zap, Minus, AlertCircle } from 'lucide-react';
import type { IntensityDistribution } from '@/lib/analysis/intensity-distribution';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';

/**
 * IntensityChip - Patrol header indicator showing this week's running
 * intensity distribution against the Seiler 80/20 polarised target.
 *
 * Three states:
 *   - polarised  (easyPct >= 80)  - signal-ok   - zap icon
 *   - mixed      (60-80% easy)    - signal-warn - minus icon
 *   - inverted   (<60% easy)      - signal-miss - alert icon
 *                  (too much hard work or grey-zone training)
 *
 * Display label is the easy percentage. Hover-card breaks down the full
 * three-zone split (easy / grey / hard) and explains the rule.
 *
 * Critically: this is a RUNNING-ONLY metric. Strength, yoga, cycling
 * cross-training do not enter the calculation. The 80/20 rule is
 * specifically about running intensity distribution.
 *
 * Renders nothing if distribution is null (no running this week).
 */
export function IntensityChip({ distribution }: { distribution: IntensityDistribution | null }) {
  if (!distribution) return null;

  const { Icon, colourClass, labelColour, label, description } = displayFor(distribution);

  return (
    <HoverCardTrigger>
      <span
        className={
          'flex items-center gap-1.5 px-2.5 py-1 border font-mono text-xs cursor-default ' +
          colourClass
        }
      >
        <Icon size={12} strokeWidth={1.5} />
        <span className="tabular-nums">{distribution.easyPct}%E</span>
      </span>
      <HoverCard>
        <div className="space-y-1.5">
          <div
            className={
              'font-display tracking-wide-display uppercase text-[10px] ' + labelColour
            }
          >
            intensity - {label}
          </div>
          <div>{description}</div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">easy</div>
              <div className="text-signal-ok tabular-nums">{distribution.easyPct}%</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">grey</div>
              <div className="text-signal-warn tabular-nums">{distribution.greyPct}%</div>
            </div>
            <div>
              <div className="text-bone-mute text-[9px] uppercase tracking-widest">hard</div>
              <div className="text-signal-miss tabular-nums">{distribution.hardPct}%</div>
            </div>
          </div>
          <div className="text-bone-mute pt-1 border-t border-ink-line">
            {distribution.totalRunMin} run minutes this week. Seiler target: easy &gt;= 80%, hard ~= 20%, grey-zone (marathon pace) minimised.
          </div>
        </div>
      </HoverCard>
    </HoverCardTrigger>
  );
}

interface IntensityDisplay {
  Icon: typeof Zap;
  colourClass: string;
  labelColour: string;
  label: string;
  description: string;
}

function displayFor(d: IntensityDistribution): IntensityDisplay {
  if (d.isPolarised) {
    return {
      Icon: Zap,
      colourClass: 'border-signal-ok/60 bg-signal-ok/10 text-signal-ok',
      labelColour: 'text-signal-ok',
      label: 'polarised',
      description:
        'Easy time dominates with focused hard work - the polarised pattern that produces durable adaptation.',
    };
  }
  if (d.easyPct >= 60) {
    return {
      Icon: Minus,
      colourClass: 'border-signal-warn/60 bg-signal-warn/10 text-signal-warn',
      labelColour: 'text-signal-warn',
      label: 'mixed',
      description:
        'Some grey-zone or hard time creeping in. Easy days should be easier so quality days can be quality.',
    };
  }
  return {
    Icon: AlertCircle,
    colourClass: 'border-signal-miss/60 bg-signal-miss/10 text-signal-miss',
    labelColour: 'text-signal-miss',
    label: 'inverted',
    description:
      'Too much time at moderate-or-hard intensity. Most amateur athletes plateau or get injured here.',
  };
}
