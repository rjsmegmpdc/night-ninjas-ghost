'use client';

import { useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportData } from '@/lib/actions/settings-admin';

/**
 * Export data button — calls exportData() server action which writes a
 * timestamped JSON dump under <dataDir>/exports/. On success, shows the
 * path and offers a "Reveal in Explorer" follow-up.
 */
export function ExportDataButton() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'done'; path: string; sizeKb: number }
    | { kind: 'error'; msg: string }
  >({ kind: 'idle' });

  const trigger = async () => {
    setState({ kind: 'pending' });
    try {
      const result = await exportData();
      setState({ kind: 'done', path: result.path, sizeKb: result.sizeKb });
    } catch (err) {
      setState({
        kind: 'error',
        msg: err instanceof Error ? err.message : 'Export failed',
      });
    }
  };

  const reveal = async () => {
    if (state.kind !== 'done') return;
    // Use the same reveal-log endpoint pattern by passing the path —
    // but reveal-log is hardcoded to the log file. For now, just copy
    // to clipboard. (Future: generic /api/files/reveal endpoint.)
    try {
      await navigator.clipboard.writeText(state.path);
    } catch {
      /* ignore */
    }
  };

  if (state.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={trigger}
        className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-bone-dim hover:text-bone transition-colors border border-bone-dim hover:border-bone px-4 py-2"
      >
        <Download size={14} strokeWidth={1.5} />
        Export data
      </button>
    );
  }

  if (state.kind === 'pending') {
    return (
      <span className="font-mono text-sm text-bone-dim">
        ↳ exporting…
      </span>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <span className="font-mono text-sm text-accent">
          export failed: {state.msg}
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // Done
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-mono text-sm text-signal-ok">
        <CheckCircle2 size={14} strokeWidth={1.5} />
        exported {state.sizeKb} KB
      </div>
      <div className="font-mono text-xs text-bone-dim break-all leading-relaxed">
        {state.path}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reveal}
          className="font-display tracking-wide-display uppercase text-xs px-2 py-1 border border-bone-dim text-bone-dim hover:bg-bone hover:text-ink hover:border-bone transition-colors"
        >
          Copy path
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
