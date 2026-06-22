import 'server-only';

/**
 * NS-2 / NS-3 - server read layer for the Norwegian Singles guardrails.
 *
 * Builds SessionSample[] from recent activities by:
 *   - computing each run's HR reserve (Karvonen) from avgHr + profile
 *   - inferring session intent from the matched plan template for that day
 *     (quality = the NS sub-threshold tempo slot; else easy/long/recovery)
 *
 * Then assembles the max-HR guard input (measured vs age-predicted, plus
 * the highest observed activity max HR) and runs the pure report.
 *
 * Only meaningful when the active dojo is Norwegian Singles; the caller
 * gates on that. Degrades to an empty report without data.
 */

import { getActivitiesInRange } from './week-queries';
import { getActivePlan, currentWeekRange } from '@/lib/plans/active-plan';
import { resolveWeekContext } from '@/lib/plans/week-context';
import { getAthleteProfile, getNsHrCalibration, seedNsDefaultsOnce } from '@/lib/store/settings';
import { classifySport, isRunning } from './sport-classifier';
import {
  buildNsGuardReport,
  EASY_CEILING_RESERVE,
  SUBT_HOT_RESERVE,
  type SessionSample,
  type NsGuardReport,
  type MaxHrGuardInput,
  type NsHrCaps,
} from './ns-guardrails';
import type { WeekTemplate, SessionType } from '@/lib/plans/types';

function reserveFor(avgHr: number | null, maxHr: number | null, restingHr: number | null): number | null {
  if (!avgHr || !maxHr) return null;
  const rest = restingHr ?? 50;
  if (maxHr - rest <= 0) return null;
  const r = (avgHr - rest) / (maxHr - rest);
  return Math.max(0, Math.min(1, Math.round(r * 100) / 100));
}

/** Map a day's prescribed session types to the guardrail intent bucket. */
function intentFromTemplateDay(types: SessionType[]): SessionSample['kind'] {
  // NS marks sub-threshold sessions in the 'tempo' slot. Treat tempo/
  // interval/repetition as quality; long as long; recovery as recovery;
  // easy as easy; anything else 'other'.
  if (types.some((t) => t === 'tempo' || t === 'interval' || t === 'repetition')) return 'quality';
  if (types.some((t) => t === 'long')) return 'long';
  if (types.some((t) => t === 'recovery')) return 'recovery';
  if (types.some((t) => t === 'easy')) return 'easy';
  return 'other';
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build samples over the trailing `weeks` weeks. Each run activity is
 * matched to its day's prescription (when a plan template exists for that
 * week) to infer intent; unmatched runs default to 'easy' (conservative -
 * an unplanned run is treated as easy volume).
 */
