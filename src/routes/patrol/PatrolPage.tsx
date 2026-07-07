import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import {
  getActivitiesInRange,
  getTotalActivityCount,
  getNextRace,
  getActivePlanPeriod,
  aggregateWeekStats,
  type GhostActivity,
  type WeekStats,
  type ActivePlanPeriod,
} from '@/lib/analysis/week-queries';
import { formatSpk } from '@/lib/plans/derive';
import { ENGINES, type Dojo } from '@/lib/plans/index';
import type { WeekTemplate, DayPlan, PlanParams } from '@/lib/plans/types';
import { getFrameworkStats, type FrameworkStat } from '@/lib/analysis/framework-stats';
import type { Activity } from '@/lib/db/schema';
import type { ProgramPhase } from '@/lib/plans/program-phase';
import { evaluateWeek, type WeekCompliance, type ComplianceFlag } from '@/lib/analysis/compliance';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentWeekRange(): { startIso: string; endIso: string } {
  const now = new Date();
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { startIso: localIso(mon), endIso: localIso(sun) };
}

function todayDow(): number {
  return (new Date().getDay() + 6) % 7; // Mon=0, Sun=6
}

function weekDayDate(weekStartIso: string, dow: number): string {
  const d = new Date(weekStartIso + 'T12:00:00');
  d.setDate(d.getDate() + dow);
  return String(d.getDate());
}

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' });
  const year = new Date(endIso + 'T12:00:00').getFullYear();
  return `${fmt(startIso)} â€” ${fmt(endIso)} ${year}`;
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const race = new Date(dateIso + 'T12:00:00');
  race.setHours(0, 0, 0, 0);
  return Math.round((race.getTime() - today.getTime()) / 86_400_000);
}

