'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { getActivePlan } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { evaluateWeek } from '@/lib/analysis/compliance';
import { getActivitiesInRange } from '@/lib/analysis/week-queries';
import {
  getWeeklyReportEnabled,
  getWeeklyReportDay,
  getWeeklyReportLastGeneratedWeek,
  getWeeklyReportPayload,
  setWeeklyReportLastGeneratedWeek,
  setWeeklyReportPayload,
} from '@/lib/store/settings';
import {
  buildWeeklyReport,
  shouldGenerateReport,
  getThisMondayIso,
  addUtcDays,
  type WeeklyReport,
} from '@/lib/analysis/weekly-report-pure';

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parse the persisted payload JSON and return a WeeklyReport, or null when
 * the value is absent or not valid JSON.
 */
function parsePayload(raw: string | null): WeeklyReport | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WeeklyReport;
  } catch {
    return null;
  }
}

/**
 * Build a phase label string from the active plan context.
 * Returns "No active plan" when the plan or week number cannot be resolved.
 */
function buildPhaseLabel(
  engineDisplayName: string,
  phaseName: string,
  weekNumber: number,
): string {
  return `${engineDisplayName} — ${phaseName} (Week ${weekNumber})`;
}

/* -------------------------------------------------------------------------- */
/* Exported server actions                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate a weekly report if one is due, or return the persisted snapshot.
 *
 * Generation is due when:
 *   - weeklyReportEnabled = true
 *   - today's UTC DOW >= chosenDow
 *   - the report for this Monday hasn't been generated yet
 *
 * When not due, returns the last persisted payload or null.
 * Returns null on any error (the feature is non-critical — never throws to the
 * caller).
 */
export async function generateWeeklyReportIfDue(): Promise<WeeklyReport | null> {
  try {
    const enabled = await getWeeklyReportEnabled();
    if (!enabled) return null;

    const [chosenDow, lastGeneratedWeekStart] = await Promise.all([
      getWeeklyReportDay(),
      getWeeklyReportLastGeneratedWeek(),
    ]);

    const today = new Date();

    if (!shouldGenerateReport(today, chosenDow, lastGeneratedWeekStart)) {
      // Not due — return persisted snapshot.
      const rawPayload = await getWeeklyReportPayload();
      return parsePayload(rawPayload);
    }

    // --- Report is due; build it. ---

    // Derive week bounds in UTC so they are consistent with getThisMondayIso
    // and the watermark stored in lastGeneratedWeekStart.  currentWeekRange()
    // uses local-time getDay() which diverges from UTC in NZ (+12/+13) on
    // Mondays before midnight UTC.
    const weekStart = getThisMondayIso(today);
    const weekEnd = addUtcDays(weekStart, 6);

    const [activities, activePlan] = await Promise.all([
      getActivitiesInRange(weekStart, weekEnd),
      getActivePlan(),
    ]);

    let phase = 'No active plan';
    let weekTemplate = null;
    let weekNumber = 0;
    let volumeTargetKm = 0;
    let longRunTargetKm = 0;

    if (activePlan) {
      const periodStart = new Date(activePlan.params.startDate + 'T00:00:00Z');
      const weekStartDate = new Date(weekStart + 'T00:00:00Z');
      const diffDays = Math.floor(
        (weekStartDate.getTime() - periodStart.getTime()) / 86400000,
      );
      const wkNum = Math.floor(diffDays / 7) + 1;
      const programWeeks =
        activePlan.params.programWeeks ?? activePlan.engine.defaultProgramWeeks;

      if (wkNum >= 1 && wkNum <= programWeeks) {
        const weekContext = await resolveWeekContext({ weekStartIso: weekStart, weekEndIso: weekEnd });
        weekTemplate = activePlan.engine.renderWeek(activePlan.params, wkNum, weekContext);
        weekNumber = wkNum;
        volumeTargetKm = weekTemplate.totalKmTarget;
        longRunTargetKm = weekTemplate.longRunKmTarget;

        phase = buildPhaseLabel(
          activePlan.engine.displayName,
          weekTemplate.phaseName,
          weekNumber,
        );
      }
    }

    // If no plan or out of program window, use an empty compliance result.
    const weekCompliance = weekTemplate
      ? evaluateWeek(weekTemplate, activities)
      : {
          weekTemplate: { weekNumber: 0, phaseName: '', totalKmTarget: 0, longRunKmTarget: 0, days: [], notes: undefined },
          totalKmActual: activities
            .filter((a) => a.type === 'Run' || a.type === 'VirtualRun')
            .reduce((sum, a) => sum + (a.distanceM ?? 0) / 1000, 0),
          longRunKmActual: Math.max(
            0,
            ...activities
              .filter((a) => a.type === 'Run' || a.type === 'VirtualRun')
              .map((a) => (a.distanceM ?? 0) / 1000),
          ),
          daysWithSessions: 0,
          days: [],
        };

    const report = buildWeeklyReport(
      weekCompliance,
      weekStart,
      volumeTargetKm,
      longRunTargetKm,
      phase,
      today,
      chosenDow,
    );

    // Persist the new report and update the watermark.
    const mondayIso = getThisMondayIso(today);
    await Promise.all([
      setWeeklyReportLastGeneratedWeek(mondayIso),
      setWeeklyReportPayload(JSON.stringify(report)),
    ]);

    revalidatePath('/patrol');
    return report;
  } catch {
    // Weekly report is non-critical; swallow all errors.
    return null;
  }
}

/**
 * Read the last persisted weekly report without triggering generation.
 * Returns null when the feature is disabled, no report has been generated
 * yet, or the payload is invalid.
 *
 * The enabled check ensures that disabling the feature clears the hero
 * immediately — the old snapshot is not surfaced to the caller.
 */
export async function getPersistedWeeklyReport(): Promise<WeeklyReport | null> {
  try {
    const enabled = await getWeeklyReportEnabled();
    if (!enabled) return null;
    const raw = await getWeeklyReportPayload();
    return parsePayload(raw);
  } catch {
    return null;
  }
}

/**
 * Update the weekly report settings (enabled flag and report day).
 *
 * Validates dow is in range [0, 6] before persisting. Revalidates both
 * /patrol and /settings so the UI reflects the change immediately.
 *
 * @param enabled - Whether automated weekly reports are enabled.
 * @param dow     - Day of the week to generate the report (Mon=0..Sun=6).
 */
export async function updateWeeklyReportSettings(
  enabled: boolean,
  dow: number,
): Promise<void> {
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
    throw new Error(`Invalid report day: ${dow}. Must be 0 (Mon) through 6 (Sun).`);
  }

  const { setWeeklyReportEnabled, setWeeklyReportDay } = await import(
    '@/lib/store/settings'
  );

  await Promise.all([
    setWeeklyReportEnabled(enabled),
    setWeeklyReportDay(dow),
  ]);

  revalidatePath('/patrol');
  revalidatePath('/settings');
}