export async function getNsGuardReport(weeks = 3): Promise<NsGuardReport | null> {
  // First time NS is active, seed the athlete's personal HR caps as editable
  // defaults (no-op thereafter, never clobbers existing edits).
  await seedNsDefaultsOnce();

  const activePlan = await getActivePlan();
  const profile = await getAthleteProfile();
  const calibration = await getNsHrCalibration();

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const acts = await getActivitiesInRange(isoDay(start), isoDay(end));

  // Pre-render the templates for each week in range, keyed by Monday.
  const templateByMonday = new Map<string, WeekTemplate>();
  if (activePlan) {
    for (let w = 0; w < weeks; w++) {
      const monday = new Date(end);
      monday.setDate(monday.getDate() - end.getDay() + 1 - w * 7); // approx Monday
      const { startIso, endIso } = currentWeekRange(monday);
      const ms = new Date(startIso + 'T00:00:00');
      const periodStart = new Date(activePlan.params.startDate + 'T00:00:00');
      const wkNum = Math.floor((ms.getTime() - periodStart.getTime()) / 86400000 / 7) + 1;
      if (wkNum >= 1 && wkNum <= (activePlan.params.programWeeks ?? 18)) {
        const ctx = await resolveWeekContext({ weekStartIso: startIso, weekEndIso: endIso });
        templateByMonday.set(startIso, activePlan.engine.renderWeek(activePlan.params, wkNum, ctx));
      }
    }
  }

  function dayIntent(dateIso: string): SessionSample['kind'] {
    // Find the Monday of this date's week and the matching template day.
    const d = new Date(dateIso + 'T00:00:00');
    const { startIso } = currentWeekRange(d);
    const tpl = templateByMonday.get(startIso);
    if (!tpl) return 'easy';
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    const day = tpl.days.find((x) => x.dow === dow);
    if (!day || day.sessions.length === 0) return 'easy';
    return intentFromTemplateDay(day.sessions.map((s) => s.type));
  }

  const samples: SessionSample[] = [];
  let observedMaxHr: number | null = null;

  for (const a of acts) {
    const category = classifySport(a.sportType ?? a.type ?? null, a.name);
    if (!isRunning(category)) continue; // NS guards are about running
    const minutes = (a.movingTimeS ?? 0) / 60;
    if (minutes <= 0) continue;

    if (a.maxHr != null) observedMaxHr = observedMaxHr === null ? a.maxHr : Math.max(observedMaxHr, a.maxHr);

    const reserve = reserveFor(a.avgHr, profile.maxHr, profile.restingHr);
    samples.push({
      dateIso: a.startDateLocal.slice(0, 10),
      kind: dayIntent(a.startDateLocal.slice(0, 10)),
      reserve,
      avgHr: a.avgHr ?? null,
      minutes,
    });
  }

  const maxHrInput: MaxHrGuardInput = {
    configuredMaxHr: profile.maxHr,
    hasMeasuredMax: profile.maxHr !== null && calibration.confidence === 'measured',
    age: profile.age,
    observedMaxHr,
  };

  const caps: NsHrCaps = {
    easyHrCap: calibration.easyHrCap,
    subThresholdHrCap: calibration.subThresholdHrCap,
  };

  return buildNsGuardReport(samples, maxHrInput, caps);
}

/* ---- Per-week trend data ------------------------------------------------- */

export interface NsWeeklyDataPoint {
  /** Short label for the chart x-axis, e.g. "16 Jun" */
  weekLabel: string;
  weekStartIso: string;
  /**
   * % of easy/long/recovery sessions that stayed below the easy HR ceiling.
   * 100 = perfect. null when no easy sessions with HR data that week.
   */
  easyCompliancePct: number | null;
  /**
   * Raw quality volume as % of total weekly volume (0-40 useful range).
   * Target band is 20-25%. null when no sessions that week.
   */
  qualityPct: number | null;
  /**
   * % of quality sessions that stayed below the sub-threshold ceiling.
   * 100 = all reps controlled. null when no quality sessions with HR data.
   */
  repCompliancePct: number | null;
  /** 0-100 weighted discipline score for that week */
  disciplineScore: number;
  /** false when no running data exists for that week */
  hasSessions: boolean;
}

/**
 * Build per-week discipline metrics for the trailing `weeks` weeks.
 * Returns oldest week first (ready for Recharts as-is).
 */
