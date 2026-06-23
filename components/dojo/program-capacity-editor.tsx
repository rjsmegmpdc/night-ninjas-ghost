'use client';

import { useRef, useState, useTransition } from 'react';
import { Gauge } from 'lucide-react';
import { setPlanCapacity, type SetCapacityResult } from '@/lib/actions/plan-capacity';

/**
 * Phase 14 — edit per-block volume and long-run caps.
 *
 * Shows the current effective caps with source labels (this block / global /
 * engine default). Saving writes to the active plan_periods row.
 * Clearing a field reverts that cap to the global settings / engine default.
 */
export function ProgramCapacityEditor({
  dojoName,
  dojoDefaultLongRunCap,
  /** Current weekly cap in km — null if not set for this block. */
  blockWeeklyCap,
  /** Current long-run cap in km — null if not set for this block. */
  blockLongRunCap,
  /** Source of the current effective weekly cap. */
  weeklyCapSource,
  /** Source of the current effective long-run cap. */
  longRunCapSource,
  /** Effective weekly cap — what the engine actually sees. */
  effectiveWeeklyCap,
  /** Effective long-run cap — what the engine actually sees. */
  effectiveLongRunCap,
}: {
  dojoName: string;
  dojoDefaultLongRunCap: number;
  blockWeeklyCap: number | null;
  blockLongRunCap: number | null;
  weeklyCapSource: 'block' | 'global' | 'engine-default';
  longRunCapSource: 'block' | 'global' | 'engine-default';
  effectiveWeeklyCap: number | undefined;
  effectiveLongRunCap: number | undefined;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SetCapacityResult | null>(null);

  const submit = () => {
    if (!formRef.current) return;
    setResult(null);
    const fd = new FormData(formRef.current);
    startTransition(async () => setResult(await setPlanCapacity(fd)));
  };

  const sourceLabel = (source: 'block' | 'global' | 'engine-default') =>
    source === 'block' ? 'this block'
    : source === 'global' ? 'global setting'
    : `${dojoName} default`;

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <Gauge size={16} strokeWidth={1.5} className="text-accent" />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          block capacity
        </div>
      </div>

      <p className="text-sm text-bone-dim leading-relaxed">
        Set volume targets for this {dojoName} block. These override your global
        settings for this block only — useful when you want a deliberately lighter
        cycle without changing your long-term defaults.
        Clear a field to fall back to the global setting or {dojoName}&apos;s own default.
      </p>

      {/* Current effective values */}
      <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line rounded-lg overflow-hidden">
        <div className="bg-ink p-4">
          <div className="font-display text-2xl text-bone tabular-nums leading-none">
            {effectiveWeeklyCap != null ? `${Math.round(effectiveWeeklyCap)} km` : '—'}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute mt-1">
            weekly target · {sourceLabel(weeklyCapSource)}
          </div>
        </div>
        <div className="bg-ink p-4">
          <div className="font-display text-2xl text-bone tabular-nums leading-none">
            {effectiveLongRunCap != null ? `${Math.round(effectiveLongRunCap)} km` : `${dojoDefaultLongRunCap} km`}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute mt-1">
            long run cap · {sourceLabel(longRunCapSource)}
          </div>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              weekly volume cap (km)
            </span>
            <input
              name="weekly_volume_cap_km"
              type="number"
              min={20}
              max={300}
              step={1}
              defaultValue={blockWeeklyCap ?? ''}
              placeholder={effectiveWeeklyCap != null ? `${Math.round(effectiveWeeklyCap)}` : 'engine default'}
              className="bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone w-36 focus:border-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1.5 block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
              long run cap (km)
            </span>
            <input
              name="long_run_cap_km"
              type="number"
              min={10}
              max={50}
              step={0.5}
              defaultValue={blockLongRunCap ?? ''}
              placeholder={effectiveLongRunCap != null ? `${effectiveLongRunCap}` : `${dojoDefaultLongRunCap} (default)`}
              className="bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone w-36 focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone hover:border-ink-line-bold disabled:opacity-50 font-display tracking-wide-display uppercase text-sm"
          >
            {isPending ? 'Saving...' : 'Save capacity'}
          </button>
          {result?.ok && (
            <span className="font-mono text-xs text-signal-ok">Saved.</span>
          )}
          {result && !result.ok && (
            <span className="font-mono text-xs text-signal-miss">{result.error}</span>
          )}
        </div>

        <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
          Clear both fields and save to reset to global settings / engine defaults.
          Changes take effect immediately on Patrol and the matrix.
        </p>
      </form>
    </div>
  );
}
