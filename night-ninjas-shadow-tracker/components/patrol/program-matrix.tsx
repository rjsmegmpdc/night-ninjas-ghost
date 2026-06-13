import type { ActivePlan } from '@/lib/plans/active-plan';
import { currentWeekRange, currentWeekNumber } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { distributeEventsByDay } from '@/lib/plans/distribute-events';
import { getActivitiesInRange, aggregateWeekStats } from '@/lib/analysis/week-queries';
import { evaluateWeek, type WeekCompliance, type DayCompliance } from '@/lib/analysis/compliance';
import type { Activity } from '@/lib/db/schema';
import { marathonPaceSpk, band } from '@/lib/plans/derive';
import {
  getPlanPeriodsInRange,
  resolvePlanPeriod,
  type PlanPeriodResolved,
} from '@/lib/plans/plan-periods';
import { renderBaseMaintenanceWeek } from '@/lib/plans/base-maintenance';
import type { WeekTemplate, PaceZones, PlanParams } from '@/lib/plans/types';
import { getFirstDayOfWeek } from '@/lib/store/settings';
import {
  MatrixHeader,
  MatrixRow,
  type MatrixRowData,
  type DayComplianceFlag,
  type DayActual,
} from './matrix-cells';
import { MatrixFilterShell } from './matrix-filter-shell';
import { MatrixLegend } from './matrix-legend';
import { ExpandSection } from './program-matrix-expand';

/**
 * ProgramMatrix — coach's-spreadsheet view of the training block.
 *
 * Renders a tight grid of weeks × days with each cell colour-coded by
 * session type and showing the most distinctive metric (distance for
 * easy/long/tempo, structure for intervals like "8 x 800").
 *
 * Layout:
 *   - Always visible: last week / current week / next week
 *   - Lazy expand below: past compliance (8 weeks per page) + forward
 *     to race day (8 weeks per page). Loaded on-demand via server action.
 *   - Right-side legend: clickable colour swatches that filter the
 *     matrix to the selected session types.
 *
 * Plan-of-record: each row is rendered using whichever plan period was
 * active during that week. Past Hansons weeks render with Hansons rules;
 * current Pfitzinger weeks render with Pfitzinger. Periods are stored
 * in plan_periods table.
 *
 * Performance: only the 3-row visible strip is computed on initial render.
 * Past + forward expansion fetches lazily, paged at 8 weeks per page.
 */
export async function ProgramMatrix({ activePlan }: { activePlan: ActivePlan }) {
  const { params } = activePlan;

  const { startIso: currentStart } = currentWeekRange();
  const currentMonday = new Date(currentStart + 'T00:00:00');

  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // Mon=0..Sun=6
  const todayIso = isoDateOnly(today);

  // Visible 3-row strip: last / current / next
  const visibleMondays = [
    addDays(currentMonday, -7),
    currentMonday,
    addDays(currentMonday, 7),
  ];
  const visibleRows = await buildRows({ weekMondays: visibleMondays });

  const paceZones = derivePaceZonesForLegend(params);
  const firstDayOfWeek = await getFirstDayOfWeek();

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
        <span className="nn-caps">program matrix</span>
        <span className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
          past compliance ↑ · this week · forward to race ↓
        </span>
      </div>

      <MatrixFilterShell paceZones={paceZones}>
        <div className="grid grid-cols-[1fr_220px] gap-6 items-start">
          {/* Matrix */}
          <div className="space-y-1.5">
            <MatrixHeader firstDayOfWeek={firstDayOfWeek} />

            {/* Past expand — moved ABOVE the visible strip so the eye
                naturally reads top-down: history → now → future */}
            <div className="pb-2 border-b border-ink-line/50">
              <ExpandSection
                direction="past"
                anchorIso={isoDateOnly(currentMonday)}
                todayIso={todayIso}
                todayDow={todayDow}
                label="Past 8 weeks · compliance"
                firstDayOfWeek={firstDayOfWeek}
              />
            </div>

            {/* The always-visible 3-row strip: last / this / next */}
            {visibleRows.map((row) => (
              <MatrixRow
                key={row.weekStartIso}
                row={row}
                todayDow={todayDow}
                todayIso={todayIso}
                firstDayOfWeek={firstDayOfWeek}
              />
            ))}

            {/* Forward expand — stays below the visible strip */}
            <div className="pt-4 border-t border-ink-line">
              <ExpandSection
                direction="forward"
                anchorIso={isoDateOnly(currentMonday)}
                todayIso={todayIso}
                todayDow={todayDow}
                label="Forward · to race day"
                firstDayOfWeek={firstDayOfWeek}
              />
            </div>
          </div>

          {/* Legend with clickable filter swatches */}
          <MatrixLegend paceZones={paceZones} />
        </div>
      </MatrixFilterShell>
    </section>
  );
}

