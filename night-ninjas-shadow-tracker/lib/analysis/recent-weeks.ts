import 'server-only';
import { getActivePlan, currentWeekRange } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { getActivitiesInRange, aggregateWeekStats, type WeekStats } from './week-queries';
import { evaluateWeek, type WeekCompliance } from './compliance';
import type { WeekTemplate, PlanParams } from '@/lib/plans/types';
import type { Activity } from '@/lib/db/schema';

/**
 * Recent-weeks evaluation — the data engine behind Recon.
 *
 * Walks back N weeks from "now". For each week:
 *   1. Compute the week's date range (Monday → Sunday in local time)
 *   2. Resolve calendar context AS IT WAS FOR THAT WEEK
 *   3. Compute the program's week number for that calendar week
 *   4. Render the calendar-adapted template via the active plan engine
 *   5. Query activities for the week
 *   6. Run the compliance evaluator
 *
 * Each week is independent — a sickness 6 weeks ago should affect that
 * week's evaluation, not be smeared across the whole window. The plan
 * engine's calendar adaptations make this work without special-casing.
 *
 * Performance: ~50 DB queries for a 12-week run, all on indexed columns.
 * Real-world ~30ms. Not optimised because it doesn't need to be.
 */

export interface WeekEvaluation {
  /** ISO date of this week's Monday. */
  weekStartIso: string;
  /** ISO date of this week's Sunday. */
  weekEndIso: string;
  /** Program week number — null if outside the program window. */
  programWeekNumber: number | null;
  /** Calendar-adapted plan-of-record for this week. Null if no active plan. */
  template: WeekTemplate | null;
  /** Aggregate stats from actual activities. */
  stats: WeekStats;
  /** Per-session compliance evaluation. Null if no template. */
  compliance: WeekCompliance | null;
  /** Raw activity rows for this week. */
  activities: Activity[];
}

export interface RecentWeeksResult {
  /** Newest week first. */
  weeks: WeekEvaluation[];
  /** Active plan params at the time of evaluation. Null if no plan. */
  planParams: PlanParams | null;
  /** Engine display name. */
  engineDisplayName: string | null;
}

/**
 * Evaluate the last N completed weeks (excludes current incomplete week).
 *
 * Default N=12 because Recon is the 12-week trend screen, but accepting
 * a parameter keeps the function reusable for other windows.
 */
export async function evaluateRecentWeeks(
  n: number = 12,
  options: { includeCurrent?: boolean } = {}
): Promise<RecentWeeksResult> {
  const includeCurrent = options.includeCurrent ?? false;

  const activePlan = await getActivePlan();
  if (!activePlan) {
    return { weeks: [], planParams: null, engineDisplayName: null };
  }

  const { engine, params } = activePlan;
  const weeks: WeekEvaluation[] = [];

  // Anchor at the most recent week. If includeCurrent=false, start one week back.
  const { startIso: currentStart, endIso: currentEnd } = currentWeekRange();
  const baseStart = new Date(currentStart);
  if (!includeCurrent) {
    // Step one week back to start at the most recent COMPLETED week
    baseStart.setDate(baseStart.getDate() - 7);
  }

  // Walk backwards N weeks
  for (let i = 0; i < n; i++) {
    const weekStart = new Date(baseStart);
    weekStart.setDate(baseStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartIso = toLocalIso(weekStart);
    const weekEndIso = toLocalIso(weekEnd);

    // Compute program week number for this calendar week
    const programWeekNumber = computeProgramWeekNumber(params, weekStart);

    // If outside the program window, skip the template/compliance — just
    // collect the activities as standalone data.
    let template: WeekTemplate | null = null;
    let compliance: WeekCompliance | null = null;

    const activities = await getActivitiesInRange(weekStartIso, weekEndIso);
    const stats = aggregateWeekStats(activities);

    if (programWeekNumber !== null) {
      const context = await resolveWeekContext({ weekStartIso, weekEndIso });
      template = engine.renderWeek(params, programWeekNumber, context);
      compliance = evaluateWeek(template, activities);
    }

    weeks.push({
      weekStartIso,
      weekEndIso,
      programWeekNumber,
      template,
      stats,
      compliance,
      activities,
    });
  }

  return {
    weeks,
    planParams: params,
    engineDisplayName: engine.displayName,
  };
}

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

function computeProgramWeekNumber(params: PlanParams, weekStartDate: Date): number | null {
  const programStart = new Date(params.startDate);
  const diffMs = weekStartDate.getTime() - programStart.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 0) return null;
  const week = Math.floor(diffDays / 7) + 1;
  const programWeeks = params.programWeeks ?? 18;
  if (week > programWeeks) return null;
  return week;
}

