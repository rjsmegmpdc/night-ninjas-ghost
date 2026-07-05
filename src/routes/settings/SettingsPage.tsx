import { useState, useEffect, useRef } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';
import {
  extractSleep,
  extractDailySummary,
  extractHrv,
  extractWeight,
  extractVo2max,
} from '@/lib/garmin/mapper';
import type { GarminDailySnapshot } from '@/lib/garmin/types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShort(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  // Handle ISO datetime strings (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD)
  const datePart = isoDate.slice(0, 10);
  const d = new Date(datePart + 'T00:00:00Z');
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon} ${yr}`;
}

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const then = new Date(isoStr).getTime();
  if (isNaN(then)) return isoStr;
  const diffMs = Date.now() - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return '1 day ago';
  if (diffDay < 30) return `${diffDay} days ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 8) return `${diffWk} weeks ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo} months ago`;
}

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(2);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr} ${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface Stats {
  actCount: number;
  oldest: string | null;
  newest: string | null;
  shoeCount: number;
  raceCount: number;
}

interface SettingsMap {
  'strava.client_id'?: string;
  'strava.last_sync_at'?: string;
  'plan.dojo'?: string;
  'plan.level'?: string;
}

interface SyncJob {
  id: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  fetched: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Section label component
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Section 0: Display preferences (localStorage — no DB, instant effect)
// ---------------------------------------------------------------------------

const HOME_OPTIONS = [
  { to: '/patrol',   label: 'Patrol'   },
  { to: '/recon',    label: 'Recon'    },
  { to: '/dojo',     label: 'Dojo'     },
  { to: '/calendar', label: 'Calendar' },
  { to: '/gear',     label: 'Gear'     },
  { to: '/settings', label: 'Settings' },
] as const;

const FONT_OPTIONS = [
  { value: '0.85', label: 'Small'    },
  { value: '1',    label: 'Normal'   },
  { value: '1.15', label: 'Large'    },
  { value: '1.3',  label: 'X-Large'  },
] as const;

const PRESET_OPTIONS = [
  { value: 'ink',           label: 'Ink',            bg: '#0A0A0A', fg: '#F5F5F0', spot: '#FF5F00' },
  { value: 'dusk',          label: 'Dusk',           bg: '#0E0B08', fg: '#F0EDE6', spot: '#FF5F00' },
  { value: 'oled',          label: 'OLED',           bg: '#000000', fg: '#F5F5F0', spot: '#FF5F00' },
  { value: 'storm',         label: 'Storm',          bg: '#09090F', fg: '#EDF2F8', spot: '#FF5F00' },
  { value: 'dawn',          label: 'Dawn',           bg: '#F5F5F3', fg: '#111110', spot: '#CC4400' },
  { value: 'high-contrast', label: 'Hi-Contrast',    bg: '#000000', fg: '#FFFFFF', spot: '#FFB347' },
] as const;

type PresetValue = typeof PRESET_OPTIONS[number]['value'];

function DisplaySection() {
  const [homePage, setHomePage] = useState<string>(
    () => localStorage.getItem('ghost.home_page') ?? '/calendar',
  );
  const [fontScale, setFontScale] = useState<string>(
    () => localStorage.getItem('ghost.font_scale') ?? '1',
  );
  const [colorPreset, setColorPreset] = useState<PresetValue>(
    () => (localStorage.getItem('ghost.color_preset') as PresetValue | null) ?? 'ink',
  );

  function handleHome(value: string) {
    setHomePage(value);
    localStorage.setItem('ghost.home_page', value);
  }

  function handleFont(value: string) {
    setFontScale(value);
    localStorage.setItem('ghost.font_scale', value);
    document.documentElement.style.setProperty('--font-scale', value);
  }

  function handlePreset(value: PresetValue) {
    setColorPreset(value);
    localStorage.setItem('ghost.color_preset', value);
    const root = document.documentElement;
    if (value === 'ink') {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    } else {
      root.setAttribute('data-theme', value);
      root.style.colorScheme = value === 'dawn' ? 'light' : 'dark';
    }
  }

  return (
    <section aria-labelledby="display-heading" className="border border-ink-line p-6 space-y-6">
      <div className="space-y-1">
        <SectionLabel>display</SectionLabel>
        <h2 id="display-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
          Preferences
        </h2>
      </div>

      {/* Home page */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Home page</p>
        <p className="font-mono text-xs text-bone-dim">
          Where the GHOST button takes you.
        </p>
        <select
          value={homePage}
          onChange={(e) => handleHome(e.target.value)}
          className="bg-ink border border-ink-line px-3 py-2 font-mono text-xs text-bone focus:outline-none focus:border-accent"
        >
          {HOME_OPTIONS.map((o) => (
            <option key={o.to} value={o.to}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Font size</p>
        <div className="flex flex-wrap gap-2">
          {FONT_OPTIONS.map((o) => {
            const active = fontScale === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => handleFont(o.value)}
                className={[
                  'px-4 py-1.5 font-mono text-xs uppercase tracking-widest border transition-colors',
                  active
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-ink-line text-bone-mute hover:border-bone-mute hover:text-bone',
                ].join(' ')}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Color presets */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Theme</p>
        <div className="flex flex-wrap gap-3">
          {PRESET_OPTIONS.map((p) => {
            const active = colorPreset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePreset(p.value)}
                aria-label={p.label}
                aria-pressed={active}
                className={[
                  'w-16 h-16 border-2 flex flex-col justify-between p-2 transition-all',
                  active ? 'border-accent scale-105' : 'border-ink-line hover:border-bone-mute',
                ].join(' ')}
                style={{ backgroundColor: p.bg }}
              >
                {/* Label text in the swatch's own fg color */}
                <span
                  className="font-mono text-[8px] uppercase tracking-wider leading-tight"
                  style={{ color: p.fg }}
                >
                  {p.label}
                </span>
                {/* Accent stripe at the bottom of the swatch */}
                <span
                  className="block h-1 w-full rounded-sm"
                  style={{ backgroundColor: p.spot }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Strava connection
// ---------------------------------------------------------------------------

function StravaSection({ settings }: { settings: SettingsMap }) {
  const clientId = settings['strava.client_id'];
  const lastSync = settings['strava.last_sync_at'];
  const connected = Boolean(clientId && clientId.trim() !== '');

  return (
    <section aria-labelledby="strava-heading" className="border border-ink-line p-6 space-y-4">
      <SectionLabel>strava</SectionLabel>
      <h2 id="strava-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        Connection
      </h2>

      <div className="space-y-3">
        {/* Connection status */}
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-signal-ok' : 'bg-signal-miss'}`}
            aria-hidden="true"
          />
          <span className={`font-mono text-sm ${connected ? 'text-signal-ok' : 'text-signal-miss'}`}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {/* Client ID */}
        {connected && (
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-bone-mute w-24 flex-shrink-0">Client ID</span>
            <span className="font-mono text-xs text-bone-dim break-all">{clientId}</span>
          </div>
        )}

        {/* Last sync */}
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-bone-mute w-24 flex-shrink-0">Last sync</span>
          <span className="font-mono text-xs text-bone-dim">
            {lastSync ? (
              <span title={lastSync}>{relativeTime(lastSync)}</span>
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>

      {/* Setup link */}
      {!connected && (
        <a
          href="/setup"
          className="inline-block font-mono text-xs uppercase tracking-widest px-4 py-2 border border-ink-line text-bone-dim hover:border-accent hover:text-accent transition-colors"
        >
          Go to Setup
        </a>
      )}
      {connected && (
        <a
          href="/setup"
          className="inline-block font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-bone transition-colors"
        >
          Reconfigure in Setup &rarr;
        </a>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Sync history
// ---------------------------------------------------------------------------

function statusIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'failed') return '✗';
  return '⟳';
}

function statusClass(status: string): string {
  if (status === 'completed') return 'text-signal-ok';
  if (status === 'failed') return 'text-signal-miss';
  return 'text-bone-dim';
}

function SyncHistorySection({ jobs }: { jobs: SyncJob[] }) {
  return (
    <section aria-labelledby="sync-heading" className="border border-ink-line p-6 space-y-4">
      <SectionLabel>sync history</SectionLabel>
      <h2 id="sync-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        Recent Syncs
      </h2>

      {jobs.length === 0 ? (
        <p className="font-mono text-xs text-bone-mute">No syncs yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full min-w-[460px]" role="table">
            <thead>
              <tr className="border-b border-ink-line">
                <th scope="col" className="font-mono text-xs text-bone-mute uppercase tracking-widest pb-2 pr-4 text-left w-8">St</th>
                <th scope="col" className="font-mono text-xs text-bone-mute uppercase tracking-widest pb-2 pr-4 text-left">Started</th>
                <th scope="col" className="font-mono text-xs text-bone-mute uppercase tracking-widest pb-2 pr-4 text-left">Status</th>
                <th scope="col" className="font-mono text-xs text-bone-mute uppercase tracking-widest pb-2 pr-4 text-right">Fetched</th>
                <th scope="col" className="font-mono text-xs text-bone-mute uppercase tracking-widest pb-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-line">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-ink-shadow/50 transition-colors">
                  <td className={`font-mono text-sm py-2 pr-4 ${statusClass(job.status)}`} aria-label={job.status}>
                    {statusIcon(job.status)}
                  </td>
                  <td className="font-mono text-xs text-bone-dim py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(job.startedAt)}
                  </td>
                  <td className={`font-mono text-xs py-2 pr-4 capitalize ${statusClass(job.status)}`}>
                    {job.status}
                  </td>
                  <td className="font-mono text-xs text-bone-dim py-2 pr-4 text-right">
                    {job.fetched != null ? job.fetched : '—'}
                  </td>
                  <td className="font-mono text-xs text-signal-miss py-2 max-w-[160px] truncate" title={job.error ?? undefined}>
                    {job.error ? job.error.slice(0, 60) + (job.error.length > 60 ? '…' : '') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Data stats
// ---------------------------------------------------------------------------

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-ink-line p-4 space-y-1">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">{label}</p>
      <p className="font-display text-2xl tracking-widest text-bone leading-none">{value}</p>
    </div>
  );
}

function DataStatsSection({ stats }: { stats: Stats }) {
  const dateRange =
    stats.oldest && stats.newest
      ? `${formatShort(stats.oldest)} – ${formatShort(stats.newest)}`
      : '—';

  return (
    <section aria-labelledby="stats-heading" className="border border-ink-line p-6 space-y-4">
      <SectionLabel>data stats</SectionLabel>
      <h2 id="stats-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        Database
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="Activities" value={stats.actCount} />
        <StatCell label="Date range" value={<span className="text-lg">{dateRange}</span>} />
        <StatCell label="Shoes" value={stats.shoeCount} />
        <StatCell label="Races" value={stats.raceCount} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Data management
// ---------------------------------------------------------------------------

type WipeStep = 'idle' | 'confirm' | 'wiping';

function DataManagementSection() {
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [wipeStep, setWipeStep] = useState<WipeStep>('idle');
  const [wipeInput, setWipeInput] = useState('');
  const [wiping, setWiping] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportDone(false);
    try {
      const [acts, sets, shoes, races, journal, plans] = await Promise.all([
        query('SELECT * FROM activities LIMIT 5000'),
        query('SELECT * FROM settings'),
        query('SELECT * FROM shoes'),
        query('SELECT * FROM races'),
        query('SELECT * FROM journal'),
        query('SELECT * FROM plans'),
      ]);
      const payload = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          activities: acts,
          settings: sets,
          shoes,
          races,
          journal,
          plans,
        },
        null,
        2,
      );
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghost-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } finally {
      setExporting(false);
    }
  }

  async function handleWipe() {
    if (wipeInput !== 'CLEAR') return;
    setWiping(true);
    try {
      await exec('DELETE FROM activities');
      await exec('DELETE FROM sync_jobs');
      await exec('DELETE FROM shoes');
      await exec('DELETE FROM races');
      await exec('DELETE FROM journal');
      await exec('DELETE FROM calendar_events');
      await exec('DELETE FROM plans');
      await exec('DELETE FROM plan_periods');
      await exec('DELETE FROM settings');
      window.location.href = '/setup';
    } catch {
      setWiping(false);
      setWipeStep('idle');
      setWipeInput('');
    }
  }

  return (
    <section
      aria-labelledby="data-mgmt-heading"
      className="border border-signal-miss/30 p-6 space-y-6"
    >
      <div className="space-y-1">
        <SectionLabel>data management</SectionLabel>
        <h2 id="data-mgmt-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
          Export &amp; Wipe
        </h2>
      </div>

      {/* Export */}
      <div className="space-y-3 pb-6 border-b border-ink-line">
        <p className="font-mono text-xs text-bone-dim leading-relaxed">
          Download all your data as a single JSON file. Includes activities, settings, shoes, races, journal entries, and plans.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => { void handleExport(); }}
            disabled={exporting}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-ink-line text-bone-dim hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export data'}
          </button>
          {exportDone && (
            <span
              className="font-mono text-xs text-signal-ok"
              role="status"
              aria-live="polite"
            >
              Exported.
            </span>
          )}
        </div>
      </div>

      {/* Wipe */}
      <div className="space-y-4">
        <p className="font-mono text-xs text-bone-dim leading-relaxed">
          Permanently delete all activities, settings, races, shoes, and journal entries. This cannot be undone.
        </p>

        {wipeStep === 'idle' && (
          <button
            type="button"
            onClick={() => setWipeStep('confirm')}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-signal-miss/40 text-signal-miss hover:bg-signal-miss/10 transition-colors"
          >
            Clear all data
          </button>
        )}

        {(wipeStep === 'confirm' || wipeStep === 'wiping') && (
          <div
            className="border border-signal-miss/40 bg-signal-miss/5 p-5 space-y-4"
            role="alertdialog"
            aria-labelledby="wipe-warning-title"
            aria-describedby="wipe-warning-desc"
          >
            <div className="space-y-1">
              <p
                id="wipe-warning-title"
                className="font-mono text-xs text-signal-miss uppercase tracking-widest"
              >
                Danger — irreversible action
              </p>
              <p id="wipe-warning-desc" className="font-mono text-xs text-bone-dim leading-relaxed">
                This will delete all activities, settings, races, shoes, and journal entries.
                Type <span className="text-bone font-bold">CLEAR</span> to confirm.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label htmlFor="wipe-confirm-input" className="sr-only">
                Type CLEAR to confirm data deletion
              </label>
              <input
                id="wipe-confirm-input"
                type="text"
                value={wipeInput}
                onChange={(e) => setWipeInput(e.target.value)}
                placeholder="CLEAR"
                autoComplete="off"
                spellCheck={false}
                disabled={wiping}
                className="bg-ink-panel border border-ink-line px-3 py-1.5 font-mono text-xs text-bone placeholder:text-bone-mute focus:outline-none focus:border-signal-miss transition-colors w-32 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => { void handleWipe(); }}
                disabled={wipeInput !== 'CLEAR' || wiping}
                className="font-mono text-xs uppercase tracking-widest px-4 py-1.5 border border-signal-miss text-signal-miss hover:bg-signal-miss/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {wiping ? 'Clearing…' : 'Confirm clear'}
              </button>
              <button
                type="button"
                onClick={() => { setWipeStep('idle'); setWipeInput(''); }}
                disabled={wiping}
                className="font-mono text-xs uppercase tracking-widest text-bone-mute hover:text-bone disabled:opacity-30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 5: AI Coach — BYOK
// ---------------------------------------------------------------------------

function AiCoachSection() {
  const [savedKey, setSavedKey] = useState<string>('');
  const [inputKey, setInputKey] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'cleared'>('idle');
  const { ready } = useDb();

  useEffect(() => {
    if (!ready) return;
    query("SELECT value FROM settings WHERE key = 'ai.anthropic_key'").then((rows) => {
      const k = rows[0]?.[0] as string | null ?? '';
      setSavedKey(k);
    });
  }, [ready]);

  async function handleSave() {
    const key = inputKey.trim();
    if (!key) return;
    setSaving(true);
    try {
      await exec(
        `INSERT INTO settings (key, value) VALUES ('ai.anthropic_key', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [key]
      );
      setSavedKey(key);
      setInputKey('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    await exec("DELETE FROM settings WHERE key = 'ai.anthropic_key'");
    setSavedKey('');
    setInputKey('');
    setStatus('cleared');
    setTimeout(() => setStatus('idle'), 2500);
  }

  const maskedKey = savedKey ? `sk-ant-…${savedKey.slice(-4)}` : null;

  return (
    <section aria-labelledby="ai-coach-heading" className="border border-ink-line p-6 space-y-4">
      <SectionLabel>ai coach</SectionLabel>
      <h2 id="ai-coach-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        Anthropic API Key
      </h2>

      <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-xl">
        Enter your Anthropic API key to enable the AI coach in Coach Log. Your key is stored locally — it never leaves your device.
      </p>

      {maskedKey && (
        <div className="flex items-center gap-3 py-2">
          <span className="w-2 h-2 rounded-full bg-signal-ok flex-shrink-0" />
          <span className="font-mono text-xs text-signal-ok">Key set: {maskedKey}</span>
          <button
            type="button"
            onClick={() => { void handleClear(); }}
            className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors ml-2"
          >
            Remove
          </button>
        </div>
      )}

      {!maskedKey && (
        <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
          <div className="relative flex-1">
            <input
              type={show ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
              placeholder="sk-ant-api03-…"
              className="w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-xs text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent pr-10"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-bone-mute hover:text-bone"
              tabIndex={-1}
            >
              {show ? 'hide' : 'show'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving || !inputKey.trim()}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-ink-line text-bone-dim hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving…' : 'Save key'}
          </button>
        </div>
      )}

      {status === 'saved' && (
        <p className="font-mono text-xs text-signal-ok" role="status">Key saved.</p>
      )}
      {status === 'cleared' && (
        <p className="font-mono text-xs text-bone-mute" role="status">Key removed.</p>
      )}

      <p className="font-mono text-xs text-bone-mute">
        Get a key at{' '}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          console.anthropic.com
        </a>
        . BYOK — your usage costs, your control.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Garmin GDPR import
// ---------------------------------------------------------------------------

function extractGarminDate(record: unknown): string | null {
  const r = record as Record<string, unknown>;
  if (typeof r.calendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.calendarDate)) return r.calendarDate;
  if (typeof r.summaryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.summaryDate)) return r.summaryDate;
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) return r.date;
  if (typeof r.startTimestampGMT === 'string') {
    const m = r.startTimestampGMT.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const dto = r.dailySleepDTO as Record<string, unknown> | undefined;
  if (dto && typeof dto.calendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dto.calendarDate))
    return dto.calendarDate;
  return null;
}

async function parseGarminFiles(files: File[]): Promise<GarminDailySnapshot[]> {
  const byDate = new Map<string, GarminDailySnapshot>();

  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      continue; // skip malformed / non-JSON files
    }

    const records = Array.isArray(json) ? json : [json];

    for (const record of records) {
      const date = extractGarminDate(record);
      if (!date) continue;

      const prev: GarminDailySnapshot = byDate.get(date) ?? {
        date,
        rhrBpm: null,
        hrvMs: null,
        sleepDurationS: null,
        sleepScore: null,
        stressScore: null,
        bodyBattery: null,
        vo2maxDevice: null,
        weightKg: null,
        raw: {},
      };

      const { sleepDurationS, sleepScore } = extractSleep(record);
      const { rhrBpm, stressScore, bodyBattery } = extractDailySummary(record);
      const { hrvMs } = extractHrv(record);
      const { weightKg } = extractWeight(record);

      // VO2 max: present on MaxMet-style records that have a generic subobject
      let vo2maxDevice = prev.vo2maxDevice;
      const r = record as Record<string, unknown>;
      if (r.generic) {
        const { vo2maxDevice: v } = extractVo2max([record]);
        if (v !== null) vo2maxDevice = vo2maxDevice ?? v;
      }

      byDate.set(date, {
        date,
        rhrBpm:         prev.rhrBpm         ?? rhrBpm,
        hrvMs:          prev.hrvMs           ?? hrvMs,
        sleepDurationS: prev.sleepDurationS  ?? sleepDurationS,
        sleepScore:     prev.sleepScore      ?? sleepScore,
        stressScore:    prev.stressScore     ?? stressScore,
        bodyBattery:    prev.bodyBattery     ?? bodyBattery,
        vo2maxDevice,
        weightKg:       prev.weightKg        ?? weightKg,
        raw:            prev.raw,
      });
    }
  }

  return Array.from(byDate.values())
    .filter(
      (s) =>
        s.rhrBpm !== null || s.hrvMs !== null || s.sleepDurationS !== null ||
        s.sleepScore !== null || s.stressScore !== null || s.bodyBattery !== null ||
        s.vo2maxDevice !== null || s.weightKg !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function upsertHealthRows(rows: GarminDailySnapshot[]): Promise<void> {
  const SQL = `
    INSERT INTO daily_health_metrics
      (date, source, rhr_bpm, hrv_ms, sleep_duration_s, sleep_score,
       stress_score, body_battery, vo2max_device, weight_kg, raw, synced_at)
    VALUES (?, 'garmin', ?, ?, ?, ?, ?, ?, ?, ?, '{}', datetime('now'))
    ON CONFLICT(date, source) DO UPDATE SET
      rhr_bpm         = COALESCE(excluded.rhr_bpm,         rhr_bpm),
      hrv_ms          = COALESCE(excluded.hrv_ms,          hrv_ms),
      sleep_duration_s= COALESCE(excluded.sleep_duration_s,sleep_duration_s),
      sleep_score     = COALESCE(excluded.sleep_score,     sleep_score),
      stress_score    = COALESCE(excluded.stress_score,    stress_score),
      body_battery    = COALESCE(excluded.body_battery,    body_battery),
      vo2max_device   = COALESCE(excluded.vo2max_device,  vo2max_device),
      weight_kg       = COALESCE(excluded.weight_kg,       weight_kg),
      synced_at       = datetime('now')`;

  await exec('BEGIN');
  try {
    for (const s of rows) {
      await exec(SQL, [
        s.date, s.rhrBpm, s.hrvMs, s.sleepDurationS, s.sleepScore,
        s.stressScore, s.bodyBattery, s.vo2maxDevice, s.weightKg,
      ]);
    }
    await exec('COMMIT');
  } catch (e) {
    await exec('ROLLBACK');
    throw e;
  }
}

interface ParsedPreview {
  rows:    GarminDailySnapshot[];
  oldest:  string;
  newest:  string;
  metrics: string[];
}

function summariseMetrics(rows: GarminDailySnapshot[]): string[] {
  const flags: Record<string, string> = {
    rhrBpm:         'RHR',
    hrvMs:          'HRV',
    sleepDurationS: 'Sleep',
    sleepScore:     'Sleep score',
    stressScore:    'Stress',
    bodyBattery:    'Body Battery',
    vo2maxDevice:   'VO2 max',
    weightKg:       'Weight',
  };
  return Object.entries(flags)
    .filter(([k]) => rows.some((r) => (r as unknown as Record<string, unknown>)[k] !== null))
    .map(([, label]) => label);
}

function GarminImportSection() {
  const { ready } = useDb();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastImported, setLastImported] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    query("SELECT value FROM settings WHERE key = 'garmin_gdpr_imported_at'").then((rows) => {
      const v = rows[0]?.[0] as string | null;
      if (v) setLastImported(v);
    });
  }, [ready]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setParsing(true);
    setParseError(null);
    setPreview(null);
    setImportDone(null);
    try {
      const rows = await parseGarminFiles(files);
      if (rows.length === 0) {
        setParseError('No health metrics found in the selected files. Make sure you selected JSON files from the DI_CONNECT folder of your Garmin export.');
        return;
      }
      setPreview({
        rows,
        oldest:  rows[0].date,
        newest:  rows[rows.length - 1].date,
        metrics: summariseMetrics(rows),
      });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      await upsertHealthRows(preview.rows);
      const now = new Date().toISOString();
      await exec(
        `INSERT INTO settings (key, value) VALUES ('garmin_gdpr_imported_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [now],
      );
      setLastImported(now);
      setImportDone(preview.rows.length);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-labelledby="garmin-heading" className="border border-ink-line p-6 space-y-4">
      <SectionLabel>garmin</SectionLabel>
      <h2 id="garmin-heading" className="font-display text-2xl tracking-widest uppercase text-bone leading-none">
        GDPR Export Import
      </h2>

      <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-xl">
        At{' '}
        <a
          href="https://www.garmin.com/en-US/account/datamanagement/exportdata/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          garmin.com → Data Export
        </a>
        , request your data. Unzip the archive, open the <span className="text-bone">DI_CONNECT</span> folder,
        then select all the JSON files below. GHOST reads RHR, HRV, sleep, stress, body battery, VO2 max, and weight.
      </p>

      {lastImported && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-ok flex-shrink-0" aria-hidden="true" />
          <span className="font-mono text-xs text-signal-ok">
            Last imported {relativeTime(lastImported)}
            {' '}·{' '}
            <span className="text-bone-mute">{formatDateTime(lastImported)}</span>
          </span>
        </div>
      )}

      {/* File picker */}
      <div>
        <label htmlFor="garmin-file-input" className="font-mono text-xs text-bone-mute uppercase tracking-widest block mb-2">
          Select JSON files
        </label>
        <input
          id="garmin-file-input"
          ref={fileInputRef}
          type="file"
          multiple
          accept=".json,application/json"
          onChange={(e) => { void handleFiles(e); }}
          disabled={parsing || importing}
          className="block font-mono text-xs text-bone-dim file:mr-3 file:py-1.5 file:px-3 file:border file:border-ink-line file:bg-ink-panel file:font-mono file:text-xs file:text-bone-dim file:uppercase file:tracking-widest hover:file:border-accent hover:file:text-accent file:transition-colors cursor-pointer disabled:opacity-50"
        />
      </div>

      {/* Parsing indicator */}
      {parsing && (
        <p className="font-mono text-xs text-bone-mute" role="status" aria-live="polite">
          Parsing files…
        </p>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="border border-signal-miss/40 bg-signal-miss/5 p-3" role="alert">
          <p className="font-mono text-xs text-signal-miss">{parseError}</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="border border-ink-line bg-ink-shadow p-4 space-y-3">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ready to import</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">Days</p>
              <p className="font-display text-2xl tracking-widest text-bone">{preview.rows.length}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">From</p>
              <p className="font-mono text-xs text-bone">{formatShort(preview.oldest)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">To</p>
              <p className="font-mono text-xs text-bone">{formatShort(preview.newest)}</p>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-1">Metrics found</p>
            <div className="flex flex-wrap gap-1">
              {preview.metrics.map((m) => (
                <span key={m} className="font-mono text-[10px] px-2 py-0.5 border border-ink-line text-bone-dim">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void handleImport(); }}
            disabled={importing}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-accent text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? 'Importing…' : `Import ${preview.rows.length} days`}
          </button>
        </div>
      )}

      {/* Done */}
      {importDone !== null && (
        <p className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
          Imported {importDone} days of Garmin biometrics.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { ready } = useDb();

  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    Promise.all([
      query(`SELECT
        (SELECT COUNT(*) FROM activities) as act_count,
        (SELECT MIN(start_date) FROM activities) as oldest,
        (SELECT MAX(start_date) FROM activities) as newest,
        (SELECT COUNT(*) FROM shoes) as shoe_count,
        (SELECT COUNT(*) FROM races) as race_count`),
      query("SELECT key, value FROM settings WHERE key IN ('strava.client_id','strava.last_sync_at','plan.dojo','plan.level')"),
      query('SELECT id, status, started_at, finished_at, fetched, error FROM sync_jobs ORDER BY id DESC LIMIT 5'),
    ])
      .then(([statsRows, settingsRows, syncRows]) => {
        if (cancelled) return;

        // Stats — column index access
        const sr = statsRows[0] ?? [];
        setStats({
          actCount: (sr[0] as number) ?? 0,
          oldest: sr[1] as string | null,
          newest: sr[2] as string | null,
          shoeCount: (sr[3] as number) ?? 0,
          raceCount: (sr[4] as number) ?? 0,
        });

        // Settings map by key
        const map: SettingsMap = {};
        for (const row of settingsRows) {
          (map as Record<string, string>)[row[0] as string] = row[1] as string;
        }
        setSettings(map);

        // Sync jobs
        setSyncJobs(
          syncRows.map((r) => ({
            id: r[0] as number,
            status: (r[1] as string) ?? 'unknown',
            startedAt: r[2] as string | null,
            finishedAt: r[3] as string | null,
            fetched: r[4] as number | null,
            error: r[5] as string | null,
          })),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => { cancelled = true; };
  }, [ready]);

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone leading-none">
          Settings
        </h1>
      </header>

      {/* Load error */}
      {loadError && (
        <div
          className="border border-signal-miss/40 bg-signal-miss/5 p-4"
          role="alert"
        >
          <p className="font-mono text-xs text-signal-miss">
            Failed to load settings data: {loadError}
          </p>
        </div>
      )}

      {/* Section 0: Display preferences */}
      <DisplaySection />

      {/* Section 1: Strava */}
      <StravaSection settings={settings} />

      {/* Section 2: Sync history */}
      <SyncHistorySection jobs={syncJobs} />

      {/* Section 3: Data stats */}
      {stats ? (
        <DataStatsSection stats={stats} />
      ) : (
        <div className="border border-ink-line p-6 space-y-4 animate-pulse">
          <div className="h-3 w-20 bg-ink-line rounded" />
          <div className="h-6 w-32 bg-ink-line-bold rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border border-ink-line p-4 h-20 bg-ink-shadow" />
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Data management */}
      <DataManagementSection />

      {/* Section 5: AI coach BYOK */}
      <AiCoachSection />

      {/* Section 6: Garmin GDPR import */}
      <GarminImportSection />
    </div>
  );
}
