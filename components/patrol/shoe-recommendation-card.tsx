import { Footprints } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import type { ShoeRecommendation } from '@/lib/shoes/shoe-recommender-pure';
import type { SessionType } from '@/lib/plans/types';

const SESSION_LABEL: Partial<Record<SessionType, string>> = {
  long:       'long run',
  easy:       'easy run',
  recovery:   'recovery run',
  tempo:      'tempo session',
  interval:   'interval session',
  repetition: 'rep session',
};

interface Props {
  recommendation: ShoeRecommendation;
  sessionType: SessionType;
}

export function ShoeRecommendationCard({ recommendation, sessionType }: Props) {
  const sessionLabel = SESSION_LABEL[sessionType] ?? 'today's session';
  const pctLeft = 100 - recommendation.pctUsed;

  return (
    <Card className="space-y-3 border-bone-mute/20">
      <CardLabel className="flex items-center gap-1.5">
        <Footprints size={12} strokeWidth={1.5} className="text-bone-mute" />
        shoe recommendation
      </CardLabel>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="font-display tracking-wide-display text-sm text-bone truncate">
            {recommendation.shoeName}
          </p>
          <p className="font-mono text-xs text-bone-dim">
            {recommendation.reason}
          </p>
        </div>

        <div className="text-right shrink-0 space-y-1">
          <p className="font-mono text-xs text-bone">
            {recommendation.kmRemaining} km left
          </p>
          <p className="font-mono text-[10px] text-bone-mute">
            {pctLeft}% remaining
          </p>
        </div>
      </div>

      <div className="h-0.5 bg-ink-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pctLeft > 40
              ? 'bg-signal-ok'
              : pctLeft > 20
              ? 'bg-signal-warn'
              : 'bg-signal-miss'
          }`}
          style={{ width: `${pctLeft}%` }}
        />
      </div>

      <p className="font-mono text-[10px] text-bone-mute">
        For {sessionLabel}
      </p>
    </Card>
  );
}
