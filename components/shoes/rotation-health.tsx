import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import type { RotationHealth } from '@/lib/shoes/shoe-recommender-pure';

interface Props {
  health: RotationHealth;
}

const STATUS_CONFIG = {
  good: {
    icon: CheckCircle2,
    iconClass: 'text-signal-ok',
    labelClass: 'text-signal-ok',
    label: 'healthy rotation',
  },
  caution: {
    icon: AlertTriangle,
    iconClass: 'text-signal-warn',
    labelClass: 'text-signal-warn',
    label: 'rotation light',
  },
  poor: {
    icon: AlertTriangle,
    iconClass: 'text-signal-miss',
    labelClass: 'text-signal-miss',
    label: 'no rotation',
  },
};

export function RotationHealthCard({ health }: Props) {
  const cfg = STATUS_CONFIG[health.status];
  const Icon = cfg.icon;

  return (
    <Card className="space-y-3">
      <CardLabel className="flex items-center gap-1.5">
        <RefreshCw size={12} strokeWidth={1.5} className="text-bone-mute" />
        rotation health
      </CardLabel>

      <div className="flex items-start gap-3">
        <Icon size={16} strokeWidth={1.5} className={`${cfg.iconClass} mt-0.5 shrink-0`} />
        <div className="space-y-1 min-w-0">
          <p className={`font-display tracking-wide-display text-sm ${cfg.labelClass}`}>
            {cfg.label}
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            {health.note}
          </p>
        </div>
      </div>

      <div className="flex gap-6 font-mono text-xs text-bone-dim pt-1">
        <span>
          <span className="text-bone">{health.activeShoesCount}</span> active
        </span>
        <span>
          <span className="text-bone">{health.recentlyUsedCount}</span> used last 28d
        </span>
      </div>
    </Card>
  );
}
