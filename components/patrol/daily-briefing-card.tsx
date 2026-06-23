'use client';

import { useState, useTransition } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { runDailyBriefing, type BriefingResult } from '@/lib/actions/ai';

interface Props {
  hasKey: boolean;
  modelLabel: string;
}

export function DailyBriefingCard({ hasKey, modelLabel }: Props) {
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const handleGenerate = () => {
    setResult(null);
    startTransition(async () => {
      setResult(await runDailyBriefing());
    });
  };

  return (
    <Card className="space-y-4">
      <CardLabel className="flex items-center gap-1.5">
        <Brain size={12} strokeWidth={1.5} className="text-bone-mute" />
        ai coach briefing
      </CardLabel>

      {!hasKey ? (
        <p className="font-mono text-xs text-bone-mute">
          Add an Anthropic API key in{' '}
          <Link href="/settings#ai" className="text-bone-dim hover:text-accent transition-colors underline">
            Settings → AI
          </Link>{' '}
          to enable AI briefings.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-ink font-display tracking-wide-display uppercase text-xs hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              <Brain size={12} strokeWidth={1.5} />
              {pending ? 'Generating…' : "Generate today's briefing"}
            </button>
            <span className="font-mono text-[10px] text-bone-mute">{modelLabel}</span>
          </div>

          {result && !result.ok && (
            <div className="p-3 font-mono text-xs bg-signal-miss/10 border border-signal-miss/40 text-signal-miss">
              {result.error}
            </div>
          )}

          {result?.ok && result.text && (
            <div className="space-y-3">
              <div className="font-mono text-sm text-bone leading-relaxed whitespace-pre-wrap">
                {result.text}
              </div>

              <div className="flex items-center gap-4 font-mono text-[10px] text-bone-mute">
                {result.actualInputTokens != null && (
                  <span>in {result.actualInputTokens} tok</span>
                )}
                {result.actualOutputTokens != null && (
                  <span>out {result.actualOutputTokens} tok</span>
                )}
              </div>

              {result.dataSent && (
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-bone transition-colors list-none">
                    <ChevronDown
                      size={10}
                      strokeWidth={1.5}
                      className="group-open:rotate-180 transition-transform"
                    />
                    What data was sent
                  </summary>
                  <pre className="mt-2 p-3 bg-ink-shadow border border-ink-line font-mono text-[10px] text-bone-mute overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {result.dataSent}
                  </pre>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
