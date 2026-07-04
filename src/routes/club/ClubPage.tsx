import { useState, useEffect, useCallback, useRef } from 'react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { query, exec } from '@/db/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatActivityTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatActivityDate(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Monday-based ISO week start for a given date string (YYYY-MM-DD). */
function weekStart(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - daysFromMon);
  const y = mon.getUTCFullYear();
  const mo = String(mon.getUTCMonth() + 1).padStart(2, '0');
  const day = String(mon.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Short week label: "14 Jun" from a YYYY-MM-DD string. */
function weekLabel(isoMonday: string): string {
  const d = new Date(isoMonday + 'T12:00:00');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunRow {
  start_date: string;
  distance_m: number;
  moving_time_s: number;
  name: string;
}

interface GoalRace {
  date: string;
  name: string;
  distance_km: number;
}

interface WeekBucket {
  label: string;
  km: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type SaveStatus = 'idle' | 'saved';

function SavedBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className="font-mono text-xs text-signal-ok" role="status" aria-live="polite">
      Saved.
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Identity
// ---------------------------------------------------------------------------

function IdentitySection() {
  const [athleteName, setAthleteName] = useState('');
  const [parkrunId, setParkrunId] = useState('');
  const [nameStatus, setNameStatus] = useState<SaveStatus>('idle');
  const [parkrunStatus, setParkrunStatus] = useState<SaveStatus>('idle');
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parkrunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const rows = await query(
        "SELECT key, value FROM settings WHERE key IN ('club.athlete_name','club.parkrun_id')",
      );
      for (const r of rows) {
        if (r[0] === 'club.athlete_name') setAthleteName((r[1] as string) ?? '');
        if (r[0] === 'club.parkrun_id') setParkrunId((r[1] as string) ?? '');
      }
    }
    load().catch(() => undefined);
  }, []);

  async function handleNameBlur() {
    await upsertSetting('club.athlete_name', athleteName);
    setNameStatus('saved');
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => setNameStatus('idle'), 2000);
  }

  async function handleParkrunBlur() {
    await upsertSetting('club.parkrun_id', parkrunId);
    setParkrunStatus('saved');
    if (parkrunTimerRef.current) clearTimeout(parkrunTimerRef.current);
    parkrunTimerRef.current = setTimeout(() => setParkrunStatus('idle'), 2000);
  }

  return (
    <section className="border border-ink-line p-6 space-y-4" aria-labelledby="club-identity">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · identity</p>
        <h2
          id="club-identity"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Your Details
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="club-athlete-name"
            className="block font-mono text-xs text-bone-mute uppercase tracking-widest mb-1"
          >
            Athlete name
          </label>
          <input
            id="club-athlete-name"
            type="text"
            value={athleteName}
            onChange={(e) => setAthleteName(e.target.value)}
            onBlur={() => { handleNameBlur().catch(() => undefined); }}
            placeholder="e.g. Matt Harkness"
            className="w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm
                       text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent
                       transition-colors"
          />
          <div className="mt-1 h-4">
            <SavedBadge status={nameStatus} />
          </div>
        </div>

        <div>
          <label
            htmlFor="club-parkrun-id"
            className="block font-mono text-xs text-bone-mute uppercase tracking-widest mb-1"
          >
            parkrun ID
          </label>
          <div className="flex">
            <span
              aria-hidden="true"
              className="flex items-center px-3 bg-ink-panel border border-r-0 border-ink-line
                         font-mono text-sm text-bone-mute select-none"
            >
              A
            </span>
            <input
              id="club-parkrun-id"
              type="text"
              value={parkrunId}
              onChange={(e) => setParkrunId(e.target.value.replace(/\D/g, ''))}
              onBlur={() => { handleParkrunBlur().catch(() => undefined); }}
              placeholder="e.g. 12345"
              aria-label="parkrun ID number"
              className="flex-1 bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm
                         text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent
                         transition-colors"
            />
          </div>
          <div className="mt-1 h-4">
            <SavedBadge status={parkrunStatus} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2: 4-week summary card
// ---------------------------------------------------------------------------

function WeekBarChart({ weeks }: { weeks: WeekBucket[] }) {
  const maxKm = Math.max(0.1, ...weeks.map((w) => w.km));
  const BAR_MAX_PX = 60;

  return (
    <div className="flex items-end gap-2 h-20" role="img" aria-label="Weekly kilometre chart">
      {weeks.map((w) => {
        const barH = Math.round((w.km / maxKm) * BAR_MAX_PX);
        return (
          <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-bone-mute tabular-nums">
              {w.km > 0 ? w.km.toFixed(0) : '—'}
            </span>
            <div
              className="w-full bg-accent/30 relative"
              style={{ height: `${BAR_MAX_PX}px` }}
              title={`${w.label}: ${w.km.toFixed(1)} km`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 bg-accent transition-all"
                style={{ height: `${barH}px` }}
              />
            </div>
            <span className="font-mono text-[10px] text-bone-mute text-center leading-tight">
              {w.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface SummaryData {
  totalKm: number;
  totalRuns: number;
  avgKm: number;
  longestKm: number;
  totalTimeS: number;
  weeks: WeekBucket[];
}

function SummaryCard({ data }: { data: SummaryData }) {
  const { totalKm, totalRuns, longestKm, totalTimeS, weeks } = data;

  const stats: { label: string; value: string }[] = [
    { label: 'Total km', value: totalKm.toFixed(1) },
    { label: 'Total runs', value: String(totalRuns) },
    { label: 'Longest run', value: `${longestKm.toFixed(1)} km` },
    { label: 'Total time', value: formatTime(totalTimeS) },
  ];

  return (
    <section className="border border-ink-line p-6 space-y-6" aria-labelledby="club-summary">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · last 4 weeks</p>
        <h2
          id="club-summary"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Training Summary
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink-line">
        {stats.map((s) => (
          <div key={s.label} className="bg-ink-shadow p-4 space-y-1">
            <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
              {s.label}
            </p>
            <p className="font-display tracking-widest text-2xl text-bone leading-none">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest mb-3">
          Weekly km
        </p>
        <WeekBarChart weeks={weeks} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Share text
// ---------------------------------------------------------------------------

function ShareCard({
  summary,
  athleteName,
  parkrunId,
  goalRace,
}: {
  summary: SummaryData;
  athleteName: string;
  parkrunId: string;
  goalRace: GoalRace | null;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasEnoughData = summary.totalRuns >= 3;

  function buildShareText(): string {
    const name = athleteName.trim() || 'Night Ninja';
    const dateStr = new Date().toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const lines: string[] = [
      `${name} · Training Summary`,
      dateStr,
      '',
      'Last 4 weeks:',
      `• ${summary.totalRuns} runs · ${summary.totalKm.toFixed(1)}km total`,
      `• Longest run: ${summary.longestKm.toFixed(1)}km`,
      `• Weekly avg: ${summary.avgKm.toFixed(1)}km`,
    ];
    if (goalRace) {
      lines.push('');
      lines.push(`Goal race: ${goalRace.name} · ${goalRace.date}`);
    }
    if (parkrunId.trim()) {
      lines.push('');
      lines.push(`parkrun ID: A${parkrunId.trim()}`);
    }
    return lines.join('\n');
  }

  function handleCopy() {
    if (!hasEnoughData) return;
    const text = buildShareText();
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(() => undefined);
  }

  const previewText = hasEnoughData ? buildShareText() : '';

  return (
    <section className="border border-ink-line p-6 space-y-4" aria-labelledby="club-share">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">club · share</p>
        <h2
          id="club-share"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Share Training
        </h2>
      </div>

      {!hasEnoughData ? (
        <p className="font-mono text-sm text-bone-dim leading-relaxed">
          Sync your Strava activities in Setup to generate a summary.
        </p>
      ) : (
        <>
          <pre
            className="bg-ink-shadow border border-ink-line px-4 py-3 font-mono text-xs
                       text-bone-dim leading-relaxed whitespace-pre-wrap break-words"
            aria-label="Share text preview"
          >
            {previewText}
          </pre>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 border border-accent text-accent hover:bg-accent hover:text-ink
                         font-mono text-xs uppercase tracking-widest transition-colors"
            >
              Copy training summary
            </button>
            {copyStatus === 'copied' && (
              <span
                className="font-mono text-xs text-signal-ok"
                role="status"
                aria-live="polite"
              >
                Copied to clipboard!
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Recent activity list
// ---------------------------------------------------------------------------

function RecentRunsSection({ runs }: { runs: RunRow[] }) {
  const recent = runs.slice(0, 10);

  return (
    <section className="border border-ink-line p-6 space-y-4" aria-labelledby="club-recent">
      <div className="space-y-1 border-b border-ink-line pb-4">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          club · recent runs
        </p>
        <h2
          id="club-recent"
          className="font-display tracking-widest text-2xl uppercase text-bone"
        >
          Recent Activity
        </h2>
      </div>

      {recent.length === 0 ? (
        <p className="font-mono text-sm text-bone-dim">No runs in the last 4 weeks.</p>
      ) : (
        <ul className="divide-y divide-ink-line" role="list">
          {recent.map((run, i) => {
            const km = run.distance_m / 1000;
            const name =
              run.name.length > 40 ? run.name.slice(0, 40) + '…' : run.name;
            return (
              <li
                key={`${run.start_date}-${i}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
                    {formatActivityDate(run.start_date)}
                  </p>
                  <p className="font-mono text-sm text-bone truncate">{name}</p>
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  <p className="font-display tracking-widest text-base text-bone leading-none">
                    {km.toFixed(1)} km
                  </p>
                  <p className="font-mono text-[10px] text-bone-mute tabular-nums">
                    {formatActivityTime(run.moving_time_s)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClubPage() {
  const { ready, error: dbError } = useDb();

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [athleteName, setAthleteName] = useState('');
  const [parkrunId, setParkrunId] = useState('');
  const [goalRace, setGoalRace] = useState<GoalRace | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 28);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const [actRows, settingsRows, raceRows] = await Promise.all([
      query(
        `SELECT start_date, distance, moving_time, sport_type, name
         FROM activities WHERE start_date >= ? ORDER BY start_date DESC`,
        [cutoffIso],
      ),
      query("SELECT key, value FROM settings WHERE key IN ('club.parkrun_id','club.athlete_name')"),
      query("SELECT date, name, distance_km FROM races WHERE is_goal = 1 LIMIT 1"),
    ]);

    // Parse settings
    let name = '';
    let pid = '';
    for (const r of settingsRows) {
      if (r[0] === 'club.athlete_name') name = (r[1] as string) ?? '';
      if (r[0] === 'club.parkrun_id') pid = (r[1] as string) ?? '';
    }

    // Parse runs — filter to running activities only
    const runRows: RunRow[] = actRows
      .filter((r) => String(r[3]).toLowerCase().includes('run'))
      .map((r) => ({
        start_date: r[0] as string,
        distance_m: (r[1] as number) ?? 0,
        moving_time_s: (r[2] as number) ?? 0,
        name: (r[4] as string) ?? '',
      }));

    // Parse goal race
    let race: GoalRace | null = null;
    if (raceRows.length > 0) {
      race = {
        date: raceRows[0][0] as string,
        name: raceRows[0][1] as string,
        distance_km: raceRows[0][2] as number,
      };
    }

    setRuns(runRows);
    setAthleteName(name);
    setParkrunId(pid);
    setGoalRace(race);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    load().catch(() => undefined);
  }, [ready, load]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || !loaded) return <PageSkeleton />;

  // Compute summary stats
  const totalKm = runs.reduce((s, r) => s + r.distance_m / 1000, 0);
  const totalRuns = runs.length;
  const avgKm = totalRuns > 0 ? totalKm / totalRuns : 0;
  const longestKm = Math.max(0, ...runs.map((r) => r.distance_m / 1000));
  const totalTimeS = runs.reduce((s, r) => s + r.moving_time_s, 0);

  // Build week buckets — last 4 Mon-Sun weeks, newest first
  const weekMap = new Map<string, number>();
  for (const run of runs) {
    const ws = weekStart(run.start_date);
    weekMap.set(ws, (weekMap.get(ws) ?? 0) + run.distance_m / 1000);
  }

  // Generate 4 week starts ending with the current week
  const now = new Date();
  const nowDow = now.getUTCDay();
  const daysFromMon = nowDow === 0 ? 6 : nowDow - 1;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysFromMon);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const weekBuckets: WeekBucket[] = [];
  for (let i = 3; i >= 0; i--) {
    const mon = new Date(thisMonday);
    mon.setUTCDate(thisMonday.getUTCDate() - i * 7);
    const y = mon.getUTCFullYear();
    const mo = String(mon.getUTCMonth() + 1).padStart(2, '0');
    const day = String(mon.getUTCDate()).padStart(2, '0');
    const key = `${y}-${mo}-${day}`;
    weekBuckets.push({ label: weekLabel(key), km: weekMap.get(key) ?? 0 });
  }

  const summaryData: SummaryData = {
    totalKm,
    totalRuns,
    avgKm,
    longestKm,
    totalTimeS,
    weeks: weekBuckets,
  };

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-3xl mx-auto space-y-10">
      {/* Page header */}
      <header className="space-y-1 border-b border-ink-line pb-6">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
          Club
        </h1>
        <p className="font-mono text-xs text-bone-mute">Share your training with your crew.</p>
      </header>

      <IdentitySection />

      <SummaryCard data={summaryData} />

      <ShareCard
        summary={summaryData}
        athleteName={athleteName}
        parkrunId={parkrunId}
        goalRace={goalRace}
      />

      <RecentRunsSection runs={runs} />
    </div>
  );
}
