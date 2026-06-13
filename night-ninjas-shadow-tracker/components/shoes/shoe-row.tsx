'use client';

import { useState } from 'react';
import { Star, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { retireShoe, unretireShoe, toggleFavourite } from '@/lib/actions/shoes';
import { buildSearchUrl, type Retailer } from '@/lib/shoes/retailer-types';
import type { ShoeWithStats } from '@/lib/shoes/queries';

/**
 * ShoeRow — single row in the shoe table.
 *
 * Default: tight row with name, mileage, % used (with bar), projected
 * expiry, action menu trigger.
 * Click row body → expands inline showing photo placeholder, best races,
 * retailer search.
 * Click action menu → favourite toggle + retire (or unretire) actions.
 *
 * Retire is the only destructive action. No delete (matches Strava's
 * model — once activities are tagged to a shoe, retire preserves the
 * history).
 */

interface Props {
  shoe: ShoeWithStats;
  retailers?: Retailer[];
}

export function ShoeRow({ shoe }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const pct = Math.min(120, Math.max(0, shoe.pctUsed));
  const isOverdue = shoe.pctUsed >= 100;
  const isNudgeable = shoe.pctUsed >= 80;

  return (
    <div>
      {/* Main row */}
      <div
        className={
          'grid grid-cols-[1fr_140px_120px_110px_70px] gap-3 px-4 py-3 items-center transition-colors ' +
          (isOverdue ? 'bg-accent/10 ' : isNudgeable ? 'bg-signal-warn/5 ' : '') +
          'hover:bg-ink-shadow/50'
        }
      >
        {/* Shoe name + first-run date */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-left flex items-start gap-2 min-w-0"
        >
          {expanded ? (
            <ChevronDown size={12} strokeWidth={1.5} className="text-bone-mute mt-1 flex-shrink-0" />
          ) : (
            <ChevronRight size={12} strokeWidth={1.5} className="text-bone-mute mt-1 flex-shrink-0" />
          )}
          {shoe.isFavourite && (
            <Star size={12} strokeWidth={1.5} className="text-accent fill-accent mt-1 flex-shrink-0" />
          )}
          <div className="min-w-0 space-y-0.5">
            <div className="text-bone truncate">{shoe.name}</div>
            <div className="font-mono text-[10px] text-bone-mute">
              {shoe.firstUsedDate
                ? `First run: ${shoe.firstUsedDate}`
                : shoe.manualEntry
                ? 'No runs yet'
                : 'Strava-tracked'}
              {shoe.sessionCount > 0 && (
                <>
                  <span className="mx-1.5">·</span>
                  <span>{shoe.sessionCount} runs</span>
                </>
              )}
            </div>
          </div>
        </button>

        {/* Mileage */}
        <div className="text-right font-mono text-sm tabular-nums">
          <span className={isOverdue ? 'text-accent' : 'text-bone'}>
            {shoe.totalKm.toFixed(0)}
          </span>
          <span className="text-bone-mute"> / {shoe.effectiveTargetKm.toFixed(0)}</span>
        </div>

        {/* % Used + bar */}
        <div className="space-y-1">
          <div
            className={
              'font-mono text-sm tabular-nums ' +
              (isOverdue ? 'text-accent' : isNudgeable ? 'text-signal-warn' : 'text-bone-dim')
            }
          >
            {shoe.pctUsed.toFixed(0)}%
          </div>
          <div className="h-1 bg-ink-line">
            <div
              className={
                'h-full ' +
                (isOverdue ? 'bg-accent' : isNudgeable ? 'bg-signal-warn' : 'bg-bone-mute/40')
              }
              style={{ width: Math.min(100, pct) + '%' }}
            />
          </div>
        </div>

        {/* Projected expiry */}
        <div className="font-mono text-xs text-bone-dim tabular-nums">
          {shoe.projectedExpiry === 'overdue' ? (
            <span className="text-accent uppercase tracking-widest text-[10px]">overdue</span>
          ) : shoe.projectedExpiry ? (
            <span title={`Projected from recent km/week pace: ${shoe.recentKmPerWeek?.toFixed(1)} km/wk`}>
              ~{formatMonth(shoe.projectedExpiry)}
            </span>
          ) : (
            <span className="text-bone-mute">—</span>
          )}
        </div>

        {/* Action menu */}
        <div className="text-right relative">
          {confirmRetire ? (
            <form
              action={shoe.status === 'retired' ? unretireShoe : retireShoe}
              className="inline-flex items-center gap-1.5"
            >
              <input type="hidden" name="id" value={shoe.id} />
              <button
                type="submit"
                className="font-display tracking-wide-display uppercase text-[10px] text-accent hover:underline"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmRetire(false)}
                className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone"
              >
                No
              </button>
            </form>
          ) : showActions ? (
            <ActionsMenu
              shoe={shoe}
              onClose={() => setShowActions(false)}
              onRetireClick={() => {
                setShowActions(false);
                setConfirmRetire(true);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowActions(true)}
              className="text-bone-mute hover:text-bone transition-colors px-2 py-1"
              title="Actions"
              aria-label="Actions menu"
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && <RowExpand shoe={shoe} />}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Actions menu — favourite toggle + retire/unretire
 * -------------------------------------------------------------------------- */

function ActionsMenu({
  shoe,
  onClose,
  onRetireClick,
}: {
  shoe: ShoeWithStats;
  onClose: () => void;
  onRetireClick: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <form action={toggleFavourite}>
        <input type="hidden" name="id" value={shoe.id} />
        <button
          type="submit"
          onClick={onClose}
          className="text-bone-mute hover:text-accent transition-colors px-1"
          title={shoe.isFavourite ? 'Unfavourite' : 'Favourite'}
        >
          <Star
            size={12}
            strokeWidth={1.5}
            className={shoe.isFavourite ? 'text-accent fill-accent' : ''}
          />
        </button>
      </form>
      <button
        type="button"
        onClick={onRetireClick}
        className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-accent transition-colors"
      >
        {shoe.status === 'retired' ? 'Unretire' : 'Retire'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-bone-mute hover:text-bone px-1"
        title="Close menu"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Row expand — best races, retailer search, photo placeholder.
 *
 * Lifted from the old ShoeCard but compressed into a 3-column layout.
 * -------------------------------------------------------------------------- */

function RowExpand({ shoe }: { shoe: ShoeWithStats }) {
  return (
    <div className="px-4 py-4 bg-ink-shadow/30 border-t border-ink-line/40 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Best races */}
      <div className="space-y-2">
        <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
          Best races in these
        </div>
        {shoe.bestRaces.length > 0 ? (
          <div className="space-y-1">
            {shoe.bestRaces.map((r) => (
              <div
                key={r.distanceKm + r.date}
                className="flex items-center justify-between gap-2 py-1 text-xs"
              >
                <span className="font-mono text-bone-dim tabular-nums">
                  {labelForDistance(r.distanceKm)}
                </span>
                <span className="font-mono text-bone tabular-nums">
                  {formatTime(r.timeS)}
                </span>
                <span className="font-mono text-[10px] text-bone-mute tabular-nums">
                  {r.date}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-[11px] text-bone-mute">
            ↳ no races logged for this shoe yet
          </div>
        )}
      </div>

      {/* Buy a replacement (search retailers) */}
      <div className="space-y-2">
        <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
          Find a replacement
        </div>
        <RetailerSearchLinks brand={shoe.brand} model={shoe.model} />
      </div>

      {/* Notes / details */}
      <div className="space-y-2">
        <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
          Details
        </div>
        <dl className="font-mono text-[11px] space-y-1">
          {shoe.brand && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Brand</dt>
              <dd className="text-bone-dim">{shoe.brand}</dd>
            </div>
          )}
          {shoe.model && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Model</dt>
              <dd className="text-bone-dim text-right truncate">{shoe.model}</dd>
            </div>
          )}
          {shoe.category && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Category</dt>
              <dd className="text-bone-dim">{shoe.category}</dd>
            </div>
          )}
          {shoe.recentKmPerWeek !== null && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Recent pace</dt>
              <dd className="text-bone-dim tabular-nums">
                {shoe.recentKmPerWeek.toFixed(1)} km/wk
              </dd>
            </div>
          )}
          {shoe.lastUsedDate && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Last run</dt>
              <dd className="text-bone-dim tabular-nums">{shoe.lastUsedDate}</dd>
            </div>
          )}
          {shoe.purchaseDate && (
            <div className="flex justify-between gap-2">
              <dt className="text-bone-mute">Purchased</dt>
              <dd className="text-bone-dim tabular-nums">{shoe.purchaseDate}</dd>
            </div>
          )}
        </dl>
        {shoe.notes && (
          <div className="font-mono text-[11px] text-bone-dim pt-2 border-t border-ink-line/40">
            {shoe.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function RetailerSearchLinks({
  brand,
  model,
}: {
  brand: string | null;
  model: string | null;
}) {
  // Hardcoded NZ-default retailers since the CSV loader is server-only
  // and we'd rather not pass the full list as props. The user's defaults
  // come from data/shoe-retailers.csv on the server.
  const retailers: Retailer[] = [
    { name: 'Allsports', urlTemplate: 'https://www.allsports.co.nz/search?q={query}', region: 'NZ' },
    { name: 'Shoe Clinic', urlTemplate: 'https://www.shoeclinic.co.nz/search?q={query}', region: 'NZ' },
    { name: 'Running Warehouse AU', urlTemplate: 'https://www.runningwarehouse.com.au/catalogsearch/result/?q={query}', region: 'AU' },
    { name: 'Tempo Fit', urlTemplate: 'https://www.tempofit.com.au/search?q={query}', region: 'AU' },
  ];

  if (!brand && !model) {
    return (
      <div className="font-mono text-[11px] text-bone-mute">
        ↳ no brand/model recorded — can't search
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {retailers.map((r) => (
        <a
          key={r.name}
          href={buildSearchUrl(r, brand, model)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 py-1 text-xs hover:text-accent transition-colors"
        >
          <span className="text-bone-dim">{r.name}</span>
          <span className="font-mono text-[10px] text-bone-mute">{r.region}</span>
          <ExternalLink size={10} strokeWidth={1.5} className="text-bone-mute" />
        </a>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

function labelForDistance(km: number): string {
  if (Math.abs(km - 5) < 0.1) return '5K';
  if (Math.abs(km - 10) < 0.2) return '10K';
  if (Math.abs(km - 21.0975) < 0.3) return 'HM';
  if (Math.abs(km - 42.195) < 0.5) return 'M';
  return `${km.toFixed(1)}K`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  const s = Math.round(seconds - h * 3600 - m * 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} '${(d.getFullYear() % 100).toString().padStart(2, '0')}`;
}