export async function getNsWeeklyTrend(weeks = 12): Promise<NsWeeklyDataPoint[]> {
  const activePlan = await getActivePlan();
  const profile = await getAthleteProfile();
  const calibration = await getNsHrCalibration();

  const caps: NsHrCaps = {
    easyHrCap: calibration.easyHrCap,
    subThresholdHrCap: calibration.subThresholdHrCap,
  };
  const maxHrBase: Omit<MaxHrGuardInput, 'observedMaxHr'> = {
    configuredMaxHr: profile.maxHr,
    hasMeasuredMax: profile.maxHr !== null && calibration.confidence === 'measured',
    age: profile.age,
  };

  const today = new Date();

  // One DB call for the full window
  const windowEnd = isoDay(today);
  const windowStartDate = new Date(today);
  windowStartDate.setDate(windowStartDate.getDate() - weeks * 7 + 1);
  const windowStart = isoDay(windowStartDate);
  const allActs = await getActivitiesInRange(windowStart, windowEnd);

  // Pre-render templates for all weeks in range
  const templateByMonday = new Map<string, WeekTemplate>();
  if (activePlan) {
    for (let w = 0; w < weeks; w++) {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - today.getDay() + 1 - w * 7);
      const { startIso, endIso } = currentWeekRange(monday);
      const ms = new Date(startIso + 'T00:00:00');
      const periodStart = new Date(activePlan.params.startDate + 'T00:00:00');
      const wkNum = Math.floor((ms.getTime() - periodStart.getTime()) / 86400000 / 7) + 1;
      if (wkNum >= 1 && wkNum <= (activePlan.params.programWeeks ?? 18)) {
        const ctx = await resolveWeekContext({ weekStartIso: startIso, weekEndIso: endIso });
        templateByMonday.set(startIso, activePlan.engine.renderWeek(activePlan.params, wkNum, ctx));
      }
    }
  }

  const points: NsWeeklyDataPoint[] = [];

  // Oldest week first
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - today.getDay() + 1 - w * 7);
    const { startIso: weekStart, endIso: weekEnd } = currentWeekRange(monday);

    const weekActs = allActs.filter((a) => {
      const d = a.startDateLocal.slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    });

    const template = templateByMonday.get(weekStart);

    const samples: SessionSample[] = [];
    let observedMaxHr: number | null = null;

    for (const a of weekActs) {
      const category = classifySport(a.sportType ?? a.type ?? null, a.name);
      if (!isRunning(category)) continue;
      const minutes = (a.movingTimeS ?? 0) / 60;
      if (minutes <= 0) continue;
      if (a.maxHr != null) observedMaxHr = observedMaxHr === null ? a.maxHr : Math.max(observedMaxHr, a.maxHr);
      const reserve = reserveFor(a.avgHr, profile.maxHr, profile.restingHr);

      let kind: SessionSample['kind'] = 'easy';
      if (template) {
        const d = new Date(a.startDateLocal.slice(0, 10) + 'T00:00:00');
        const dow = (d.getDay() + 6) % 7;
        const day = template.days.find((x) => x.dow === dow);
        if (day && day.sessions.length > 0) {
          kind = intentFromTemplateDay(day.sessions.map((s) => s.type));
        }
      }

      samples.push({ dateIso: a.startDateLocal.slice(0, 10), kind, reserve, avgHr: a.avgHr ?? null, minutes });
    }

    const report = buildNsGuardReport(samples, { ...maxHrBase, observedMaxHr }, caps);

    // Raw per-week compliance numbers for continuous chart lines
    const easySamples = samples.filter(
      (s) => (s.kind === 'easy' || s.kind === 'long' || s.kind === 'recovery') && (s.avgHr != null || s.reserve != null),
    );
    const easyHotCount = easySamples.filter((s) => {
      if (caps.easyHrCap != null && s.avgHr != null) return s.avgHr >= caps.easyHrCap;
      if (s.reserve != null) return s.reserve >= EASY_CEILING_RESERVE;
      return false;
    }).length;

    const qualitySamples = samples.filter(
      (s) => s.kind === 'quality' && (s.avgHr != null || s.reserve != null),
    );
    const repHotCount = qualitySamples.filter((s) => {
      if (caps.subThresholdHrCap != null && s.avgHr != null) return s.avgHr >= caps.subThresholdHrCap;
      if (s.reserve != null) return s.reserve >= SUBT_HOT_RESERVE;
      return false;
    }).length;

    const totalMin = samples.reduce((sum, s) => sum + s.minutes, 0);
    const qualityMin = samples.filter((s) => s.kind === 'quality').reduce((sum, s) => sum + s.minutes, 0);

    const mon = new Date(weekStart + 'T00:00:00');
    const weekLabel = mon.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });

    points.push({
      weekLabel,
      weekStartIso: weekStart,
      easyCompliancePct: easySamples.length > 0
        ? Math.round(((easySamples.length - easyHotCount) / easySamples.length) * 100)
        : null,
      qualityPct: totalMin > 0 ? Math.round((qualityMin / totalMin) * 100) : null,
      repCompliancePct: qualitySamples.length > 0
        ? Math.round(((qualitySamples.length - repHotCount) / qualitySamples.length) * 100)
        : null,
      disciplineScore: report.disciplineScore,
      hasSessions: samples.length > 0,
    });
  }

  return points;
}
