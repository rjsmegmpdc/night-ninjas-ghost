import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Plus, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { query, exec } from '@/db/client';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { fetchAthleteGear } from '@/lib/strava/client';
import { getStoredTokens, storeTokens, setSetting, getSetting } from '@/lib/db/settings';
import { refreshAccessToken } from '@/lib/strava/client';

const WORKER_URL = (import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined) ?? '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShoeRow {
  id: number;
  strava_gear_id: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string | null;
  size: string | null;
  target_km: number;
  retired: number;
  notes: string | null;
  // computed
  total_km: number;
  session_count: number;
  last_used: string | null;
  avg_speed_ms: number | null;
  best_speed_ms: number | null;
  run_count: number;
  trail_count: number;
  race_count: number;
}

interface GearItem {
  id: number;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  size: string | null;
  quantity: number;
  notes: string | null;
  is_watchlist: number;
  target_price: number | null;
  url: string | null;
  created_at: string;
}

type GearCategory = 'clothing' | 'backpack' | 'hardware' | 'food';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function speedToMinKm(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const minKm = 1000 / ms / 60;
  const min = Math.floor(minKm);
  const sec = Math.round((minKm - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

function fmtKm(m: number): string {
  return (m / 1).toFixed(1);
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso.includes('T') ? iso : iso + 'T12:00:00')
    .toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dealSearchUrl(brand: string | null, model: string | null, name: string): string {
  const q = [brand, model, name].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q + ' sale NZ running')}`;
}

function progressColor(pct: number): string {
  if (pct >= 90) return 'bg-signal-miss';
  if (pct >= 70) return 'bg-signal-warn';
  return 'bg-signal-ok';
}

function rotationAdvice(shoe: ShoeRow, allActive: ShoeRow[]): { badge: string; color: string; tip: string } | null {
  if (!shoe.strava_gear_id) return null;
  if (shoe.session_count === 0) return null;

  const isFastest = allActive.every(
    (s) => s.id === shoe.id || (s.best_speed_ms ?? 0) <= (shoe.best_speed_ms ?? 0),
  );
  const isTrailFocused = shoe.trail_count > shoe.run_count;
  const isRaceFocused = shoe.race_count > 0 && shoe.race_count >= shoe.session_count * 0.3;
  const pct = shoe.target_km > 0 ? shoe.total_km / shoe.target_km : 0;

  if (pct >= 0.9) return { badge: 'Near limit', color: 'text-signal-miss', tip: 'Consider replacing — close to km target.' };
  if (isFastest && shoe.best_speed_ms && shoe.best_speed_ms > 0)
    return { badge: 'Race shoe', color: 'text-accent', tip: `Fastest in rotation (best ${speedToMinKm(shoe.best_speed_ms)}). Use for tempo runs, races, and PB attempts.` };
  if (isTrailFocused) return { badge: 'Trail', color: 'text-amber-400', tip: `${shoe.trail_count} trail runs — your trail specialist.` };
  if (isRaceFocused) return { badge: 'Racer', color: 'text-accent', tip: 'Frequently used in races — protect km for race day.' };
  return { badge: 'Daily trainer', color: 'text-signal-ok', tip: 'Regular workhorse. Good for easy and long runs.' };
}

// ---------------------------------------------------------------------------
// DB reads / writes
// ---------------------------------------------------------------------------

const SHOES_SQL = `
  SELECT
    s.id, s.strava_gear_id, s.name, s.brand, s.model, s.category,
    s.description, s.size, s.target_km, s.retired, s.notes,
    COALESCE(SUM(CASE WHEN a.id IS NOT NULL THEN a.distance ELSE 0 END) / 1000.0, 0) AS total_km,
    COUNT(CASE WHEN a.id IS NOT NULL THEN 1 END)    AS session_count,
    MAX(a.start_date)                               AS last_used,
    AVG(CASE WHEN a.sport_type IN ('Run','VirtualRun') AND a.distance > 3000 THEN a.average_speed END) AS avg_speed_ms,
    MAX(CASE WHEN a.sport_type IN ('Run','VirtualRun') AND a.distance > 5000 THEN a.average_speed END) AS best_speed_ms,
    COUNT(CASE WHEN a.sport_type IN ('Run','VirtualRun') THEN 1 END)  AS run_count,
    COUNT(CASE WHEN a.sport_type = 'TrailRun' THEN 1 END)             AS trail_count,
    COUNT(CASE WHEN a.sport_type = 'Race' THEN 1 END)                 AS race_count
  FROM shoes s
  LEFT JOIN activities a ON a.gear_id = s.strava_gear_id AND s.strava_gear_id IS NOT NULL
  GROUP BY s.id
  ORDER BY s.retired ASC, total_km DESC
`;

function rowToShoe(r: unknown[]): ShoeRow {
  return {
    id:             r[0]  as number,
    strava_gear_id: r[1]  as string | null,
    name:           r[2]  as string,
    brand:          r[3]  as string | null,
    model:          r[4]  as string | null,
    category:       r[5]  as string,
    description:    r[6]  as string | null,
    size:           r[7]  as string | null,
    target_km:      r[8]  as number,
    retired:        r[9]  as number,
    notes:          r[10] as string | null,
    total_km:       r[11] as number,
    session_count:  r[12] as number,
    last_used:      r[13] as string | null,
    avg_speed_ms:   r[14] as number | null,
    best_speed_ms:  r[15] as number | null,
    run_count:      r[16] as number,
    trail_count:    r[17] as number,
    race_count:     r[18] as number,
  };
}

async function loadShoes(): Promise<ShoeRow[]> {
  return (await query(SHOES_SQL)).map(rowToShoe);
}

async function loadGearItems(): Promise<GearItem[]> {
  const rows = await query(
    `SELECT id, name, category, brand, model, description, size, quantity, notes, is_watchlist, target_price, url, created_at
     FROM gear_items ORDER BY is_watchlist ASC, category ASC, name ASC`,
  );
  return rows.map((r) => ({
    id:           r[0] as number,
    name:         r[1] as string,
    category:     r[2] as string,
    brand:        r[3] as string | null,
    model:        r[4] as string | null,
    description:  r[5] as string | null,
    size:         r[6] as string | null,
    quantity:     r[7] as number,
    notes:        r[8] as string | null,
    is_watchlist: r[9] as number,
    target_price: r[10] as number | null,
    url:          r[11] as string | null,
    created_at:   r[12] as string,
  }));
}

async function ensureFreshAccessToken(): Promise<string> {
  const tokens = await getStoredTokens();
  if (!tokens) throw new Error('Not connected to Strava — reconnect in Settings');
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt > nowSec + 60) return tokens.accessToken;
  const fresh = await refreshAccessToken(tokens.refreshToken, WORKER_URL);
  await storeTokens({ ...tokens, accessToken: fresh.access_token, refreshToken: fresh.refresh_token, expiresAt: fresh.expires_at });
  return fresh.access_token;
}

async function importStravaGear(): Promise<{ imported: number; updated: number }> {
  const accessToken = await ensureFreshAccessToken();
  const { shoes } = await fetchAthleteGear(accessToken);
  let imported = 0, updated = 0;

  for (const s of shoes) {
    const displayName = s.name || [s.brand_name, s.model_name].filter(Boolean).join(' ') || 'Shoe';
    const existing = await query('SELECT id FROM shoes WHERE strava_gear_id = ?', [s.id]);
    if (existing.length) {
      await exec(
        `UPDATE shoes SET name = ?, brand = ?, model = ?, description = ?, retired = ? WHERE strava_gear_id = ?`,
        [displayName, s.brand_name || null, s.model_name || null, s.description || null, s.retired ? 1 : 0, s.id],
      );
      updated++;
    } else {
      await exec(
        `INSERT INTO shoes (strava_gear_id, name, brand, model, description, retired, target_km) VALUES (?,?,?,?,?,?,800)`,
        [s.id, displayName, s.brand_name || null, s.model_name || null, s.description || null, s.retired ? 1 : 0],
      );
      imported++;
    }
  }

  await setSetting('gear_strava_imported_at', new Date().toISOString());
  return { imported, updated };
}

async function retireShoe(id: number, retired: number): Promise<void> {
  await exec('UPDATE shoes SET retired = ? WHERE id = ?', [retired, id]);
}

async function addGearItem(item: { name: string; category: string; brand: string; model: string; size: string; is_watchlist: boolean; target_price: string; url: string; notes: string }): Promise<void> {
  await exec(
    `INSERT INTO gear_items (name, category, brand, model, size, is_watchlist, target_price, url, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
    [item.name, item.category, item.brand || null, item.model || null, item.size || null, item.is_watchlist ? 1 : 0, item.target_price ? Number(item.target_price) : null, item.url || null, item.notes || null],
  );
}

async function deleteGearItem(id: number): Promise<void> {
  await exec('DELETE FROM gear_items WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ total_km, target_km }: { total_km: number; target_km: number }) {
  const pct = target_km > 0 ? Math.min((total_km / target_km) * 100, 100) : 0;
  return (
    <div className="relative h-1 bg-ink-line rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`absolute inset-y-0 left-0 ${progressColor(pct)} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ShoeCard({ shoe, allActive, onRefresh }: { shoe: ShoeRow; allActive: ShoeRow[]; onRefresh: () => void }) {
  const target = shoe.target_km > 0 ? shoe.target_km : 800;
  const pct = (shoe.total_km / target) * 100;
  const advice = rotationAdvice(shoe, allActive);
  const subtitle = [shoe.brand, shoe.model].filter(Boolean).join(' ');
  const [busyRetire, setBusyRetire] = useState(false);

  async function toggleRetire() {
    setBusyRetire(true);
    try { await retireShoe(shoe.id, shoe.retired === 0 ? 1 : 0); onRefresh(); }
    finally { setBusyRetire(false); }
  }

  return (
    <div className="border border-ink-line p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-semibold text-bone truncate">{shoe.name}</p>
            {advice && (
              <span className={`font-mono text-[10px] uppercase tracking-widest ${advice.color} border border-current/30 px-1.5 py-0.5`}>
                {advice.badge}
              </span>
            )}
            {shoe.size && (
              <span className="font-mono text-[10px] text-bone-mute border border-ink-line px-1.5 py-0.5">
                {shoe.size}
              </span>
            )}
          </div>
          {subtitle && <p className="font-mono text-xs text-bone-dim mt-0.5">{subtitle}</p>}
          {advice?.tip && <p className="font-mono text-[10px] text-bone-mute mt-1 leading-relaxed">{advice.tip}</p>}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <a
            href={dealSearchUrl(shoe.brand, shoe.model, shoe.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-accent border border-ink-line hover:border-accent px-2 py-1 transition-colors"
          >
            Find deals <ExternalLink size={10} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => void toggleRetire()}
            disabled={busyRetire}
            className="font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-signal-warn transition-colors disabled:opacity-50"
          >
            {busyRetire ? '…' : shoe.retired ? 'Unretire' : 'Retire'}
          </button>
        </div>
      </div>

      <ProgressBar total_km={shoe.total_km} target_km={target} />

      <div className="flex items-center gap-4 flex-wrap text-[10px] font-mono text-bone-mute">
        <span>{fmtKm(shoe.total_km)} / {fmtKm(target)} km</span>
        {shoe.session_count > 0 && <span>{shoe.session_count} sessions</span>}
        {shoe.avg_speed_ms && <span>avg {speedToMinKm(shoe.avg_speed_ms)}</span>}
        {shoe.best_speed_ms && <span>best {speedToMinKm(shoe.best_speed_ms)}</span>}
        <span className="ml-auto">{fmtDate(shoe.last_used)}</span>
        {pct >= 90 && <span className="text-signal-miss uppercase">Replace</span>}
        {pct >= 70 && pct < 90 && <span className="text-signal-warn uppercase">Worn</span>}
      </div>
    </div>
  );
}

function GearItemCard({ item, onDelete }: { item: GearItem; onDelete: () => void }) {
  const [busyDelete, setBusyDelete] = useState(false);

  async function handleDelete() {
    setBusyDelete(true);
    try { await deleteGearItem(item.id); onDelete(); }
    finally { setBusyDelete(false); }
  }

  const subtitle = [item.brand, item.model].filter(Boolean).join(' ');

  return (
    <div className="border border-ink-line p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm text-bone">{item.name}</p>
            {item.size && <span className="font-mono text-[10px] text-bone-mute border border-ink-line px-1.5 py-0.5">{item.size}</span>}
            {item.quantity > 1 && <span className="font-mono text-[10px] text-bone-mute">×{item.quantity}</span>}
          </div>
          {subtitle && <p className="font-mono text-xs text-bone-dim">{subtitle}</p>}
          {item.is_watchlist === 1 && item.target_price && (
            <p className="font-mono text-[10px] text-amber-400 mt-0.5">Target: ${item.target_price.toFixed(2)}</p>
          )}
          {item.notes && <p className="font-mono text-[10px] text-bone-mute mt-1">{item.notes}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <a
            href={item.url ?? dealSearchUrl(item.brand, item.model, item.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-accent border border-ink-line hover:border-accent px-2 py-1 transition-colors"
          >
            {item.url ? 'View ↗' : 'Find deals'} <ExternalLink size={10} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busyDelete}
            className="text-bone-mute hover:text-signal-miss transition-colors disabled:opacity-50"
            aria-label={`Delete ${item.name}`}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add gear item form
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<GearCategory | 'watchlist', string> = {
  clothing: 'Clothing',
  backpack: 'Backpack',
  hardware: 'Hardware',
  food: 'Food',
  watchlist: 'Watchlist',
};

function AddGearForm({ defaultWatchlist, onAdded }: { defaultWatchlist?: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<GearCategory>('clothing');
  const [isWatchlist, setIsWatchlist] = useState(defaultWatchlist ?? false);
  const [form, setForm] = useState({ name: '', brand: '', model: '', size: '', target_price: '', url: '', notes: '' });

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await addGearItem({ ...form, name: form.name.trim(), category, is_watchlist: isWatchlist });
      setForm({ name: '', brand: '', model: '', size: '', target_price: '', url: '', notes: '' });
      setOpen(false);
      onAdded();
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-accent transition-colors"
      >
        <Plus size={12} /> Add {defaultWatchlist ? 'to watchlist' : 'item'}
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="border border-ink-line p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Add gear</p>
        <button type="button" onClick={() => setOpen(false)} className="text-bone-mute hover:text-bone"><X size={14} /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-3 space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Name *</label>
          <input type="text" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Arc'teryx Norvan vest" className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-sm px-3 py-2 placeholder:text-bone-mute focus:outline-none focus:border-accent" />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as GearCategory)} className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent">
            {(['clothing','backpack','hardware','food'] as GearCategory[]).map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Brand</label>
          <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Model</label>
          <input type="text" value={form.model} onChange={e => set('model', e.target.value)} className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Size</label>
          <input type="text" value={form.size} onChange={e => set('size', e.target.value)} placeholder="US 11 / XL / 1.5L" className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
        </div>

        <div className="flex items-center gap-2 col-span-2">
          <input id="watchlist-chk" type="checkbox" checked={isWatchlist} onChange={e => setIsWatchlist(e.target.checked)} className="accent-accent" />
          <label htmlFor="watchlist-chk" className="font-mono text-xs text-bone-dim cursor-pointer">Add to watchlist (waiting for a deal)</label>
        </div>

        {isWatchlist && (
          <>
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase text-bone-mute">Target price (NZD)</label>
              <input type="number" step="0.01" value={form.target_price} onChange={e => set('target_price', e.target.value)} className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="font-mono text-[10px] uppercase text-bone-mute">Product URL (optional)</label>
              <input type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
            </div>
          </>
        )}

        <div className="col-span-2 sm:col-span-3 space-y-1">
          <label className="font-mono text-[10px] uppercase text-bone-mute">Notes</label>
          <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full bg-ink-shadow border border-ink-line text-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-accent" />
        </div>
      </div>

      <button type="submit" disabled={busy || !form.name.trim()} className="px-4 py-2 border border-accent text-accent hover:bg-accent hover:text-ink font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-50">
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Import banner
// ---------------------------------------------------------------------------

function ImportBanner({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [lastImported, setLastImported] = useState<string | null>(null);

  useEffect(() => {
    getSetting('gear_strava_imported_at').then(v => setLastImported(v || null)).catch(() => null);
  }, []);

  async function handleImport() {
    setBusy(true);
    setStatus(null);
    try {
      const { imported, updated } = await importStravaGear();
      setLastImported(new Date().toISOString());
      setStatus({ type: 'ok', msg: `${imported} added, ${updated} updated from Strava.` });
      onImported();
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-ink-line p-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Strava gear sync</p>
        {lastImported && lastImported.length > 0 && (
          <p className="font-mono text-[10px] text-bone-dim mt-0.5">
            Last imported {fmtDate(lastImported)}
          </p>
        )}
        {status && (
          <p className={`font-mono text-xs mt-1 ${status.type === 'ok' ? 'text-signal-ok' : 'text-signal-miss'}`}>
            {status.msg}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void handleImport()}
        disabled={busy}
        className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-accent border border-ink-line hover:border-accent px-3 py-2 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
        {busy ? 'Importing…' : 'Import from Strava'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const GEAR_CATEGORIES: { key: GearCategory; label: string; plural: string; tip: string }[] = [
  { key: 'clothing', label: 'Clothing',  plural: 'items',  tip: 'Jerseys, shorts, socks, compression, base layers' },
  { key: 'backpack', label: 'Backpacks', plural: 'packs',  tip: 'Running packs, hydration vests, day packs' },
  { key: 'hardware', label: 'Hardware',  plural: 'items',  tip: 'Poles, camel bladders, GPS watch, HR monitor, headlamp' },
  { key: 'food',     label: 'Food',      plural: 'items',  tip: 'Gels, electrolytes, bars, chews, salt tabs' },
];

export default function GearPage() {
  const { ready } = useDb();

  const [shoes, setShoes]       = useState<ShoeRow[] | null>(null);
  const [gearItems, setGearItems] = useState<GearItem[] | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const refresh = useCallback(async () => {
    const [s, g] = await Promise.all([loadShoes(), loadGearItems()]);
    setShoes(s);
    setGearItems(g);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  if (!ready || shoes === null || gearItems === null) return <PageSkeleton />;

  const activeShoes  = shoes.filter(s => s.retired === 0);
  const retiredShoes = shoes.filter(s => s.retired === 1);
  const watchlist    = gearItems.filter(g => g.is_watchlist === 1);
  const regularGear  = gearItems.filter(g => g.is_watchlist === 0);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-5xl mx-auto space-y-10">

      {/* Header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">athlete inventory</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">Gear</h1>
        <p className="font-mono text-xs text-bone-mute leading-relaxed max-w-xl">
          Track what you run in, research deals, and monitor shoe rotation health. No purchases happen here — all links go to the originator's site or search.
        </p>
      </header>

      {/* Strava import */}
      <ImportBanner onImported={() => void refresh()} />

      {/* ── Shoes ── */}
      <section aria-label="Shoes">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl tracking-widest uppercase text-bone">Shoes</h2>
            <p className="font-mono text-[10px] text-bone-mute mt-0.5">
              {activeShoes.length} active · {retiredShoes.length} retired · Rotation analysis below each shoe
            </p>
          </div>
        </div>

        {activeShoes.length === 0 ? (
          <div className="border border-ink-line p-6">
            <p className="font-mono text-xs text-bone-mute">No active shoes — import from Strava above or add manually.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeShoes.map(shoe => (
              <ShoeCard key={shoe.id} shoe={shoe} allActive={activeShoes} onRefresh={() => void refresh()} />
            ))}
          </div>
        )}

        {/* Retired — collapsible */}
        {retiredShoes.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowRetired(v => !v)}
              className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-bone transition-colors"
            >
              {showRetired ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Retired — {retiredShoes.length} pairs
            </button>
            {showRetired && (
              <div className="space-y-3 mt-4">
                {retiredShoes.map(shoe => (
                  <ShoeCard key={shoe.id} shoe={shoe} allActive={activeShoes} onRefresh={() => void refresh()} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Clothing / Backpacks / Hardware / Food ── */}
      {GEAR_CATEGORIES.map(cat => {
        const items = regularGear.filter(g => g.category === cat.key);
        return (
          <section key={cat.key} aria-label={cat.label}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="font-display text-xl tracking-widest uppercase text-bone">{cat.label}</h2>
                <p className="font-mono text-[10px] text-bone-mute">{cat.tip}</p>
              </div>
              <span className="font-mono text-[10px] text-bone-mute">{items.length} {cat.plural}</span>
            </div>
            {items.length > 0 && (
              <div className="space-y-3 mb-4">
                {items.map(item => (
                  <GearItemCard key={item.id} item={item} onDelete={() => void refresh()} />
                ))}
              </div>
            )}
            <AddGearForm onAdded={() => void refresh()} />
          </section>
        );
      })}

      {/* ── Watchlist ── */}
      <section aria-label="Watchlist">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="font-display text-xl tracking-widest uppercase text-bone">Watchlist</h2>
            <p className="font-mono text-[10px] text-bone-mute">Items you want to buy — tracking for price drops, restocks, or returns</p>
          </div>
          <span className="font-mono text-[10px] text-bone-mute">{watchlist.length} items</span>
        </div>

        {watchlist.length === 0 && (
          <div className="border border-ink-line p-4 mb-4">
            <p className="font-mono text-xs text-bone-mute">Nothing on the watchlist yet. Add gear you're waiting to buy — track target price and size so you're ready when a sale drops.</p>
          </div>
        )}

        {watchlist.length > 0 && (
          <div className="space-y-3 mb-4">
            {watchlist.map(item => (
              <GearItemCard key={item.id} item={item} onDelete={() => void refresh()} />
            ))}
          </div>
        )}

        <AddGearForm defaultWatchlist onAdded={() => void refresh()} />
      </section>
    </div>
  );
}
