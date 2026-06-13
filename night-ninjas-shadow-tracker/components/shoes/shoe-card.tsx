import { Card } from '@/components/ui/card';
import {
  retireShoe,
  unretireShoe,
  dismissNudge,
  toggleFavourite,
  setUserTargetKm,
  deleteManualShoe,
  removeShoePhoto,
} from '@/lib/actions/shoes';
import { Star, Camera, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { listRetailers, buildSearchUrl } from '@/lib/shoes/retailers';
import { listPriceWatchesForShoe } from '@/lib/shoes/queries';
import { ShoeNudge } from './shoe-nudge';
import { EditTargetForm, PhotoUploadForm, PriceWatchForm } from './shoe-card-forms';
import type { ShoeWithStats } from '@/lib/shoes/queries';

/**
 * ShoeCard — one shoe rendered as a card with all its stats, controls,
 * and (when relevant) the retirement nudge banner inside.
 *
 * Server component — forms inside use server actions. Interactive bits
 * (toggles, expanding sections) are kept inside child client components.
 */
export async function ShoeCard({ shoe }: { shoe: ShoeWithStats }) {
  const retailers = listRetailers();
  const priceWatches = shoe.isFavourite
    ? await listPriceWatchesForShoe(shoe.id)
    : [];

  const pctClamped = Math.min(100, Math.max(0, shoe.pctUsed));
  const isRetired = shoe.status === 'retired';

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display tracking-wide-display text-lg uppercase truncate">
              {shoe.name}
            </span>
            {shoe.isFavourite && (
              <Star size={14} strokeWidth={1.5} className="text-accent fill-accent flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {shoe.category && (
              <span className="font-mono text-[10px] uppercase text-bone-mute tracking-widest">
                {shoe.category}
              </span>
            )}
            {shoe.carbonPlate && (
              <span className="font-mono text-[10px] uppercase text-accent tracking-widest">
                · carbon
              </span>
            )}
            {shoe.manualEntry && (
              <span className="font-mono text-[10px] uppercase text-bone-mute tracking-widest border border-bone-mute/40 px-1">
                manual
              </span>
            )}
            {isRetired && (
              <span className="font-mono text-[10px] uppercase text-bone-mute tracking-widest border border-bone-mute/40 px-1">
                retired
              </span>
            )}
          </div>
        </div>

        <form action={toggleFavourite}>
          <input type="hidden" name="id" value={shoe.id} />
          <button
            type="submit"
            className="text-bone-mute hover:text-accent transition-colors p-1"
            title={shoe.isFavourite ? 'Unfavourite' : 'Favourite'}
          >
            <Star
              size={16}
              strokeWidth={1.5}
              className={shoe.isFavourite ? 'fill-accent text-accent' : ''}
            />
          </button>
        </form>
      </div>

      {/* Photo */}
      {shoe.photoFilename && (
        <div className="relative">
          <img
            src={`/api/shoes/photo?file=${encodeURIComponent(shoe.photoFilename)}`}
            alt={shoe.name}
            className="w-full max-h-48 object-cover border border-ink-line"
          />
          <form action={removeShoePhoto} className="absolute top-2 right-2">
            <input type="hidden" name="id" value={shoe.id} />
            <button
              type="submit"
              className="bg-ink/80 hover:bg-accent/80 text-bone p-1.5 transition-colors"
              title="Remove photo"
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </form>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line">
        <Cell label="km used">
          <span className="text-bone tabular-nums">{shoe.totalKm.toFixed(0)}</span>
        </Cell>
        <Cell label="sessions">
          <span className="text-bone tabular-nums">{shoe.sessionCount}</span>
        </Cell>
        <Cell label="last used">
          <span className="text-bone-dim font-mono text-xs">
            {shoe.lastUsedDate ?? '—'}
          </span>
        </Cell>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-bone-dim">% of life used</span>
          <span className={pctClamped >= 80 ? 'text-accent' : 'text-bone'}>
            {pctClamped.toFixed(0)}% of {shoe.effectiveTargetKm.toFixed(0)} km
          </span>
        </div>
        <div className="h-1.5 bg-ink-line">
          <div
            className={
              'h-full ' +
              (pctClamped >= 100
                ? 'bg-accent'
                : pctClamped >= 80
                ? 'bg-signal-warn'
                : 'bg-bone')
            }
            style={{ width: `${pctClamped}%` }}
          />
        </div>
        {shoe.recommendedKm && shoe.userTargetKm && (
          <div className="font-mono text-[10px] text-bone-mute leading-relaxed">
            ↳ manufacturer suggests {shoe.recommendedKm.toFixed(0)} km · you've set {shoe.userTargetKm.toFixed(0)}
          </div>
        )}
      </div>

      {/* Nudge — only when active + over threshold + not dismissed */}
      {shoe.shouldNudge && <ShoeNudge shoe={shoe} retailers={retailers} />}

      {/* Best races */}
      {shoe.bestRaces.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-ink-line">
          <div className="nn-caps text-[10px]">best races in these</div>
          <div className="space-y-1">
            {shoe.bestRaces.map((race) => (
              <div
                key={race.distanceKm}
                className="flex items-center justify-between font-mono text-xs"
              >
                <span className="text-bone-dim">
                  {raceDistanceLabel(race.distanceKm)}
                </span>
                <span className="text-bone tabular-nums">
                  {formatTime(race.timeS)}
                </span>
                <span className="text-bone-mute text-[10px]">
                  {race.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Favourites: retailer search + price watches */}
      {shoe.isFavourite && (
        <div className="space-y-3 pt-3 border-t border-ink-line">
          <div className="nn-caps text-[10px] text-accent">★ favourite — find a fresh pair</div>
          <div className="grid grid-cols-2 gap-2">
            {retailers.map((r) => (
              <a
                key={r.name}
                href={buildSearchUrl(r, shoe.brand, shoe.model)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-bone-dim hover:text-accent transition-colors border border-ink-line hover:border-accent px-2 py-1 truncate"
                title={`Search ${r.name}`}
              >
                → {r.name}
              </a>
            ))}
          </div>

          {/* Price log */}
          {priceWatches.length > 0 && (
            <div className="space-y-1 pt-2">
              <div className="nn-caps text-[10px]">price log</div>
              <div className="space-y-1">
                {priceWatches.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between font-mono text-xs"
                  >
                    <span className="text-bone-dim truncate">{p.retailer}</span>
                    <span className="text-bone tabular-nums">
                      {p.currency} {p.price.toFixed(2)}
                    </span>
                    <span className="text-bone-mute text-[10px]">
                      {p.observedAt instanceof Date
                        ? p.observedAt.toISOString().slice(0, 10)
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Log a new price */}
          <PriceWatchForm shoeId={shoe.id} retailers={retailers.map((r) => r.name)} />
        </div>
      )}

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ink-line">
        <EditTargetForm shoeId={shoe.id} currentTarget={shoe.userTargetKm} />
        {!shoe.photoFilename && <PhotoUploadForm shoeId={shoe.id} />}

        {!isRetired && (
          <form action={retireShoe} className="ml-auto">
            <input type="hidden" name="id" value={shoe.id} />
            <button
              type="submit"
              className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-accent transition-colors"
            >
              Retire
            </button>
          </form>
        )}

        {isRetired && (
          <form action={unretireShoe} className="ml-auto">
            <input type="hidden" name="id" value={shoe.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1 font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
              title="Un-retire"
            >
              <RotateCcw size={10} strokeWidth={1.5} />
              Un-retire
            </button>
          </form>
        )}

        {shoe.manualEntry && (
          <form action={deleteManualShoe}>
            <input type="hidden" name="id" value={shoe.id} />
            <button
              type="submit"
              className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-accent transition-colors"
              title="Delete (manual shoes only)"
            >
              Delete
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink p-3">
      <div className="nn-caps text-[10px]">{label}</div>
      <div className="mt-1 font-mono text-base">{children}</div>
    </div>
  );
}

function raceDistanceLabel(km: number): string {
  if (Math.abs(km - 5) < 0.1) return '5K';
  if (Math.abs(km - 10) < 0.1) return '10K';
  if (Math.abs(km - 21.0975) < 0.1) return 'Half marathon';
  if (Math.abs(km - 42.195) < 0.1) return 'Marathon';
  return km.toFixed(1) + ' km';
}

function formatTime(timeS: number): string {
  const h = Math.floor(timeS / 3600);
  const m = Math.floor((timeS % 3600) / 60);
  const s = Math.floor(timeS % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
