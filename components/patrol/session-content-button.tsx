'use client';

import { useState, useTransition } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { runSessionContent, type SessionContentResult } from '@/lib/actions/ai';

interface Props {
  sessionType: 'cross' | 'strength';
  durationMin: number | null;
  hasKey: boolean;
}

export function SessionContentButton({ sessionType, durationMin, hasKey }: Props) {
  const [result, setResult] = useState<SessionContentResult | null>(null);
  const [pending, startTransition] = useTransition();

  const handleGenerate = () => {
    const fd = new FormData();
    fd.set('sessionType', sessionType);
    if (durationMin != null) fd.set('durationMin', String(durationMin));
    setResult(null);
    startTransition(async () => {
      setResult(await runSessionContent(fd));
    });
  };

  if (!hasKey) {
    return (
      <p className="font-mono text-[10px] text-bone-mute">
        <Link href="/settings#ai" className="text-bone-dim hover:text-accent transition-colors underline">
          Add AI key
        </Link>{' '}
        to generate session content
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <button
        onClick={handleGenerate}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink-line font-mono text-xs text-bone-dim hover:text-bone hover:border-bone-dim disabled:opacity-50 transition-colors"
      >
        <Sparkles size={12} strokeWidth={1.5} />
        {pending ? 'Generating…' : 'Generate session content'}
      </button>

      {result && !result.ok && (
        <p className="font-mono text-xs text-signal-miss">{result.error}</p>
      )}

      {result?.ok && result.text && (
        <div className="space-y-2">
          <div className="p-3 bg-ink-shadow border border-ink-line font-mono text-xs text-bone leading-relaxed whitespace-pre-wrap">
            {result.text}
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
              <pre className="mt-1 p-2 bg-ink-shadow border border-ink-line font-mono text-[10px] text-bone-mute overflow-x-auto whitespace-pre-wrap">
                {result.dataSent}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
