import { useState, useEffect, useRef } from 'react';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShoeRow {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  target_km: number;
  retired: number;
  notes: string | null;
  strava_gear_id: string | null;
  created_at: string | null;
  total_km: number;
  session_count: number;
  last_used: string | null;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const SHOES_SQL = `
  SELECT
    s.id, s.name, s.brand, s.model, s.category,
    s.target_km, s.retired, s.notes,
    s.strava_gear_id, s.created_at,
    COALESCE(SUM(a.distance)/1000.0, 0) AS total_km,
    COUNT(a.id)                         AS session_count,
    MAX(a.start_date)                   AS last_used
  FROM shoes s
  LEFT JOIN activities a
    ON a.gear_id = s.strava_gear_id
   AND s.strava_gear_id IS NOT NULL
  GROUP BY s.id
  ORDER BY s.retired ASC, total_km DESC
`;

function rowToShoe(r: unknown[]): ShoeRow {
  return {
    id:             r[0] as number,
    name:           r[1] as string,
    brand:          r[2] as string | null,
    model:          r[3] as string | null,
    category:       r[4] as string | null,
    target_km:      r[5] as number,
    retired:        r[6] as number,
    notes:          r[7] as string | null,
    strava_gear_id: r[8] as string | null,
    created_at:     r[9] as string | null,
    total_km:       r[10] as number,
    session_count:  r[11] as number,
    last_used:      r[12] as string | null,
  };
}

async function loadShoes(): Promise<ShoeRow[]> {
  const rows = await query(SHOES_SQL);
  return rows.map(rowToShoe);
}

async function addShoe(name: string, target_km: number): Promise<void> {
  await exec('INSERT INTO shoes (name, target_km) VALUES (?, ?)', [name, target_km]);
}

async function retireShoe(id: number): Promise<void> {
  await exec('UPDATE shoes SET retired = 1 WHERE id = ?', [id]);
}

async function unretireShoe(id: number): Promise<void> {
  await exec('UPDATE shoes SET retired = 0 WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtKm(km: number): string {
  return km.toFixed(1);
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  const s = iso.includes('T') ? iso : iso + 'T12:00:00';
  return new Date(s).toLocaleDateString('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function progressColor(pct: number): string {
  if (pct >= 90) return 'bg-signal-miss';
  if (pct >= 70) return 'bg-signal-warn';
  return 'bg-signal-ok';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ total_km, target_km }: { total_km: number; target_km: number }) {
  const pct = target_km > 0 ? (total_km / target_km) * 100 : 0;
  const displayPct = Math.min(pct, 100);
  const color = progressColor(pct);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${fmtKm(total_km)} of ${fmtKm(target_km)} km used`}
      className="relative h-1.5 bg-ink-line rounded-full overflow-hidden"
    >
      <div
        className={`absolute inset-y-0 left-0 ${color} transition-all duration-300`}
        style={{ width: `${displayPct}%` }}
      />
    </div>
  );
}

function RetireButton({ shoeId, onDone }: { shoeId: number; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleRetire() {
    setBusy(true);
    try {
      await retireShoe(shoeId);
      onDone();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-xs text-signal-warn">Retire?</span>
        <button
          onClick={() => void handleRetire()}
          disabled={busy}
          className="font-mono text-xs text-signal-miss hover:underline disabled:opacity-50"
        >
          {busy ? 'Retiring…' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="font-mono text-xs text-bone-mute hover:text-bone"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="font-mono text-xs text-bone-mute hover:text-signal-warn transition-colors uppercase tracking-widest"
    >
      Retire
    </button>
  );
}

function UnretireButton({ shoeId, onDone }: { shoeId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleUnretire() {
    setBusy(true);
    try {
      await unretireShoe(shoeId);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void handleUnretire()}
      disabled={busy}
      className="font-mono text-xs text-bone-mute hover:text-accent transition-colors uppercase tracking-widest disabled:opacity-50"
    >
      {busy ? 'Unretiring…' : 'Unretire'}
    </button>
  );
}

function ShoeCard({
  shoe,
  onRefresh,
  showRetireAction,
  showUnretireAction,
}: {
  shoe: ShoeRow;
  onRefresh: () => void;
  showRetireAction: boolean;
  showUnretireAction: boolean;
}) {
  const target = shoe.target_km > 0 ? shoe.target_km : 800;
  const pct = (shoe.total_km / target) * 100;
  const km_remaining = target - shoe.total_km;
  const subtitle = [shoe.brand, shoe.model].filter(Boolean).join(' ');

  return (
    <div className="border border-ink-line p-4 space-y-3">
      {/* Name row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-bone text-sm font-mono font-semibold truncate">{shoe.name}</p>
          {subtitle && (
            <p className="font-mono text-xs text-bone-dim mt-0.5 truncate">{subtitle}</p>
          )}
          {shoe.category && (
            <p className="font-mono text-xs text-bone-mute mt-0.5 uppercase tracking-widest">
              {shoe.category}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-3">
          {showRetireAction && <RetireButton shoeId={shoe.id} onDone={onRefresh} />}
          {showUnretireAction && <UnretireButton shoeId={shoe.id} onDone={onRefresh} />}
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <ProgressBar total_km={shoe.total_km} target_km={target} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-bone-dim">
            {fmtKm(shoe.total_km)} km of {fmtKm(target)} km target
          </span>
          {km_remaining > 0 ? (
            <span className="font-mono text-xs text-bone-mute">
              {fmtKm(km_remaining)} km left
            </span>
          ) : (
            <span className="font-mono text-xs text-signal-miss uppercase tracking-widest">
              Target exceeded
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 pt-1 border-t border-ink-line">
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Sessions</p>
          <p className="font-mono text-sm text-bone tabular-nums">{shoe.session_count}</p>
        </div>
        <div>
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Last used</p>
          <p className="font-mono text-sm text-bone">{fmtDate(shoe.last_used)}</p>
        </div>
        {pct >= 70 && (
          <div className="ml-auto">
            <span
              className={`font-mono text-xs uppercase tracking-widest ${
                pct >= 90 ? 'text-signal-miss' : 'text-signal-warn'
              }`}
            >
              {pct >= 90 ? 'Replace soon' : 'Getting worn'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add shoe form
// ---------------------------------------------------------------------------

function AddShoeForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [targetKm, setTargetKm] = useState<number>(800);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      nameRef.current?.focus();
      return;
    }
    if (!Number.isFinite(targetKm) || targetKm <= 0) {
      setError('Target km must be a positive number');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await addShoe(trimmed, targetKm);
      setName('');
      setTargetKm(800);
      onAdded();
      nameRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleAdd(e)}
      aria-label="Add a shoe"
      className="border border-ink-line p-4 space-y-3"
    >
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        Add shoe
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px] space-y-1">
          <label htmlFor="shoe-name" className="font-mono text-xs text-bone-dim uppercase tracking-widest">
            Name
          </label>
          <input
            id="shoe-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nike Alphafly 3"
            disabled={busy}
            className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-sm px-3 py-2 placeholder:text-bone-mute focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>

        <div className="w-36 space-y-1">
          <label htmlFor="shoe-target" className="font-mono text-xs text-bone-dim uppercase tracking-widest">
            Target km
          </label>
          <input
            id="shoe-target"
            type="number"
            min={1}
            step={50}
            value={targetKm}
            onChange={(e) => setTargetKm(Number(e.target.value))}
            disabled={busy}
            className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 border border-accent text-accent hover:bg-accent hover:text-ink font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && (
        <p role="alert" className="font-mono text-xs text-signal-miss">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NoShoesState() {
  return (
    <div className="border border-ink-line p-8 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        shoes · no data yet
      </p>
      <h2 className="font-display tracking-widest text-3xl uppercase text-bone">
        No shoes tracked
      </h2>
      <p className="font-mono text-sm text-bone-dim max-w-xl leading-relaxed">
        Strava-tracked shoes appear here automatically on next sync — they are linked via gear ID on
        your activities. You can also add manual shoes using the form above.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShoesPage() {
  const { ready, error: dbError } = useDb();
  const [shoes, setShoes] = useState<ShoeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    setLoadError(null);
    try {
      const rows = await loadShoes();
      setShoes(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load shoes');
    }
  }

  useEffect(() => {
    if (!ready) return;
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || shoes === null) return <PageSkeleton />;

  const activeShoes  = shoes.filter((s) => s.retired === 0);
  const retiredShoes = shoes.filter((s) => s.retired === 1);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-4xl mx-auto space-y-10">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          gear · footwear
        </p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">
          Shoes
        </h1>
      </header>

      {/* Add shoe form */}
      <AddShoeForm onAdded={() => void refresh()} />

      {/* Load error */}
      {loadError && (
        <p role="alert" className="font-mono text-xs text-signal-miss">
          {loadError}
        </p>
      )}

      {/* Empty state when no shoes at all */}
      {shoes.length === 0 && <NoShoesState />}

      {/* Active shoes */}
      {activeShoes.length > 0 && (
        <section aria-label="Active shoes">
          <h2 className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-4">
            Active — {activeShoes.length} {activeShoes.length === 1 ? 'pair' : 'pairs'}
          </h2>
          <div className="space-y-3">
            {activeShoes.map((shoe) => (
              <ShoeCard
                key={shoe.id}
                shoe={shoe}
                onRefresh={() => void refresh()}
                showRetireAction
                showUnretireAction={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* Retired shoes — collapsible */}
      {retiredShoes.length > 0 && (
        <section aria-label="Retired shoes">
          <details>
            <summary className="cursor-pointer font-mono text-xs text-bone-mute uppercase tracking-widest mb-4 select-none hover:text-bone transition-colors">
              Retired — {retiredShoes.length} {retiredShoes.length === 1 ? 'pair' : 'pairs'}
            </summary>
            <div className="space-y-3 mt-4">
              {retiredShoes.map((shoe) => (
                <ShoeCard
                  key={shoe.id}
                  shoe={shoe}
                  onRefresh={() => void refresh()}
                  showRetireAction={false}
                  showUnretireAction
                />
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
