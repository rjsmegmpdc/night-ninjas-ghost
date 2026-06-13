'use client';

import { X } from 'lucide-react';
import type { SessionType, PaceZones } from '@/lib/plans/types';
import { useMatrixFilter } from './matrix-filter-shell';
import { swatchClassFor } from './matrix-cells';

/**
 * MatrixLegend — clickable filter swatches + interval-pace cheat-sheet.
 *
 * Each swatch toggles a session type into/out of the active filter set.
 * When any filter is active, non-matching cells in the matrix dim out
 * via CSS (the dimming logic lives in globals.css, driven by data
 * attributes set on the MatrixFilterShell wrapper).
 *
 * Sticky on tall screens so it stays in view as the matrix expands.
 */

interface SwatchSpec {
  type: SessionType;
  label: string;
}

const SWATCHES: SwatchSpec[] = [
  { type: 'interval', label: 'Track' },
  { type: 'tempo', label: 'Tempo' },
  { type: 'long', label: 'Long' },
  { type: 'easy', label: 'Easy' },
  { type: 'strength', label: 'Strength / X' },
  { type: 'rest', label: 'Rest' },
];

export function MatrixLegend({ paceZones }: { paceZones?: PaceZones }) {
  const { active, toggle, clear } = useMatrixFilter();
  const hasFilter = active.size > 0;

  return (
    <div className="space-y-4 sticky top-4">
      {/* Filter header */}
      <div className="flex items-baseline justify-between">
        <span className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
          {hasFilter ? `filter · ${active.size}` : 'session type'}
        </span>
        {hasFilter && (
          <button
            type="button"
            onClick={clear}
            className="font-display tracking-wide-display uppercase text-[10px] text-accent hover:underline flex items-center gap-1"
          >
            <X size={10} strokeWidth={1.5} />
            Reset
          </button>
        )}
      </div>

      {/* Swatches as filter buttons */}
      <div className="space-y-1">
        {SWATCHES.map((s) => {
          const isActive = active.has(s.type);
          return (
            <button
              key={s.type}
              type="button"
              onClick={() => toggle(s.type)}
              className={
                'w-full flex items-center gap-2 px-2 py-1 transition-colors ' +
                (isActive
                  ? 'bg-accent/10 border-l-2 border-accent'
                  : 'border-l-2 border-transparent hover:bg-ink-shadow/50')
              }
              title={isActive ? `Remove ${s.label} filter` : `Show only ${s.label}`}
              aria-pressed={isActive}
            >
              <div className={'w-5 h-3 ' + swatchClassFor(s.type)} />
              <span
                className={
                  'font-mono text-[11px] ' +
                  (isActive ? 'text-bone' : 'text-bone-dim')
                }
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="font-mono text-[9px] text-bone-mute leading-relaxed">
        ↳ click swatch to filter · click again to clear
      </div>

      {/* Calendar event glyph reference */}
      <div className="space-y-1 pt-2 border-t border-ink-line">
        <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
          cell events (top-right)
        </div>
        <div className="font-mono text-[11px] space-y-0.5">
          <div className="flex items-center gap-2"><span className="font-semibold text-accent w-3 text-center">H</span><span className="text-bone-dim">Holiday</span></div>
          <div className="flex items-center gap-2"><span className="font-semibold text-signal-warn w-3 text-center">W</span><span className="text-bone-dim">Work trip</span></div>
          <div className="flex items-center gap-2"><span className="font-semibold text-signal-miss w-3 text-center">S</span><span className="text-bone-dim">Sickness</span></div>
          <div className="flex items-center gap-2"><span className="font-semibold text-bone-mute w-3 text-center">E</span><span className="text-bone-dim">Other event</span></div>
        </div>
        <div className="font-mono text-[9px] text-bone-mute pt-1">
          ↳ hover a glyph for full event details
        </div>
      </div>

      {/* Interval pace cheat-sheet */}
      {paceZones && paceZones.interval.minSpk > 0 && (
        <div className="space-y-1 pt-2 border-t border-ink-line">
          <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
            interval paces
          </div>
          <div className="font-mono text-[11px] text-bone-dim space-y-0.5 tabular-nums">
            <div className="flex justify-between"><span>400m</span><span>{paceForRep(paceZones, 0.4)}</span></div>
            <div className="flex justify-between"><span>600m</span><span>{paceForRep(paceZones, 0.6)}</span></div>
            <div className="flex justify-between"><span>800m</span><span>{paceForRep(paceZones, 0.8)}</span></div>
            <div className="flex justify-between"><span>1000m</span><span>{paceForRep(paceZones, 1.0)}</span></div>
            <div className="flex justify-between"><span>1200m</span><span>{paceForRep(paceZones, 1.2)}</span></div>
            <div className="flex justify-between"><span>1600m</span><span>{paceForRep(paceZones, 1.6)}</span></div>
          </div>
          <div className="font-mono text-[9px] text-bone-mute pt-1">
            ↳ rep target = distance × interval pace
          </div>
        </div>
      )}
    </div>
  );
}

function paceForRep(zones: PaceZones, distanceKm: number): string {
  const totalSec = zones.interval.minSpk * distanceKm;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