/* ============================================================================
 * Row builder for the always-visible 3-row strip.
 *
 * Each row's template is rendered using whichever plan period covers
 * that week's Monday (NOT the currently-active plan). This means
 * historical weeks under previous Hansons → render with Hansons; current
 * weeks under Pfitzinger → render with Pfitzinger.
 *
 * The same pattern is implemented in matrix-load-action.ts for the
 * lazy-loaded expand. Kept here to allow synchronous server rendering
 * of the visible strip without round-tripping through the action layer.
 * ========================================================================== */

async function buildRows({
  weekMondays,
}: {
  weekMondays: Date[];
}): Promise<MatrixRowData[]> {
  if (weekMondays.length === 0) return [];

  const rows: MatrixRowData[] = [];
  const today = isoDateOnly(new Date());

  // Pull periods covering this range once
  const fromIso = isoDateOnly(weekMondays[0]);
  const lastSunday = new Date(weekMondays[weekMondays.length - 1]);
  lastSunday.setDate(lastSunday.getDate() + 6);
  const toIso = isoDateOnly(lastSunday);

  const periods = await getPlanPeriodsInRange(fromIso, toIso);

  const resolvedCache = new Map<number, PlanPeriodResolved | null>();
  async function resolveOnce(p: typeof periods[number]): Promise<PlanPeriodResolved | null> {
    if (resolvedCache.has(p.id)) return resolvedCache.get(p.id)!;
    const r = await resolvePlanPeriod(p);
    resolvedCache.set(p.id, r);
    return r;
  }

  for (const weekStart of weekMondays) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartIso = isoDateOnly(weekStart);
    const weekEndIso = isoDateOnly(weekEnd);

    const isPast = weekEndIso < today;

    const period = periods.find((p) => {
      if (weekStartIso < p.startDate) return false;
      if (p.endDate && weekStartIso > p.endDate) return false;
      return true;
    });

    let template: WeekTemplate | null = null;
    let programWeekNumber: number | null = null;
    let dojo: string | null = null;
    let totalActualKm: number | null = null;
    let totalKmTarget: number | null = null;
    let dayCompliance: (DayComplianceFlag | null)[] | undefined = undefined;
    let weekCompliancePct: number | null = null;
    let isBaseMaintenance = false;

    // WeekContext is fetched for every row regardless of plan-period
    // coverage. Even base-maintenance weeks need event awareness so
    // commitments/holidays render on the matrix cells.
    const weekContext = await resolveWeekContext({ weekStartIso, weekEndIso });
    const dayEvents = distributeEventsByDay(weekContext.events, weekStartIso);

    if (period) {
      dojo = period.dojo;
      const periodStart = new Date(period.startDate + 'T00:00:00');
      const diffDays = Math.floor(
        (weekStart.getTime() - periodStart.getTime()) / 86400000
      );
      const wkNum = Math.floor(diffDays / 7) + 1;

      if (wkNum >= 1 && wkNum <= period.programWeeks) {
        const resolved = await resolveOnce(period);
        if (resolved) {
          template = resolved.engine.renderWeek(resolved.params, wkNum, weekContext);
          programWeekNumber = wkNum;
          totalKmTarget = template.totalKmTarget;
        }
      }
    }

    // Base-maintenance fallback: if no template was rendered (no period
    // covers this week, or week falls outside program weeks), synthesise
    // a defensible default. Pre-program weeks ramp down from week-1; post-
    // program weeks use recent chronic load. See lib/plans/base-maintenance.ts.
    if (!template) {
      const baseRefs = await resolveBaseMaintenanceReferences({
        weekStartIso,
        periods,
      });
      if (baseRefs) {
        const baseTemplate = await renderBaseMaintenanceWeek({
          weekStartIso,
          weekEndIso,
          referenceWeek1Km: baseRefs.referenceWeek1Km,
          referenceMode: baseRefs.referenceMode,
          params: baseRefs.params,
          weekNumberMarker: 0,
        });
        if (baseTemplate) {
          template = baseTemplate;
          totalKmTarget = baseTemplate.totalKmTarget;
          isBaseMaintenance = true;
        }
      }
    }

    let weekActivities: Awaited<ReturnType<typeof getActivitiesInRange>> = [];
    let dayActuals: (DayActual[] | null)[] | undefined = undefined;
    if (isPast || weekStartIso <= today) {
      weekActivities = await getActivitiesInRange(weekStartIso, weekEndIso);
      if (weekActivities.length > 0) {
        totalActualKm = aggregateWeekStats(weekActivities).totalKm;
        dayActuals = buildDayActuals(weekActivities);
      }
    }

    // Compliance dots:
    // - Past or current week with template: evaluate against actuals.
    //   For the *current* week, days that haven't happened yet would
    //   otherwise be flagged 'miss' by evaluateWeek (planned session,
    //   no activity) — we re-mark those as 'planned' so future-this-week
    //   reads as scheduled, not missed.
    // - Future week with template: mark scheduled days as 'planned' so
    //   the at-a-glance read shows session-vs-rest before any data lands.
    if (template) {
      const isFuture = weekStartIso > today;
      if (isFuture) {
        dayCompliance = buildPlannedPlaceholders(template);
      } else {
        const compliance = evaluateWeek(template, weekActivities);
        dayCompliance = buildDayComplianceArray(compliance);
        weekCompliancePct = computeWeekCompliancePct(compliance);

        // For the current week, replace miss → planned for days that
        // haven't happened yet (today and future). Today is incomplete
        // — the runner may still train later — so flagging it 'miss'
        // would create false alarms throughout the day. Same convention
        // as the streak counter: only past days carry compliance.
        if (!isPast && dayCompliance) {
          const todayDate = new Date(today + 'T00:00:00');
          for (let dow = 0; dow < 7; dow++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + dow);
            if (dayDate >= todayDate && dayCompliance[dow] === 'miss') {
              dayCompliance[dow] = 'planned';
            }
          }
        }
      }
    }

    rows.push({
      weekStartIso,
      programWeekNumber,
      dojo,
      template,
      totalActualKm,
      totalKmTarget,
      isPast,
      dayCompliance,
      weekCompliancePct,
      dayActuals,
      isBaseMaintenance,
      dayEvents,
    });
  }

  return rows;
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, n: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Derive a pace-zones object for the legend cheat-sheet from the active
 * plan params. Mirrors the convention used by the engines (interval
 * pace = marathon pace - 30 sec/km, ±8 sec band).
 *
 * Approximate but matches Hansons/Daniels conventions closely enough
 * for the cheat-sheet display. Each engine internally computes its own
 * zones for actual prescription; this is purely for reference display.
 */
