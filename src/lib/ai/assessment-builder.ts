/**
 * assessment-builder.ts
 *
 * Async DB-backed builder that assembles the full entry fitness assessment
 * context string for the coach.
 *
 * Fetches activities + weekly volumes, computes CTL/ATL/TSB, then delegates
 * to the pure analysis functions in fitness-assessment.ts.
 */

import { query } from '@/db/client';
import {
  getBestPaces,
  buildTrainingProfile,
  formatAssessmentContext,
} from '@/lib/analysis/fitness-assessment';
import type { RawActivity, WeeklyVolume } from '@/lib/analysis/fitness-assessment';
import {
  computeEwma,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  WINDOW_DAYS,
} from '@/lib/analysis/athlete-state-pure';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessmentContext {
  contextText: string;          // formatted string to pass to coach
  hasSufficientData: boolean;   // false if < 10 activities (can't assess meaningfully)
  activityCount: number;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a complete entry fitness assessment context from the local DB.
 *
 * Returns `hasSufficientData: false` when fewer than 10 run activities exist —
 * the coach should handle this gracefully rather than attempt an assessment.
 */
export async function buildAssessmentContext(): Promise<AssessmentContext> {
  // 1. Fetch all run activities (distance, time, speed, date, type)
  const actRows = await query(
    `SELECT distance, moving_time, average_speed, start_date, type
     FROM activities
     WHERE type IN ('Run','VirtualRun','TrailRun')
       AND distance > 0 AND moving_time > 0
     ORDER BY start_date DESC`,
    [],
  );

  const activities: RawActivity[] = actRows.map((r) => ({
    distanceM:   r[0] as number,
    movingTimeS: r[1] as number,
    avgSpeedMs:  r[2] as number,
    startDate:   r[3] as string,
    type:        r[4] as string,
  }));

  if (activities.length < 10) {
    return {
      contextText: '',
      hasSufficientData: false,
      activityCount: activities.length,
    };
  }

  // 2. Fetch weekly volumes (last 52 weeks)
  const volRows = await query(
    `SELECT strftime('%Y-%W', start_date) as week, SUM(distance)/1000.0 as km
     FROM activities
     WHERE type IN ('Run','VirtualRun','TrailRun')
       AND start_date >= date('now', '-365 days')
     GROUP BY week
     ORDER BY week ASC`,
    [],
  );

  const weeklyVolumes: WeeklyVolume[] = volRows.map((r) => ({
    weekIso: r[0] as string,
    km:      r[1] as number,
  }));

  // 3. Compute CTL/ATL/TSB using simplified TSS (10 pts/km)
  //    computeEwma signature: (dailyLoad, asOfIso, windowDays, tau)
  const dailyLoad = new Map<string, number>();
  for (const a of activities) {
    const date = a.startDate.slice(0, 10);
    const tss = (a.distanceM / 1000) * 10;
    dailyLoad.set(date, (dailyLoad.get(date) ?? 0) + tss);
  }

  const today = new Date().toISOString().slice(0, 10);
  const ctl = computeEwma(dailyLoad, today, WINDOW_DAYS, CTL_TIME_CONSTANT);
  const atl = computeEwma(dailyLoad, today, 14, ATL_TIME_CONSTANT);
  const tsb = ctl - atl;

  // 4. Build profile + best paces + context string
  const bestPaces   = getBestPaces(activities);
  const profile     = buildTrainingProfile(activities, weeklyVolumes);
  const contextText = formatAssessmentContext(
    profile,
    bestPaces,
    Math.round(ctl * 10) / 10,
    Math.round(atl * 10) / 10,
    Math.round(tsb * 10) / 10,
  );

  return {
    contextText,
    hasSufficientData: true,
    activityCount: activities.length,
  };
}
