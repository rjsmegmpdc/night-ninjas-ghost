'use client';

import { useState } from 'react';
import { runFuelingBriefing } from '@/lib/actions/ai';
import Link from 'next/link';

/**
 * Phase 13 - AI-powered fueling personalisation button on the race page.
 * On-demand only; no background calls. Shows data-sent disclosure.
 */
export function FuelingAiButton({
  hasKey,
  modelLabel,
}: {
  hasKey: boolean;
  modelLabel: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [text, setText] = useState<string | null>(null);
  const [dataSent, setDataSent] = useState<string | null>(null);
  const [tokens, setTokens] = useState<{ in: number; out: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGenerate() {
    setState('loading');
    const r = await runFuelingBriefing();
    if (!r.ok) {
      setErrorMsg(r.error ?? 'Unknown error');
      setDataSent(r.dataSent ?? null);
      setState('error');
      return;
    }
    setText(r.text ?? null);
    setDataSent(r.dataSent ?? null);
    if (r.actualInputTokens != null && r.actualOutputTokens != null) {
      setTokens({ in: r.actualInputTokens, out: r.actualOutputTokens });
    }
    setState('done');
  }

  if (!hasKey) {
    return (
      <div className="border border-ink-line rounded-xl p-5 space-y-2">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">personalise this plan</div>
        <p className="font-mono text-xs text-bone-dim">
          Add your Anthropic API key in{' '}
          <Link href="/settings#ai" className="text-accent hover:underline">Settings → AI</Link>{' '}
          to get personalised fueling advice for this race.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-ink-line rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">personalise this plan</div>
        {tokens && (
          <span className="font-mono text-[10px] text-bone-mute">
            {tokens.in + tokens.out} tokens · {modelLabel}
          </span>
        )}
      </div>

      {state === 'idle' && (
        <button
          onClick={handleGenerate}
          className="font-display tracking-wide-display uppercase text-xs border border-ink-line hover:border-accent text-bone-dim hover:text-accent px-4 py-2 transition-colors"
        >
          Generate personalised advice
        </button>
      )}

      {state === 'loading' && (
        <p className="font-mono text-xs text-bone-dim animate-pulse">Generating…</p>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="font-mono text-xs text-signal-miss">{errorMsg}</p>
          <button
            onClick={() => setState('idle')}
            className="font-mono text-[10px] text-bone-mute hover:text-bone underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'done' && text && (
        <div className="space-y-4">
          <p className="font-mono text-sm text-bone leading-relaxed">{text}</p>
          <details className="group">
            <summary className="font-mono text-[10px] text-bone-mute cursor-pointer hover:text-bone select-none list-none flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              what data was sent
            </summary>
            <pre className="mt-3 font-mono text-[10px] text-bone-mute whitespace-pre-wrap bg-ink-shadow border border-ink-line rounded-lg p-3 leading-relaxed">
              {dataSent}
            </pre>
          </details>
          <button
            onClick={() => { setState('idle'); setText(null); setDataSent(null); setTokens(null); }}
            className="font-mono text-[10px] text-bone-mute hover:text-bone underline"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