function derivePaceZonesForLegend(params: ActivePlan['params']): PaceZones {
  const mp = marathonPaceSpk(params);
  return {
    recovery: band(mp + 75, 15),
    easy: band(mp + 60, 12),
    long: band(mp + 50, 12),
    marathon: band(mp, 5),
    threshold: band(mp - 18, 5),
    interval: band(mp - 30, 8),
    repetition: band(mp - 50, 10),
  };
}

/**
 * Reduce DayCompliance.sessions[] flags into a single hit/soft/miss
 * per day for matrix cell display.
 *
 * Rule: worst-of-day wins. If any session was a miss, day is miss.
 * Otherwise if any was warn/short/slow/fast, day is soft. Else hit.
 * 'none' (no actual data) is treated as miss for past days because
 * by definition a planned session went unfulfilled.
 */
function buildDayComplianceArray(weekCompliance: WeekCompliance): (DayComplianceFlag | null)[] {
  const out: (DayComplianceFlag | null)[] = [null, null, null, null, null, null, null];
  for (const day of weekCompliance.days) {
    out[day.dow] = reduceDayFlag(day);
  }
  return out;
}

function reduceDayFlag(day: DayCompliance): DayComplianceFlag | null {
  if (day.sessions.length === 0) return null;

  // Rest-day templates have no sessions; we'd render null and skip the dot.
  // For real sessions, take worst-of:
  let worst: DayComplianceFlag = 'hit';
  for (const s of day.sessions) {
    const f = mapFlag(s.flag);
    if (f === 'miss') {
      worst = 'miss';
      break;
    }
    if (f === 'soft' && worst !== 'miss') worst = 'soft';
  }
  return worst;
}