function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ----------------------------------------------------------------------------
 * Aggregate metrics — the three big numbers at the top of Recon.
 *
 * Compares the requested window vs the equivalent prior window so we can
 * surface direction (up / down / flat) alongside the absolute number.
 * -------------------------------------------------------------------------- */

export interface ReconAggregate {
  totalKm: { current: number; previous: number; deltaPct: number | null };
  compliance: { currentPct: number; previousPct: number; deltaPp: number | null };
  longRunConsistency: {
    currentPct: number;
    previousPct: number;
    deltaPp: number | null;
  };
  /** 12-point sparkline of weekly km. Newest LAST so it reads left-to-right. */
  weeklyKmTrend: number[];
}

export async function buildReconAggregate(): Promise<ReconAggregate | null> {
  const activePlan = await getActivePlan();
  if (!activePlan) return null;

  // Pull 24 weeks so we can compute current 12 vs previous 12
  const result = await evaluateRecentWeeks(24);
  if (result.weeks.length === 0) return null;

  // weeks[0] is most recent → split into current (first 12) and previous (next 12)
  const current = result.weeks.slice(0, 12);
  const previous = result.weeks.slice(12, 24);

  const totalKmCurrent = current.reduce((s, w) => s + w.stats.totalKm, 0);
  const totalKmPrevious = previous.reduce((s, w) => s + w.stats.totalKm, 0);

  const complianceCurrent = computeCompliancePercent(current);
  const compliancePrevious = computeCompliancePercent(previous);

  const longRunCurrent = computeLongRunConsistency(current);
  const longRunPrevious = computeLongRunConsistency(previous);

  return {
    totalKm: {
      current: totalKmCurrent,
      previous: totalKmPrevious,
      deltaPct: pctDelta(totalKmCurrent, totalKmPrevious),
    },
    compliance: {
      currentPct: complianceCurrent,
      previousPct: compliancePrevious,
      deltaPp: complianceCurrent != null && compliancePrevious != null
        ? complianceCurrent - compliancePrevious
        : null,
    },
    longRunConsistency: {
      currentPct: longRunCurrent,
      previousPct: longRunPrevious,
      deltaPp: longRunCurrent != null && longRunPrevious != null
        ? longRunCurrent - longRunPrevious
        : null,
    },
    // Sparkline: oldest → newest, left-to-right reading order
    weeklyKmTrend: current.slice().reverse().map((w) => w.stats.totalKm),
  };
}

function computeCompliancePercent(weeks: WeekEvaluation[]): number {
  let totalSessions = 0;
  let okSessions = 0;
  for (const week of weeks) {
    if (!week.compliance) continue;
    for (const day of week.compliance.days) {
      for (const session of day.sessions) {
        if (session.target.type === 'rest') continue;
        totalSessions++;
        if (session.flag === 'ok' || session.flag === 'warn') okSessions++;
      }
    }
  }
  return totalSessions > 0 ? Math.round((okSessions / totalSessions) * 100) : 0;
}

function computeLongRunConsistency(weeks: WeekEvaluation[]): number {
  let totalWeeks = 0;
  let consistentWeeks = 0;
  for (const week of weeks) {
    if (!week.template) continue;
    if (week.template.longRunKmTarget === 0) continue;
    totalWeeks++;
    const ratio = week.stats.longRunKm / week.template.longRunKmTarget;
    if (ratio >= 0.9) consistentWeeks++;
  }
  return totalWeeks > 0 ? Math.round((consistentWeeks / totalWeeks) * 100) : 0;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
