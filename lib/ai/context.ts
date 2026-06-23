import 'server-only';
import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { getAthleteState } from '@/lib/analysis/athlete-state';
import { getActivitiesInRange, aggregateWeekStats } from '@/lib/analysis/week-queries';
import { getActivePlan, currentWeekNumber, currentWeekRange } from '@/lib/plans/active-plan';
import { getProgramPhase } from '@/lib/plans/program-phase';
import { getInterruptionsView } from '@/lib/analysis/interruptions';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { formatBand } from '@/lib/plans/derive';
import type { SessionTarget } from '@/lib/plans/types';
import type { AthleteSnapshot, RecentActivitySnapshot } from './context-pure';

function prescription(t: SessionTarget): string {
  if (t.paceZone && t.distanceKmMin != null && t.distanceKmMax != null) {
    const d =
      t.distanceKmMin === t.distanceKmMax
        ? `${t.distanceKmMin.toFixed(1)}km`
        : `${t.distanceKmMin.toFixed(1)}–${t.distanceKmMax.toFixed(1)}km`;
    return `${d} @ ${formatBand(t.paceZone)}`;
  }
  if (t.durationMinMin != null && t.durationMinMax != null) {
    return `${t.durationMinMin}–${t.durationMinMax} min`;
  }
  if (t.paceZone) return `@ ${formatBand(t.paceZone)}`;
  return 'see plan';
}

export async function assembleSnapshot(): Promise<AthleteSnapshot> {
  const asOfIso = new Date().toISOString().slice(0, 10);
  const activePlan = await getActivePlan();
  const { startIso, endIso } = currentWeekRange();

  const [athleteState, phase, interruptions, weekActivities] = await Promise.all([
    getAthleteState({}),
    getProgramPhase(),
    getInterruptionsView(),
    getActivitiesInRange(startIso, endIso),
  ]);

  const weekStats = aggregateWeekStats(weekActivities);

  const recentRows = await getDb()
    .select()
    .from(schema.activities)
    .orderBy(desc(schema.activities.startDateLocal))
    .limit(3)
    .all();

  const recentActivities: RecentActivitySnapshot[] = recentRows.map((a) => ({
    date: a.startDateLocal.slice(0, 10),
    type: a.type,
    name: a.name,
    distanceKm: a.distanceM != null ? Math.round((a.distanceM / 1000) * 10) / 10 : null,
    avgPaceSpk:
      a.distanceM && a.movingTimeS ? a.movingTimeS / (a.distanceM / 1000) : null,
    avgHr: a.avgHr,
  }));

  let todaySession: AthleteSnapshot['todaySession'] = null;
  let weekNumber: number | null = null;
  let targetKm = 0;

  if (activePlan) {
    const { engine, params } = activePlan;
    weekNumber = currentWeekNumber(params) ?? 1;
    const ctx = await resolveWeekContext({ weekStartIso: startIso, weekEndIso: endIso });
    const template = engine.renderWeek(params, weekNumber, ctx);
    targetKm = template.totalKmTarget;
    const todayDow = (new Date().getDay() + 6) % 7;
    const day = template.days.find((d) => d.dow === todayDow);
    const sess = day?.sessions.find((s) => s.type !== 'rest') ?? null;
    if (sess) {
      todaySession = { label: sess.label, type: sess.type, prescription: prescription(sess) };
    }
  }

  return {
    asOfIso,
    dojo: activePlan?.engine.dojo ?? 'none',
    weekNumber,
    programWeeks:
      activePlan?.params.programWeeks ?? activePlan?.engine.defaultProgramWeeks ?? null,
    phaseKind: phase.kind,
    daysToRace: phase.daysToRace,
    todaySession,
    week: {
      totalKm: weekStats.totalKm,
      longRunKm: weekStats.longRunKm,
      avgPaceSpk: weekStats.avgPaceSpk,
      avgHr: weekStats.avgHr,
      sessions: weekStats.totalSessions,
      targetKm,
    },
    state: athleteState
      ? {
          ctl: athleteState.ctl,
          atl: athleteState.atl,
          tsb: athleteState.tsb,
          formClass: athleteState.formClass,
          confidence: athleteState.confidence,
        }
      : null,
    recentActivities,
    activeInjuries: interruptions.active
      .filter((i) => i.type === 'injury' || i.type === 'illness')
      .map((i) => ({
        type: i.type,
        bodyRegion: i.bodyRegion ?? null,
        severity: i.severity,
        since: i.startDate,
      })),
  };
}
