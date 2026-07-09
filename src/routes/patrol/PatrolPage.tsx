import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { streamCoachReply } from '@/lib/ai/coach-client';
import { buildAthleteSnapshot } from '@/lib/ai/snapshot-builder';
import { snapshotToText } from '@/lib/ai/context-pure';
import { getSetting, setSetting } from '@/lib/db/settings';
import { saveCoachSession } from '@/lib/ai/coaching-memory';
import {
  getLatestActivityForReview,
  activityToCoachContext,
  checkLastWeekCompliance,
  parseAdjustmentMarker,
} from '@/lib/ai/coach-triggers';
import type { ActivityForReview, ComplianceWeekResult, CoachAdjustment } from '@/lib/ai/coach-triggers';
import { applyCoachAdjustment } from '@/lib/db/plan-adjuster';
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
import type { Activity } from '@/lib/db/types';
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
  return `${fmt(startIso)} — ${fmt(endIso)} ${year}`;
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
  rest:       { label: '—', color: 'text-bone-dim' },
};

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Compliance flag badge — only shown for actionable non-ok results on past days
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
  done:          '●',
  missed:        '○',
  upcoming:      '–',
  'today-pending': '◉',
  rest:          '·',
  'today-rest':  '·',
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
// Coach briefing card
// ---------------------------------------------------------------------------

const WORKER_URL_PATROL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

type CoachState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

