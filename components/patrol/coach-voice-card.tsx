import { MessageSquare } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import type { CoachMessage } from '@/lib/coach/coach-voice-pure';

const TRIGGER_LABEL: Record<string, string> = {
  'block-start': 'block start',
  'mid-block': 'mid-block',
  'taper-start': 'taper',
  'block-end': 'final stretch',
};

const TRIGGER_ACCENT: Record<string, string> = {
  'taper-start': 'border-accent/60 bg-accent/5',
  'block-end': 'border-accent/40 bg-accent/5',
};

interface Props {
  messages: CoachMessage[];
}

export function CoachVoiceCard({ messages }: Props) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <Card
          key={msg.trigger}
          className={`space-y-3 ${TRIGGER_ACCENT[msg.trigger] ?? 'border-bone-mute/30'}`}
        >
          <div className="flex items-center justify-between">
            <CardLabel className="flex items-center gap-1.5">
              <MessageSquare size={12} strokeWidth={1.5} className="text-bone-mute" />
              coach · {TRIGGER_LABEL[msg.trigger] ?? msg.trigger}
            </CardLabel>
          </div>
          <div className="font-display tracking-wide-display text-xl uppercase leading-snug">
            {msg.headline}
          </div>
          <div className="font-mono text-sm text-bone-dim leading-relaxed">
            {msg.body}
          </div>
        </Card>
      ))}
    </div>
  );
}