function activityDow(startDate: string): number {
  const d = new Date(startDate.includes('T') ? startDate : startDate + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

// ---------------------------------------------------------------------------
// Plan derivation
// ---------------------------------------------------------------------------

function weekNumber(startDate: string, todayIso: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(todayIso + 'T00:00:00');
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

function derivePlanParams(plan: ActivePlanPeriod): PlanParams {
  return {
    goalDistanceKm: plan.goalDistanceKm ?? 42.195,
    goalTimeS: plan.goalTimeS ?? 12600,
    level: plan.level,
    programWeeks: plan.programWeeks,
    startDate: plan.startDate,
  };
}

function deriveProgramPhase(plan: ActivePlanPeriod, todayIso: string): ProgramPhase {
  const wk = weekNumber(plan.startDate, todayIso);
  const daysToRace = plan.goalRaceDate ? daysUntil(plan.goalRaceDate) : null;
  return {
    kind: 'program-week-N',
    programWeekNumber: wk,
    programWeeks: plan.programWeeks,
    daysToRace,
    daysSinceRace: null,
    weeksToProgramStart: null,
    label: `Week ${wk} of ${plan.programWeeks}`,
    subline: daysToRace != null ? `${Math.ceil(daysToRace / 7)} wks to race` : '',
  };
}

// Cast GhostActivity[] to the narrow shape framework-stats needs (type, startDateLocal, avgHr, avgSpeedMs)
function asActivities(acts: GhostActivity[]): Activity[] {
  return acts.map((a) => ({
    ...({} as Activity),
    type: a.type,
    startDateLocal: a.startDate,
    avgHr: a.avgHr,
    avgSpeedMs: a.avgSpeedMs,
    distanceM: a.distanceM,
    movingTimeS: a.movingTimeS,
  }));
}


// ---------------------------------------------------------------------------
// Session type metadata
// ---------------------------------------------------------------------------

const SESSION_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  easy:       { label: 'E', color: 'text-signal-ok' },
  recovery:   { label: 'R', color: 'text-bone-dim' },
  long:       { label: 'L', color: 'text-accent' },
  tempo:      { label: 'T', color: 'text-amber-400' },
  interval:   { label: 'I', color: 'text-orange-400' },
  repetition: { label: 'R', color: 'text-red-400' },
  cross:      { label: 'X', color: 'text-bone-mute' },
  strength:   { label: 'S', color: 'text-bone-mute' },
  rest:       { label: 'â€”', color: 'text-bone-dim' },
};

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Compliance flag badge â€” only shown for actionable non-ok results on past days
const COMPLIANCE_FLAG: Partial<Record<ComplianceFlag, { label: string; color: string }>> = {
  fast:  { label: 'FAST',  color: 'text-signal-warn' },
  slow:  { label: 'SLOW',  color: 'text-bone-mute' },
  short: { label: 'SHORT', color: 'text-signal-warn' },
};

// ---------------------------------------------------------------------------
// Compliance status per day
// ---------------------------------------------------------------------------

type DayStatus = 'done' | 'missed' | 'upcoming' | 'today-pending' | 'rest' | 'today-rest';

function computeDayStatus(
  day: DayPlan,
  activitiesOnDay: GhostActivity[],
  dow: number,
  currentDow: number,
): DayStatus {
  const isRest = day.sessions.every((s) => s.type === 'rest' || s.type === 'cross' || s.type === 'strength');
  const hasRun = activitiesOnDay.some((a) => ['Run', 'VirtualRun', 'TrailRun'].includes(a.type));

  if (dow === currentDow) {
    return isRest ? 'today-rest' : hasRun ? 'done' : 'today-pending';
  }
  if (dow < currentDow) {
    return isRest ? 'rest' : hasRun ? 'done' : 'missed';
  }
  return isRest ? 'rest' : 'upcoming';
}

const STATUS_DOT: Record<DayStatus, string> = {
  done:          'â—',
  missed:        'â—‹',
  upcoming:      'â€“',
  'today-pending': 'â—‰',
  rest:          'Â·',
  'today-rest':  'Â·',
};

const STATUS_COLOR: Record<DayStatus, string> = {
  done:          'text-signal-ok',
  missed:        'text-signal-miss',
  upcoming:      'text-bone-dim',
  'today-pending': 'text-accent',
  rest:          'text-bone-dim',
  'today-rest':  'text-bone-dim',
};

// ---------------------------------------------------------------------------
// Page data types
// ---------------------------------------------------------------------------

interface PatrolData {
  hasData: boolean;
  activities: GhostActivity[];
  stats: WeekStats;
  nextRace: { date: string; name: string; distanceKm: number } | null;
  activePlan: ActivePlanPeriod | null;
}

// ---------------------------------------------------------------------------
// PatrolPage
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
      getActivePlanPeriod(),
    ]).then(([count, activities, nextRace, activePlan]) => {
      if (cancelled) return;
      setData({
        hasData: count > 0,
        activities,
        stats: aggregateWeekStats(activities),
        nextRace,
        activePlan,
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
        <PatrolDashboard data={data} startIso={startIso} endIso={endIso} todayIso={todayIso} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NoDataState() {
  return (
    <div className="m3-card p-8 space-y-3">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
        patrol Â· no data yet
      </p>
      <h2 className="font-display tracking-widest text-3xl uppercase text-bone">
        No activities synced
      </h2>
      <p className="font-mono text-sm text-bone-dim max-w-xl leading-relaxed">
        Patrol shows your current week â€” sessions, paces, stats. Pull your activity history from
        Strava first to see anything here.
      </p>
      <Link
        to="/setup"
        className="inline-flex items-center gap-2 mt-2 font-mono text-xs uppercase tracking-widest text-accent hover:text-accent-hover transition-colors"
      >
        Go to setup â†’
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function PatrolDashboard({
  data, startIso, endIso, todayIso,
}: { data: PatrolData; startIso: string; endIso: string; todayIso: string }) {
  const { stats, activities, nextRace, activePlan } = data;
  const currentDow = todayDow();

  // Derive plan â€” memoised so it doesn't recalculate on every render
  const derived = useMemo(() => {
    if (!activePlan) return null;
    const engine = ENGINES[activePlan.dojo as Dojo];
    if (!engine) return null;
    const params = derivePlanParams(activePlan);
    const wk = weekNumber(activePlan.startDate, todayIso);
    const template = engine.renderWeek(params, wk);
    const zones = engine.derivePaceZones(params);
    const programPhase = deriveProgramPhase(activePlan, todayIso);
    const compliance = evaluateWeek(template, asActivities(activities));
    const frameworkStats = getFrameworkStats({
      dojo: activePlan.dojo as Dojo,
      stats,
      template,
      activities: asActivities(activities),
      compliance,
      intensityDist: null,
      programPhase,
      nsReport: null,
      vdot: null,
    });
    return { engine, params, wk, template, zones, programPhase, frameworkStats, compliance };
  }, [activePlan, stats, activities, todayIso]);

  // Group activities by DOW for the week grid
  const byDow = useMemo(() => {
    const map = new Map<number, GhostActivity[]>();
    for (const a of activities) {
      const d = activityDow(a.startDate);
      const arr = map.get(d) ?? [];
      arr.push(a);
      map.set(d, arr);
    }
    return map;
  }, [activities]);

  return (
    <>
      {/* Header */}
      <header className="space-y-3 border-b border-ink-line pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
              dashboard Â· this week
            </p>
            <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
              This Week
            </h1>
            <p className="font-mono text-xs text-bone-mute">
              {formatDateRange(startIso, endIso)}
            </p>
            {derived && (
              <p className="font-mono text-xs text-bone-mute">
                {derived.engine.displayName} Â· week {derived.wk} of {activePlan!.programWeeks}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/setup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 m3-card hover:border-accent text-bone-mute hover:text-accent font-mono text-xs uppercase tracking-widest transition-colors"
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

      {/* Framework stats row â€” dojo-specific if plan active, generic fallback otherwise */}
      {derived ? (
        <FrameworkStatsRow stats={derived.frameworkStats} />
      ) : (
        <GenericStatsRow stats={stats} />
      )}

      {/* Body */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-8">
        {/* Week plan grid */}
        {derived ? (
          <WeekPlanGrid
            template={derived.template}
            compliance={derived.compliance}
            byDow={byDow}
            startIso={startIso}
            currentDow={currentDow}
          />
        ) : (
          <SessionList activities={activities} />
        )}

        {/* Right column */}
        <div className="space-y-5">
          <TonightMission
            template={derived?.template ?? null}
            currentDow={currentDow}
            activePlan={activePlan}
            activitiesOnDow={byDow.get(currentDow) ?? []}
          />

          {!nextRace && (
            <div className="m3-card p-5 space-y-2">
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
                + Book a race â†’
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Framework stats â€” dojo-specific
// ---------------------------------------------------------------------------

function FrameworkStatsRow({ stats }: { stats: FrameworkStat[] }) {
  const statusColor = (s?: FrameworkStat['status']) => {
    switch (s) {
      case 'ok':      return 'text-signal-ok';
      case 'warn':    return 'text-amber-400';
      case 'miss':    return 'text-signal-miss';
      case 'neutral':
      default:        return 'text-bone';
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line m3-card">
      {stats.map((s, i) => (
        <div key={i} className="bg-ink p-6">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-2">{s.label}</p>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-display tracking-widest text-4xl leading-none ${statusColor(s.status)}`}>
              {s.value}
            </span>
            {s.unit && (
              <span className="font-mono text-bone-mute text-sm">{s.unit}</span>
            )}
          </div>
          {s.subline && (
            <p className="font-mono text-xs text-bone-mute mt-2">{s.subline}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function GenericStatsRow({ stats }: { stats: WeekStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line m3-card">
      <StatBox label="this week" value={stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0'} unit="km" accent={stats.totalKm > 0} sub={`${stats.totalSessions} session${stats.totalSessions === 1 ? '' : 's'}`} />
      <StatBox label="long run" value={stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : 'â€”'} unit={stats.longRunKm > 0 ? 'km' : ''} sub={stats.longRunKm > 0 ? 'longest run' : 'pending'} />
      <StatBox label="avg pace" value={stats.avgPaceSpk ? formatSpk(stats.avgPaceSpk) : 'â€”:â€”'} unit={stats.avgPaceSpk ? '/km' : ''} sub="running pace" />
      <StatBox label="avg hr" value={stats.avgHr ? Math.round(stats.avgHr).toString() : 'â€”'} unit={stats.avgHr ? 'bpm' : ''} sub={stats.avgHr ? 'weighted by time' : 'no HR data'} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week plan grid (compliance matrix)
// ---------------------------------------------------------------------------

function WeekPlanGrid({
  template, compliance, byDow, startIso, currentDow,
}: {
  template: WeekTemplate;
  compliance: WeekCompliance;
  byDow: Map<number, GhostActivity[]>;
  startIso: string;
  currentDow: number;
}) {
  const dow7 = [0, 1, 2, 3, 4, 5, 6] as const;

  return (
    <div className="m3-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ink-line">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          week plan Â· {template.phaseName}
        </span>
        <span className="font-mono text-xs text-bone-mute">
          {template.totalKmTarget} km target
        </span>
      </div>

      <div className="divide-y divide-ink-line">
        {dow7.map((dow) => {
          const dayPlan = template.days.find((d) => d.dow === dow);
          const dayActivities = byDow.get(dow) ?? [];
          const status = dayPlan
            ? computeDayStatus(dayPlan, dayActivities, dow, currentDow)
            : 'upcoming';
          const isToday = dow === currentDow;
          const dateNum = weekDayDate(startIso, dow);
          // Compliance flags for this day â€” only meaningful for past days with sessions
          const complianceDay = compliance.days.find((cd) => cd.dow === dow);
          const sessionFlags = complianceDay?.sessions
            .map((sc) => COMPLIANCE_FLAG[sc.flag])
            .filter(Boolean) ?? [];

          return (
            <div
              key={dow}
              className={`px-6 py-3 grid grid-cols-[56px_1fr_auto] gap-3 items-start ${isToday ? 'bg-ink-line/30' : ''}`}
            >
              {/* Day label */}
              <div className={`font-display tracking-widest uppercase text-sm ${isToday ? 'text-accent' : 'text-bone-dim'}`}>
                <div>{DOW_LABELS[dow]}</div>
                <div className="font-mono text-xs tracking-normal text-bone-mute">{dateNum}</div>
              </div>

              {/* Plan + actuals */}
              <div className="space-y-1">
                {dayPlan && (
                  <div className="flex items-center gap-2">
                    {dayPlan.sessions.map((s, si) => {
                      const badge = SESSION_TYPE_BADGE[s.type ?? 'rest'] ?? SESSION_TYPE_BADGE.rest;
                      return (
                        <span key={si} className="flex items-center gap-1.5">
                          <span className={`font-display text-xs uppercase ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="font-mono text-xs text-bone-dim truncate max-w-[180px]">
                            {s.label}
                            {s.distanceKmMin != null && s.distanceKmMax != null && ` Â· ${s.distanceKmMin.toFixed(0)}â€“${s.distanceKmMax.toFixed(0)}km`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {dayActivities.filter((a) => ['Run', 'VirtualRun', 'TrailRun'].includes(a.type)).map((a, ai) => {
                  const km = a.distanceM / 1000;
                  const pace = a.movingTimeS > 0 && km > 0 ? a.movingTimeS / km : null;
                  return (
                    <div key={ai} className="flex items-center gap-2 text-xs font-mono text-bone">
                      <span>{km.toFixed(1)} km</span>
                      {pace && <span className="text-bone-mute">{formatSpk(pace)}/km</span>}
                      {a.avgHr && <span className="text-bone-mute">{Math.round(a.avgHr)} bpm</span>}
                    </div>
                  );
                })}

                {dayActivities.length === 0 && status !== 'rest' && status !== 'today-rest' && (
                  <span className="font-mono text-xs text-bone-mute">
                    {status === 'upcoming' ? 'upcoming' : status === 'today-pending' ? 'pending' : 'nothing logged'}
                  </span>
                )}

                {/* Compliance flags â€” only shown for past done days with non-ok evaluations */}
                {status === 'done' && sessionFlags.length > 0 && (
                  <div className="flex gap-1.5 mt-0.5">
                    {sessionFlags.map((f, fi) => (
                      <span key={fi} className={`font-mono text-[10px] uppercase tracking-widest ${f!.color}`}>
                        {f!.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status dot */}
              <div className={`font-mono text-base mt-0.5 ${STATUS_COLOR[status]}`}>
                {STATUS_DOT[status]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session list (fallback when no plan)
// ---------------------------------------------------------------------------

function SessionList({ activities }: { activities: GhostActivity[] }) {
  return (
    <div className="m3-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ink-line">
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          sessions this week
        </span>
        <span className="font-mono text-xs text-bone-mute">{activities.length} logged</span>
      </div>
      {activities.length === 0 ? (
        <div className="px-6 py-8 font-mono text-sm text-bone-mute">
          Nothing logged yet this week.
        </div>
      ) : (
        <div className="divide-y divide-ink-line">
          {activities.map((a, i) => <ActivityRow key={i} activity={a} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tonight's mission
// ---------------------------------------------------------------------------

function TonightMission({
  template, currentDow, activePlan, activitiesOnDow,
}: {
  template: WeekTemplate | null;
  currentDow: number;
  activePlan: ActivePlanPeriod | null;
  activitiesOnDow: GhostActivity[];
}) {
  if (!template || !activePlan) {
    return (
      <div className="border border-accent/40 p-5 space-y-3">
        <p className="font-mono text-xs text-accent uppercase tracking-widest">tonight's mission</p>
        <div className="font-display tracking-widest text-2xl uppercase text-bone">No plan set</div>
        <p className="font-mono text-xs text-bone-mute leading-relaxed">
          Configure a training plan in Dojo to see tonight's session prescription here.
        </p>
        <Link to="/dojo" className="inline-block font-mono text-xs text-bone-dim hover:text-accent transition-colors">
          Open Dojo â†’
        </Link>
      </div>
    );
  }

  const dayPlan = template.days.find((d) => d.dow === currentDow);
  const doneRuns = activitiesOnDow.filter((a) => ['Run', 'VirtualRun', 'TrailRun'].includes(a.type));
  const isRest = !dayPlan || dayPlan.sessions.every((s) => s.type === 'rest');
  const isDone = doneRuns.length > 0;

  return (
    <div className={`border p-5 space-y-3 ${isDone ? 'border-signal-ok/40' : 'border-accent/40'}`}>
      <p className="font-mono text-xs text-accent uppercase tracking-widest">tonight's mission</p>

      {isDone ? (
        <>
          <div className="font-display tracking-widest text-2xl uppercase text-signal-ok">Done âœ“</div>
          <div className="space-y-1">
            {doneRuns.map((a, i) => {
              const km = a.distanceM / 1000;
              const pace = a.movingTimeS > 0 && km > 0 ? a.movingTimeS / km : null;
              const line = `${a.name} Â· ${km.toFixed(1)} km${pace ? ` Â· ${formatSpk(pace)}/km` : ''}`;
              return a.stravaId ? (
                <a
                  key={i}
                  href={`https://www.strava.com/activities/${a.stravaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono text-xs text-bone-dim hover:text-accent transition-colors"
                >
                  {line} â†—
                </a>
              ) : (
                <p key={i} className="font-mono text-xs text-bone-dim">{line}</p>
              );
            })}
          </div>
        </>
      ) : isRest ? (
        <>
          <div className="font-display tracking-widest text-2xl uppercase text-bone-dim">Rest day</div>
          <p className="font-mono text-xs text-bone-mute">No session scheduled. Recover well.</p>
        </>
      ) : (
        <>
          <div className="font-display tracking-widest text-xl uppercase text-bone leading-tight">
            {dayPlan!.sessions[0]?.label ?? 'Training session'}
          </div>
          <div className="space-y-1">
            {dayPlan!.sessions.map((s, si) => {
              const badge = SESSION_TYPE_BADGE[s.type ?? 'rest'] ?? SESSION_TYPE_BADGE.rest;
              const distInfo = s.distanceKmMin != null && s.distanceKmMax != null
                ? `${s.distanceKmMin.toFixed(0)}â€“${s.distanceKmMax.toFixed(0)} km`
                : s.distanceKmMin != null ? `${s.distanceKmMin.toFixed(0)}+ km`
                : s.durationMinMin != null ? `${s.durationMinMin}â€“${s.durationMinMax ?? s.durationMinMin} min`
                : null;
              return (
                <div key={si} className="flex items-center gap-2">
                  <span className={`font-display text-xs uppercase ${badge.color}`}>{badge.label}</span>
                  <span className="font-mono text-xs text-bone-dim">{s.type}</span>
                  {distInfo && <span className="font-mono text-xs text-bone-mute">Â· {distInfo}</span>}
                </div>
              );
            })}
            {dayPlan!.sessions[0]?.notes && (
              <p className="font-mono text-xs text-bone-mute leading-relaxed pt-1">
                {dayPlan!.sessions[0].notes}
              </p>
            )}
          </div>

          {/* strava://record opens the app's record screen â€” the scheme only
              resolves on phones with Strava installed, so mobile-only. */}
          <a
            href="strava://record"
            className="sm:hidden inline-flex items-center gap-2 mt-1 px-4 py-2.5 m3-btn-outline text-accent font-mono text-xs uppercase tracking-widest active:bg-accent active:text-ink transition-colors"
          >
            â–¶ Record on Strava
          </a>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({ label, value, unit, accent, sub }: { label: string; value: string; unit: string; accent?: boolean; sub?: string }) {
  return (
    <div className="bg-ink p-6">
      <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display tracking-widest text-4xl leading-none ${accent ? 'text-accent' : 'text-bone'}`}>
          {value}
        </span>
        {unit && <span className="font-mono text-bone-mute text-sm">{unit}</span>}
      </div>
      {sub && <p className="font-mono text-xs text-bone-mute mt-2">{sub}</p>}
    </div>
  );
}

function ActivityRow({ activity: a }: { activity: GhostActivity }) {
  const distKm = a.distanceM / 1000;
  const pace = a.movingTimeS > 0 && distKm > 0 ? a.movingTimeS / distKm : null;
  const dow = DOW_LABELS[activityDow(a.startDate)] ?? '?';

  const stravaLink = a.stravaId ? (
    <a href={`https://www.strava.com/activities/${a.stravaId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-bone-mute hover:text-accent transition-colors" title="View on Strava">â†—</a>
  ) : <span />;

  return (
    <div className="px-4 sm:px-6 py-3">
      {/* The fixed columns sum past a phone's width, so mobile gets a
          two-line layout and the full grid starts at sm. */}
      <div className="grid grid-cols-[40px_1fr_24px] sm:grid-cols-[48px_1fr_80px_80px_56px_40px] gap-3 items-center">
        <span className="font-display tracking-widest uppercase text-bone-dim text-sm">{dow}</span>
        <div className="min-w-0">
          <div className="text-bone text-sm truncate">{a.name}</div>
          <div className="font-mono text-xs text-bone-mute mt-0.5">{a.type}</div>
        </div>
        <span className="hidden sm:block font-mono tabular-nums text-bone text-sm">{distKm.toFixed(1)} km</span>
        <span className="hidden sm:block font-mono tabular-nums text-bone-dim text-sm">{pace ? `${formatSpk(pace)}/km` : 'â€”'}</span>
        <span className="hidden sm:block font-mono tabular-nums text-bone-mute text-xs">{a.avgHr ? `${Math.round(a.avgHr)} bpm` : 'â€”'}</span>
        {stravaLink}
      </div>
      {/* Mobile stats line, aligned under the name column */}
      <div className="sm:hidden pl-[52px] mt-1 font-mono tabular-nums text-xs text-bone-dim">
        {distKm.toFixed(1)} km{pace ? ` Â· ${formatSpk(pace)}/km` : ''}{a.avgHr ? ` Â· ${Math.round(a.avgHr)} bpm` : ''}
      </div>
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
      <span className="font-display tracking-widest text-xl uppercase text-accent">{days}d</span>
      <span className="font-mono text-xs text-bone-mute">until {race.name} Â· {distLabel}</span>
      <Link to="/race" className="font-mono text-xs text-bone-mute hover:text-accent transition-colors m3-card hover:border-accent px-2 py-0.5">
        Race plan â†’
      </Link>
    </div>
  );
}
