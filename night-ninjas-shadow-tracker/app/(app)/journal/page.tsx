import { Card, CardLabel } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export default function JournalPage() {
  return (
    <div className="px-12 py-10 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - wellness</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Wellness
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Sleep quality, work stress, energy, perceived effort. 10 seconds a
          day. Over time, the patterns explain why you broke down at 85km
          last time — and let you predict it next time.
        </div>
      </header>

      <Card className="space-y-4 max-w-2xl border-accent/40">
        <CardLabel className="text-accent flex items-center gap-2">
          <ClipboardList size={14} strokeWidth={1.5} />
          coming next
        </CardLabel>
        <p className="text-bone-dim text-sm leading-relaxed">
          Daily entry: four 1-10 sliders for sleep quality, work stress,
          morning energy, and perceived effort, plus an optional notes field.
          Takes ten seconds.
        </p>
        <p className="text-bone-dim text-sm leading-relaxed">
          The screen also shows a 90-day heatmap so you can spot trends —
          stretches of poor sleep before injury weeks, stress correlation
          with bad sessions, that kind of thing. The DB schema is already
          in place; the UI is the next build.
        </p>
        <div className="pt-3 border-t border-ink-line font-mono text-xs text-bone-mute">
          ↳ best paired with a real-world habit: log it before your morning coffee
        </div>
      </Card>
    </div>
  );
}