function mapFlag(flag: string): DayComplianceFlag {
  switch (flag) {
    case 'ok':
      return 'hit';
    case 'warn':
    case 'fast':
    case 'slow':
    case 'short':
      return 'soft';
    case 'miss':
    case 'none':
      return 'miss';
    default:
      return 'soft';
  }
}

/**
 * Week-level compliance pct: ratio of "hit" days to scheduled days.
 * Returns null if no scheduled sessions to evaluate against.
 */
function computeWeekCompliancePct(weekCompliance: WeekCompliance): number | null {
  let scheduled = 0;
  let hits = 0;
  for (const day of weekCompliance.days) {
    if (day.sessions.length === 0) continue;
    scheduled++;
    const f = reduceDayFlag(day);
    if (f === 'hit') hits++;
  }
  if (scheduled === 0) return null;
  return Math.round((hits / scheduled) * 100);
}

/**
 * Build a 7-element 'planned' placeholder array for future weeks.
 * Days with at least one scheduled session → 'planned'. Rest days → null.
 *
 * Used when no actual activity data exists yet but the template is
 * known. Surfaces "session is on the calendar that day" without
 * misclaiming compliance.
 */
function buildPlannedPlaceholders(template: WeekTemplate): (DayComplianceFlag | null)[] {
  const out: (DayComplianceFlag | null)[] = [null, null, null, null, null, null, null];
  for (const day of template.days) {
    if (day.sessions.length > 0) {
      out[day.dow] = 'planned';
    }
  }
  return out;
}

/**
 * Group week activities by day-of-week into a 7-slot array of DayActual
 * lists.
 *
 * Each slot:
 *   - undefined / null → no activities recorded
 *   - DayActual[] (length >= 1) → one entry per Strava activity on
 *     that day, ordered chronologically (earliest first)
 *
 * Multiple activities on the same day are common: AM + PM doubles,
 * warmup-then-workout splits, commute jogs, post-strength easy.
 * The matrix cell renders all of them as stacked pills (capped at 3
 * with +N overflow indicator) so the runner can see what actually
 * happened, not just an aggregate.
 *
 * Day-of-week mapping: Mon=0..Sun=6. Strava's startDateLocal is ISO
 * 8601 in the athlete's local time (no offset suffix); we parse the
 * date portion to determine the day.
 */
