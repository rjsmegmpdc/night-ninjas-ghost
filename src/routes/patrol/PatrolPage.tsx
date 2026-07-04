import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import {
  getActivitiesInRange,
  getTotalActivityCount,
  getNextRace,
  aggregateWeekStats,
  type GhostActivity,
  type WeekStats,
} from '@/lib/analysis/week-queries';
import { formatSpk } from '@/lib/plans/derive';

// ---------------------------------------------------------------------------
// Date helpers — local time, not UTC
// ---------------------------------------------------------------------------

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentWeekRange(): { startIso: string; endIso: string } {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { startIso: localIso(mon), endIso: localIso(sun) };
}

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
  const year = new Date(endIso + 'T12:00:00').getFullYear();
  return `${fmt(startIso)} — ${fmt(endIso)} ${year}`;
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(dateIso + 'T12:00:00');
  race.setHours(0, 0, 0, 0);
  return Math.round((race.getTime() - today.getTime()) / 86_400_000);
}

function activityDowLabel(startDate: string): string {
  const d = new Date(startDate.includes('T') ? startDate : startDate + 'T12:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function distanceLabel(km: number): string {
  km = Math.abs(km);
  if (km < 0.1) return '0.0 km';
  return `${km.toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatrolData {
  hasData: boolean;
  activities: GhostActivity[];
  stats: WeekStats;
  nextRace: { date: string; name: string; distanceKm: number } | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatrolPage() {
  const { ready, error: dbError } = useDb();
  const [data, setData] = useState<PatrolData | null>(null);
  const { startIso, endIso } = currentWeekRange();
  const todayIso = localIso(new Date());

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([
      getTotalActivityCount(),
      getActivitiesInRange(startIso, endIso),
      getNextRace(todayIso),
    ]).then(([count, activities, nextRace]) => {
      if (cancelled) return;
      setData({
        hasData: count > 0,
        activities,
        stats: aggregateWeekStats(activities),
        nextRace,
      });
    });
    return () => { cancelled = true; };
  }, [ready, startIso, endIso, todayIso]);

  if (dbError) {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <p className="font-mono text-xs text-signal-miss">DB error: {dbError}</p>
      </div>
    );
  }

  if (!ready || !data) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-10">
      {!data.hasData ? (
        <NoDataState />
      ) : (
        <PatrolDashboard data={data} startIso={startIso} endIso={endIso} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NoDataState() {
  return (
    <div className="border border-ink-line p-8 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        patrol · no data yet
      </p>
      <h2 className="font-display tracking-widest text-3xl uppercase text-bone">
        No activities synced
      </h2>
      <p className="font-mono text-sm text-bone-dim max-w-xl leading-relaxed">
        Patrol shows your current week — sessions, paces, stats. Pull your activity history from
        Strava first to see anything here.
      </p>
      <Link
        to="/setup"
        className="inline-flex items-center gap-2 mt-2 font-mono text-xs uppercase tracking-widest text-accent hover:text-accent-hover transition-colors"
      >
        Go to setup →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function PatrolDashboard({ data, startIso, endIso }: { data: PatrolData; startIso: string; endIso: string }) {
  const { stats, activities, nextRace } = data;

  return (
    <>
      {/* Header */}
      <header className="space-y-3 border-b border-ink-line pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
              dashboard · this week
            </p>
            <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
              This Week
            </h1>
            <p className="font-mono text-xs text-bone-mute">
              {formatDateRange(startIso, endIso)}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/setup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink-line hover:border-accent text-bone-mute hover:text-accent font-mono text-xs uppercase tracking-widest transition-colors"
              title="Sync Strava activities"
            >
              <RefreshCw size={12} />
              Sync
            </Link>
          </div>
        </div>

        {nextRace && (
          <div className="flex items-center gap-3 flex-wrap">
            <RaceCountdown race={nextRace} />
          </div>
        )}
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
        <StatBox
          label="this week"
          value={stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0'}
          unit="km"
          accent={stats.totalKm > 0}
          sub={`${stats.totalSessions} session${stats.totalSessions === 1 ? '' : 's'}`}
        />
        <StatBox
          label="long run"
          value={stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '—'}
          unit={stats.longRunKm > 0 ? 'km' : ''}
          sub={stats.longRunKm > 0 ? 'longest run' : 'pending'}
        />
        <StatBox
          label="avg pace"
          value={stats.avgPaceSpk ? formatSpk(stats.avgPaceSpk) : '—:—'}
          unit={stats.avgPaceSpk ? '/km' : ''}
          sub="running pace"
        />
        <StatBox
          label="avg hr"
          value={stats.avgHr ? Math.round(stats.avgHr).toString() : '—'}
          unit={stats.avgHr ? 'bpm' : ''}
          sub={stats.avgHr ? 'weighted by time' : 'no HR data'}
        />
      </div>

      {/* Two-column body */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-8">
        {/* Activities this week */}
        <div className="border border-ink-line">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-line">
            <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
              sessions this week
            </span>
            <span className="font-mono text-xs text-bone-mute">
              {activities.length} logged
            </span>
          </div>
          {activities.length === 0 ? (
            <div className="px-6 py-8 font-mono text-sm text-bone-mute">
              Nothing logged yet this week.
            </div>
          ) : (
            <div className="divide-y divide-ink-line">
              {activities.map((a, i) => (
                <ActivityRow key={i} activity={a} />
              ))}
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-5">
          {/* Tonight's mission */}
          <div className="border border-accent/40 p-5 space-y-3">
            <p className="font-mono text-xs text-accent uppercase tracking-widest">
              tonight's mission
            </p>
            <div className="font-display tracking-widest text-2xl uppercase text-bone">
              No plan set
            </div>
            <p className="font-mono text-xs text-bone-mute leading-relaxed">
              Configure a training plan in Dojo to see tonight's session prescription here.
            </p>
            <Link
              to="/dojo"
              className="inline-block font-mono text-xs text-bone-dim hover:text-accent transition-colors"
            >
              Open Dojo →
            </Link>
          </div>

          {/* Next race */}
          {!nextRace && (
            <div className="border border-ink-line p-5 space-y-2">
              <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
                next race
              </p>
              <p className="font-mono text-xs text-bone-mute leading-relaxed">
                No upcoming races booked.
              </p>
              <Link
                to="/calendar"
                className="inline-block font-mono text-xs text-bone-dim hover:text-accent transition-colors"
              >
                + Book a race →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({
  label, value, unit, accent, sub,
}: {
  label: string; value: string; unit: string; accent?: boolean; sub?: string;
}) {
  return (
    <div className="bg-ink p-6">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display tracking-widest text-4xl leading-none ${accent ? 'text-accent' : 'text-bone'}`}>
          {value}
        </span>
        {unit && (
          <span className="font-mono text-bone-mute text-sm">{unit}</span>
        )}
      </div>
      {sub && (
        <p className="font-mono text-xs text-bone-mute mt-2">{sub}</p>
      )}
    </div>
  );
}

