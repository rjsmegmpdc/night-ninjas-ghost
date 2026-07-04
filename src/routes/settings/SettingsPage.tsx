import { useState, useEffect } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';

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
    </div>
  );
}