function buildDayActuals(activities: Activity[]): (DayActual[] | null)[] {
  const slots: (DayActual[] | null)[] = [null, null, null, null, null, null, null];

  for (const a of activities) {
    const d = new Date(a.startDateLocal);
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6

    const distanceKm =
      a.distanceM != null && a.distanceM > 0 ? a.distanceM / 1000 : null;
    const paceSpk =
      a.avgSpeedMs != null && a.avgSpeedMs > 0 ? 1000 / a.avgSpeedMs : null;

    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');

    const entry: DayActual = {
      sportType: a.sportType ?? a.type ?? null,
      distanceKm,
      movingTimeS: a.movingTimeS,
      paceSpk,
      name: a.name,
      startTimeHm: `${hh}:${mm}`,
    };

    if (slots[dow] === null) slots[dow] = [];
    slots[dow]!.push(entry);
  }

  // Sort each day's actuals chronologically
  for (let dow = 0; dow < 7; dow++) {
    if (slots[dow]) {
      slots[dow]!.sort((x, y) => x.startTimeHm.localeCompare(y.startTimeHm));
    }
  }

  return slots;
}

/* ----------------------------------------------------------------------------
 * Base-maintenance reference resolver
 *
 * For a week with no plan period coverage (or outside program-week range),
 * decide which mode the base-maintenance generator should use and what
 * reference data to pass it.
 *
 * Modes:
 *   'pre-program'  — week is before any active period started
 *                    (gap between today and the next program's startDate)
 *   'post-program' — week is after the latest period ended
 *                    (athlete finished a block, no new one started)
 *   'no-program'   — no periods at all in the input range
 *
 * For 'pre-program' we look up the upcoming period and render its
 * week-1 template to extract the volume target — that becomes the
 * rampdown anchor.
 *
 * Returns null when no reference is derivable (no periods at all and
 * no params to construct an easy zone). The base-maintenance generator
 * itself will then return null and the row renders as untemplated.
 * ------------------------------------------------------------------------- */
async function resolveBaseMaintenanceReferences({
  weekStartIso,
  periods,
}: {
  weekStartIso: string;
  periods: Awaited<ReturnType<typeof getPlanPeriodsInRange>>;
}): Promise<{
  referenceWeek1Km: number | null;
  referenceMode: 'pre-program' | 'post-program' | 'no-program';
  params: PlanParams | null;
} | null> {
  if (periods.length === 0) {
    return {
      referenceWeek1Km: null,
      referenceMode: 'no-program',
      params: null,
    };
  }

  // Find any period that starts after this week (pre-program candidate)
  // or ends before this week (post-program candidate)
  const upcoming = periods.find((p) => p.startDate > weekStartIso);
  const ended = periods
    .filter((p) => p.endDate !== null && p.endDate < weekStartIso)
    .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0];

  if (upcoming) {
    // Pre-program — render the upcoming period's week 1 to get volume
    const resolved = await resolvePlanPeriod(upcoming);
    if (!resolved) {
      return {
        referenceWeek1Km: null,
        referenceMode: 'pre-program',
        params: null,
      };
    }
    let week1Km: number | null = null;
    try {
      const week1Template = resolved.engine.renderWeek(resolved.params, 1, {
        weekStartIso: upcoming.startDate,
        weekEndIso: upcoming.startDate, // unused for week-1 rendering
        goalRace: null,
        tuneupRaces: [],
        recurringSessions: [],
        events: [],
        ninjaLoopDays: [],
      });
      week1Km = week1Template.totalKmTarget;
    } catch {
      // Engine refused without proper context — fall back to null,
      // generator will then use chronic load instead
    }
    return {
      referenceWeek1Km: week1Km,
      referenceMode: 'pre-program',
      params: resolved.params,
    };
  }

  if (ended) {
    // Post-program — use most recent ended period's params for pace zones
    const resolved = await resolvePlanPeriod(ended);
    return {
      referenceWeek1Km: null,
      referenceMode: 'post-program',
      params: resolved?.params ?? null,
    };
  }

  // Periods exist but none upcoming/ended relative to this week — shouldn't
  // happen in practice (would mean the week IS within a period, which the
  // earlier branch handled). Treat as no-program.
  return {
    referenceWeek1Km: null,
    referenceMode: 'no-program',
    params: null,
  };
}