function ActivityRow({ activity: a }: { activity: GhostActivity }) {
  const distKm = a.distanceM / 1000;
  const pace = a.movingTimeS > 0 && distKm > 0 ? a.movingTimeS / distKm : null;

  return (
    <div className="px-6 py-3 grid grid-cols-[48px_1fr_80px_80px_56px_40px] gap-3 items-center">
      <span className="font-display tracking-widest uppercase text-bone-dim text-sm">
        {activityDowLabel(a.startDate)}
      </span>
      <div>
        <div className="text-bone text-sm truncate">{a.name}</div>
        <div className="font-mono text-xs text-bone-mute mt-0.5">{a.type}</div>
      </div>
      <span className="font-mono tabular-nums text-bone text-sm">
        {distanceLabel(distKm)}
      </span>
      <span className="font-mono tabular-nums text-bone-dim text-sm">
        {pace ? `${formatSpk(pace)}/km` : '—'}
      </span>
      <span className="font-mono tabular-nums text-bone-mute text-xs">
        {a.avgHr ? `${Math.round(a.avgHr)} bpm` : '—'}
      </span>
      {a.stravaId ? (
        <a
          href={`https://www.strava.com/activities/${a.stravaId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-bone-mute hover:text-accent transition-colors"
          title="View on Strava"
        >
          ↗
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

function RaceCountdown({ race }: { race: { date: string; name: string; distanceKm: number } }) {
  const days = daysUntil(race.date);
  const distLabel =
    Math.abs(race.distanceKm - 42.195) < 0.1 ? 'Marathon'
    : Math.abs(race.distanceKm - 21.0975) < 0.1 ? 'Half marathon'
    : `${race.distanceKm}K`;

  return (
    <div className="flex items-center gap-3">
      <span className="font-display tracking-widest text-xl uppercase text-accent">
        {days}d
      </span>
      <span className="font-mono text-xs text-bone-mute">
        until {race.name} · {distLabel}
      </span>
      <Link
        to="/race"
        className="font-mono text-xs text-bone-mute hover:text-accent transition-colors border border-ink-line hover:border-accent px-2 py-0.5"
      >
        Race plan →
      </Link>
    </div>
  );
}