function CoachBriefingCard() {
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleGetBrief() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCoachState('loading');
    setText('');

    try {
      const [snapshot, athleteIdRaw, modelRaw] = await Promise.all([
        buildAthleteSnapshot(),
        getSetting('strava_athlete_id'),
        getSetting('ai_coach_model'),
      ]);

      const athleteId = athleteIdRaw ? Number(athleteIdRaw) : 0;
      const model = modelRaw ?? 'claude-haiku-4-5-20251001';
      const context = snapshotToText(snapshot);

      setCoachState('streaming');

      const gen = streamCoachReply(
        { athleteId, context, question: 'Give me a brief coaching note for this week.', model },
        ctrl.signal,
      );

      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        setText((prev) => prev + chunk);
      }

      if (!ctrl.signal.aborted) {
        setCoachState('done');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setCoachState('error');
    }
  }

  return (
    <div className="rounded-2xl bg-surface-container p-5 mt-4">
      <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-3">
        ai coach · weekly brief
      </p>

      {coachState === 'idle' && (
        <button
          type="button"
          onClick={() => { void handleGetBrief(); }}
          className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 text-sm font-mono uppercase tracking-widest hover:shadow-sm transition-all"
        >
          Get weekly brief
        </button>
      )}

      {coachState === 'loading' && (
        <p className="font-mono text-xs text-on-surface-variant animate-pulse">
          Thinking…
        </p>
      )}

      {(coachState === 'streaming' || coachState === 'done') && (
        <div>
          <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
            {text}
            {coachState === 'streaming' && (
              <span className="animate-pulse">|</span>
            )}
          </p>
          {coachState === 'done' && (
            <button
              type="button"
              onClick={() => { setText(''); setCoachState('idle'); }}
              className="mt-3 font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
            >
              Ask again
            </button>
          )}
        </div>
      )}

      {coachState === 'error' && (
        <p className="text-on-surface-variant text-sm">Coach unavailable</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// T2 — Activity review card
// ---------------------------------------------------------------------------

interface ActivityReviewCardProps {
  athleteId: number;
  model: string;
  snapshotContext: string;
}

function ActivityReviewCard({ athleteId, model, snapshotContext }: ActivityReviewCardProps) {
  const [activity, setActivity] = useState<ActivityForReview | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkLatest() {
      const latest = await getLatestActivityForReview();
      if (!latest || cancelled) return;
      const lastReviewed = await getSetting('last_reviewed_activity');
      if (lastReviewed === null || lastReviewed !== String(latest.stravaId)) {
        setActivity(latest);
      }
    }
    checkLatest().catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  if (!activity || dismissed) return null;

  const distKm = activity.distanceM / 1000;
  const paceSpk =
    activity.movingTimeS > 0 && distKm > 0 ? activity.movingTimeS / distKm : null;
  const durationMin = Math.round(activity.movingTimeS / 60);

  async function handleGetFeedback() {
    if (!activity) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCoachState('loading');
    setText('');
    try {
      const activityContext = activityToCoachContext(activity);
      const fullContext = `${activityContext}\n\n${snapshotContext}`;
      setCoachState('streaming');
      const gen = streamCoachReply(
        {
          athleteId,
          context: fullContext,
          question:
            'Review this training session against my committed goal and current plan. Be honest about execution quality.',
          model,
        },
        ctrl.signal,
      );
      let fullText = '';
      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        fullText += chunk;
        setText(fullText);
      }
      if (!ctrl.signal.aborted) {
        setCoachState('done');
        await saveCoachSession({
          sessionType: 'activity_review',
          referenceDate: activity.date,
          response: fullText,
        });
        await setSetting('last_reviewed_activity', String(activity.stravaId));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setCoachState('error');
    }
  }

  async function handleDismiss() {
    if (!activity) return;
    await setSetting('last_reviewed_activity', String(activity.stravaId));
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl bg-surface-container p-5 mt-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">
          ai coach · activity review
        </p>
        {coachState === 'idle' && (
          <button
            type="button"
            onClick={() => { void handleDismiss(); }}
            aria-label="Skip activity review"
            className="font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors leading-none"
          >
            Skip
          </button>
        )}
      </div>

      <p className="text-on-surface text-sm font-medium mb-2 truncate">{activity.name}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4">
        <div>
          <span className="text-on-surface-variant text-xs">Distance</span>
          <span className="ml-1.5 text-on-surface text-sm tabular-nums">
            {distKm.toFixed(2)} km
          </span>
        </div>
        <div>
          <span className="text-on-surface-variant text-xs">Time</span>
          <span className="ml-1.5 text-on-surface text-sm tabular-nums">{durationMin} min</span>
        </div>
        {paceSpk && (
          <div>
            <span className="text-on-surface-variant text-xs">Pace</span>
            <span className="ml-1.5 text-on-surface text-sm tabular-nums">
              {formatSpk(paceSpk)}/km
            </span>
          </div>
        )}
        {activity.avgHr && (
          <div>
            <span className="text-on-surface-variant text-xs">HR</span>
            <span className="ml-1.5 text-on-surface text-sm tabular-nums">
              {Math.round(activity.avgHr)} bpm
            </span>
          </div>
        )}
      </div>

      {coachState === 'idle' && (
        <button
          type="button"
          onClick={() => { void handleGetFeedback(); }}
          className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 text-sm font-mono uppercase tracking-widest hover:shadow-sm transition-all"
        >
          Get coach feedback
        </button>
      )}
      {coachState === 'loading' && (
        <p className="font-mono text-xs text-on-surface-variant animate-pulse">Thinking&hellip;</p>
      )}
      {(coachState === 'streaming' || coachState === 'done') && (
        <div>
          <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
            {text}
            {coachState === 'streaming' && <span className="animate-pulse">|</span>}
          </p>
          {coachState === 'done' && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="mt-3 font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {coachState === 'error' && (
        <p className="text-on-surface-variant text-sm">Coach review unavailable</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// T3 — Compliance coaching card
// ---------------------------------------------------------------------------

interface ComplianceCoachCardProps {
  athleteId: number;
  model: string;
  snapshotContext: string;
}

function ComplianceCoachCard({ athleteId, model, snapshotContext }: ComplianceCoachCardProps) {
  const [result, setResult] = useState<ComplianceWeekResult | null>(null);
  const [coachState, setCoachState] = useState<CoachState>('idle');
  const [text, setText] = useState('');
  const [adjustment, setAdjustment] = useState<CoachAdjustment | null>(null);
  const [adjustApplied, setAdjustApplied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    checkLastWeekCompliance()
      .then((r) => { if (r.needsCoaching) setResult(r); })
      .catch(() => { /* non-critical */ });
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  if (!result) return null;

  const { completed, planned, score, weekStart } = result;
  const scoreColor = score < 0.4 ? 'text-error' : 'text-signal-warn';

  async function handleAnalyse() {
    if (!result) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCoachState('loading');
    setText('');
    setAdjustment(null);
    setAdjustApplied(false);
    try {
      setCoachState('streaming');
      const gen = streamCoachReply(
        {
          athleteId,
          context: snapshotContext,
          question: `Last week I completed ${completed} of ${planned} planned sessions. Analyse what happened based on my training data and biometrics, and tell me what to adjust.`,
          model,
        },
        ctrl.signal,
      );
      let fullText = '';
      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        fullText += chunk;
        setText(fullText);
      }
      if (!ctrl.signal.aborted) {
        setCoachState('done');
        const parsed = parseAdjustmentMarker(fullText);
        let adjustmentJson: string | null = null;
        if (parsed) {
          setAdjustment(parsed);
          adjustmentJson = JSON.stringify(parsed);
        }
        await saveCoachSession({
          sessionType: 'compliance_check',
          referenceDate: weekStart,
          response: fullText,
          adjustmentJson,
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setCoachState('error');
    }
  }

  async function handleApplyAdjustment() {
    if (!adjustment) return;
    await applyCoachAdjustment(adjustment);
    setAdjustApplied(true);
  }

  return (
    <div className="rounded-2xl bg-surface-container p-5 mt-4">
      <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-3">
        ai coach · last week
      </p>
      <p className="text-on-surface text-sm mb-4">
        Last week:{' '}
        <span className={scoreColor}>
          {completed}/{planned} sessions
        </span>
      </p>

      {coachState === 'idle' && (
        <button
          type="button"
          onClick={() => { void handleAnalyse(); }}
          className="rounded-full bg-secondary-container text-on-secondary-container px-5 py-2.5 text-sm font-mono uppercase tracking-widest hover:shadow-sm transition-all"
        >
          Analyse with coach
        </button>
      )}
      {coachState === 'loading' && (
        <p className="font-mono text-xs text-on-surface-variant animate-pulse">Thinking&hellip;</p>
      )}
      {(coachState === 'streaming' || coachState === 'done') && (
        <div className="space-y-3">
          <p className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
            {text}
            {coachState === 'streaming' && <span className="animate-pulse">|</span>}
          </p>
          {coachState === 'done' && adjustment && !adjustApplied && (
            <button
              type="button"
              onClick={() => { void handleApplyAdjustment(); }}
              className="inline-flex items-center bg-secondary-container text-on-secondary-container rounded-full px-4 py-1.5 text-sm hover:shadow-sm transition-all"
            >
              Apply: {adjustment.description}
            </button>
          )}
          {adjustApplied && (
            <p className="font-mono text-xs text-signal-ok">Adjustment applied to your plan.</p>
          )}
        </div>
      )}
      {coachState === 'error' && (
        <p className="text-on-surface-variant text-sm">Coach analysis unavailable</p>
      )}
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

  const [coachEnabled, setCoachEnabled] = useState<boolean | null>(null);
  const [coachAthleteId, setCoachAthleteId] = useState(0);
  const [coachModel, setCoachModel] = useState('claude-haiku-4-5-20251001');
  const [coachContext, setCoachContext] = useState('');

  useEffect(() => {
    if (WORKER_URL_PATROL === '') {
      setCoachEnabled(false);
      return;
    }
    Promise.all([
      getSetting('ai_coach_enabled'),
      getSetting('strava_athlete_id'),
      getSetting('ai_coach_model'),
      buildAthleteSnapshot().then(snapshotToText),
    ]).then(([enabled, athleteIdRaw, modelRaw, ctx]) => {
      setCoachEnabled(enabled !== '0');
      setCoachAthleteId(athleteIdRaw ? Number(athleteIdRaw) : 0);
      setCoachModel(modelRaw ?? 'claude-haiku-4-5-20251001');
      setCoachContext(ctx);
    }).catch(() => setCoachEnabled(false));
  }, []);

  // Derive plan — memoised so it doesn't recalculate on every render
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
              dashboard · this week
            </p>
            <h1 className="font-display tracking-widest text-4xl uppercase leading-none text-bone">
              This Week
            </h1>
            <p className="font-mono text-xs text-bone-mute">
              {formatDateRange(startIso, endIso)}
            </p>
            {derived && (
              <p className="font-mono text-xs text-bone-mute">
                {derived.engine.displayName} · week {derived.wk} of {activePlan!.programWeeks}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to="/setup"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 bg-secondary-container text-on-secondary-container hover:shadow-sm font-mono text-xs uppercase tracking-widest transition-all"
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

      {/* Framework stats row — dojo-specific if plan active, generic fallback otherwise */}
      {derived ? (
        <FrameworkStatsRow stats={derived.frameworkStats} />
      ) : (
        <GenericStatsRow stats={stats} />
      )}

      {/* AI Coach cards — only when worker is configured and coach is enabled */}
      {coachEnabled === true && (
        <>
          {/* Weekly brief */}
          <CoachBriefingCard />
          {/* T2 — Activity review: latest unreviewed activity after sync */}
          <ActivityReviewCard
            athleteId={coachAthleteId}
            model={coachModel}
            snapshotContext={coachContext}
          />
          {/* T3 — Compliance coaching: shown when last week score < 0.6 */}
          <ComplianceCoachCard
            athleteId={coachAthleteId}
            model={coachModel}
            snapshotContext={coachContext}
          />
        </>
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
// Framework stats — dojo-specific
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {stats.map((s, i) => (
        <div key={i} className="bg-surface-container rounded-xl p-4 sm:p-5">
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <StatBox label="this week" value={stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0'} unit="km" accent={stats.totalKm > 0} sub={`${stats.totalSessions} session${stats.totalSessions === 1 ? '' : 's'}`} />
      <StatBox label="long run" value={stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '—'} unit={stats.longRunKm > 0 ? 'km' : ''} sub={stats.longRunKm > 0 ? 'longest run' : 'pending'} />
      <StatBox label="avg pace" value={stats.avgPaceSpk ? formatSpk(stats.avgPaceSpk) : '—:—'} unit={stats.avgPaceSpk ? '/km' : ''} sub="running pace" />
      <StatBox label="avg hr" value={stats.avgHr ? Math.round(stats.avgHr).toString() : '—'} unit={stats.avgHr ? 'bpm' : ''} sub={stats.avgHr ? 'weighted by time' : 'no HR data'} />
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
          week plan · {template.phaseName}
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
          // Compliance flags for this day — only meaningful for past days with sessions
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
                            {s.distanceKmMin != null && s.distanceKmMax != null && ` · ${s.distanceKmMin.toFixed(0)}–${s.distanceKmMax.toFixed(0)}km`}
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

                {/* Compliance flags — only shown for past done days with non-ok evaluations */}
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
      <div className="rounded-2xl bg-primary-container/40 p-5 space-y-3">
        <p className="font-mono text-xs text-accent uppercase tracking-widest">tonight's mission</p>
        <div className="font-display tracking-widest text-2xl uppercase text-bone">No plan set</div>
        <p className="font-mono text-xs text-bone-mute leading-relaxed">
          Configure a training plan in Dojo to see tonight's session prescription here.
        </p>
        <Link to="/dojo" className="inline-block font-mono text-xs text-bone-dim hover:text-accent transition-colors">
          Open Dojo →
        </Link>
      </div>
    );
  }

  const dayPlan = template.days.find((d) => d.dow === currentDow);
  const doneRuns = activitiesOnDow.filter((a) => ['Run', 'VirtualRun', 'TrailRun'].includes(a.type));
  const isRest = !dayPlan || dayPlan.sessions.every((s) => s.type === 'rest');
  const isDone = doneRuns.length > 0;

  return (
    <div className={`rounded-2xl p-5 space-y-3 ${isDone ? 'bg-signal-ok/10' : 'bg-primary-container/40'}`}>
      <p className="font-mono text-xs text-accent uppercase tracking-widest">tonight's mission</p>

      {isDone ? (
        <>
          <div className="font-display tracking-widest text-2xl uppercase text-signal-ok">Done ✓</div>
          <div className="space-y-1">
            {doneRuns.map((a, i) => {
              const km = a.distanceM / 1000;
              const pace = a.movingTimeS > 0 && km > 0 ? a.movingTimeS / km : null;
              const line = `${a.name} · ${km.toFixed(1)} km${pace ? ` · ${formatSpk(pace)}/km` : ''}`;
              return a.stravaId ? (
                <a
                  key={i}
                  href={`https://www.strava.com/activities/${a.stravaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono text-xs text-bone-dim hover:text-accent transition-colors"
                >
                  {line} ↗
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
                ? `${s.distanceKmMin.toFixed(0)}–${s.distanceKmMax.toFixed(0)} km`
                : s.distanceKmMin != null ? `${s.distanceKmMin.toFixed(0)}+ km`
                : s.durationMinMin != null ? `${s.durationMinMin}–${s.durationMinMax ?? s.durationMinMin} min`
                : null;
              return (
                <div key={si} className="flex items-center gap-2">
                  <span className={`font-display text-xs uppercase ${badge.color}`}>{badge.label}</span>
                  <span className="font-mono text-xs text-bone-dim">{s.type}</span>
                  {distInfo && <span className="font-mono text-xs text-bone-mute">· {distInfo}</span>}
                </div>
              );
            })}
            {dayPlan!.sessions[0]?.notes && (
              <p className="font-mono text-xs text-bone-mute leading-relaxed pt-1">
                {dayPlan!.sessions[0].notes}
              </p>
            )}
          </div>

          {/* strava://record opens the app's record screen — the scheme only
              resolves on phones with Strava installed, so mobile-only. */}
          <a
            href="strava://record"
            className="sm:hidden inline-flex items-center gap-2 mt-1 rounded-full px-6 py-2.5 bg-primary text-on-primary font-bold font-mono text-xs uppercase tracking-widest active:opacity-90 transition-all"
          >
            ▶ Record on Strava
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
    <div className="bg-surface-container rounded-xl p-4 sm:p-5">
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
    <a href={`https://www.strava.com/activities/${a.stravaId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-bone-mute hover:text-accent transition-colors" title="View on Strava">↗</a>
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
        <span className="hidden sm:block font-mono tabular-nums text-bone-dim text-sm">{pace ? `${formatSpk(pace)}/km` : '—'}</span>
        <span className="hidden sm:block font-mono tabular-nums text-bone-mute text-xs">{a.avgHr ? `${Math.round(a.avgHr)} bpm` : '—'}</span>
        {stravaLink}
      </div>
      {/* Mobile stats line, aligned under the name column */}
      <div className="sm:hidden pl-[52px] mt-1 font-mono tabular-nums text-xs text-bone-dim">
        {distKm.toFixed(1)} km{pace ? ` · ${formatSpk(pace)}/km` : ''}{a.avgHr ? ` · ${Math.round(a.avgHr)} bpm` : ''}
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
      <span className="font-mono text-xs text-bone-mute">until {race.name} · {distLabel}</span>
      <Link to="/race" className="font-mono text-xs rounded-full px-3 py-1 bg-secondary-container text-on-secondary-container hover:shadow-sm transition-all">
        Race plan →
      </Link>
    </div>
  );
}
