'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { retireShoe, dismissNudge } from '@/lib/actions/shoes';
import { buildSearchUrl, type Retailer } from '@/lib/shoes/retailer-types';
import type { ShoeWithStats } from '@/lib/shoes/queries';

/**
 * ShoeNudge — the 80% retirement banner that appears inside ShoeCard
 * when a shoe is over threshold.
 *
 * Three actions:
 *   - Retire shoe       → flips status, dismisses nudge permanently
 *   - Find replacements → expands retailer-search section (favourites only)
 *   - × Dismiss         → silences nudge, status stays active
 */
export function ShoeNudge({
  shoe,
  retailers,
}: {
  shoe: ShoeWithStats;
  retailers: Retailer[];
}) {
  const [showRetailers, setShowRetailers] = useState(false);

  return (
    <div className="border border-accent/60 bg-accent/5 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          strokeWidth={1.5}
          className="text-accent flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 text-sm">
          <span className="font-display tracking-wide-display uppercase text-accent">
            At {shoe.pctUsed.toFixed(0)}% — time to look at replacements
          </span>
          <div className="font-mono text-xs text-bone-dim mt-1 leading-relaxed">
            {shoe.totalKm.toFixed(0)} km of {shoe.effectiveTargetKm.toFixed(0)} km recommended life.
          </div>
        </div>
        <form action={dismissNudge}>
          <input type="hidden" name="id" value={shoe.id} />
          <button
            type="submit"
            className="text-bone-mute hover:text-bone transition-colors p-1"
            title="Dismiss — keep using"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={retireShoe}>
          <input type="hidden" name="id" value={shoe.id} />
          <button
            type="submit"
            className="font-display tracking-wide-display uppercase text-[10px] px-2 py-1 border border-accent text-accent hover:bg-accent hover:text-bone transition-colors"
          >
            Retire shoe
          </button>
        </form>

        {shoe.isFavourite && (
          <button
            type="button"
            onClick={() => setShowRetailers(!showRetailers)}
            className="font-display tracking-wide-display uppercase text-[10px] px-2 py-1 border border-bone-dim text-bone-dim hover:bg-bone hover:text-ink hover:border-bone transition-colors"
          >
            {showRetailers ? 'Hide retailers' : 'Find replacements'}
          </button>
        )}

        {!shoe.isFavourite && (
          <span className="font-mono text-[10px] text-bone-mute italic">
            ★ favourite this shoe to enable retailer search
          </span>
        )}
      </div>

      {showRetailers && shoe.isFavourite && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-accent/30">
          {retailers.map((r) => (
            <a
              key={r.name}
              href={buildSearchUrl(r, shoe.brand, shoe.model)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-bone-dim hover:text-accent transition-colors px-2 py-1 truncate"
            >
              → {r.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
