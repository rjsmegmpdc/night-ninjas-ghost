/**
 * Athlete state — CTL / ATL / TSB derived from the load point-stream.
 *
 * Implements the Banister Performance Manager Chart (PMC) model on
 * Daniels-points input rather than TSS. Same exponentially-weighted
 * moving averages, just a different unit. The relative-magnitude
 * relationships and physiological interpretation are identical.
 *
 *   CTL — Chronic Training Load. 28-day exponentially-weighted moving
 *         average of daily load points. Represents fitness — what the
 *         athlete can sustain. Slow to change.
 *
 *   ATL — Acute Training Load. 7-day EWMA. Represents recent fatigue.
 *         Fast to change.
 *
 *   TSB — Training Stress Balance. CTL − ATL. Represents form / freshness.
 *         Positive = fresh; negative = loaded.
 *
 * Window: 8 weeks (56 days) of historical activity is queried to populate
 * the EWMAs. Long enough that the chronic average is fully populated
 * (CTL τ=42 days needs ~6 weeks to converge), short enough that ancient
 * training noise doesn't pollute current state.
 *
 * The pure math (EWMA, classification, confidence rollup) lives in
 * `./athlete-state-pure.ts` so it can be unit-tested without spinning
 * up SQLite or the server-only runtime.
 */

import 'server-only';
import { gte, lte, and } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { computeActivityLoad, type AthleteCalibration } from './load';
import {
  computeEwma,
  classifyForm,
  rollupConfidence,
  round1,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  WINDOW_DAYS,
  type FormClass,
} from './athlete-state-pure';

export type { FormClass };

export interface AthleteState {
  asOfIso: string;
  ctl: number;
  atl: number;
  tsb: number;
  formClass: FormClass;
  confidence: 'calibrated' | 'pace-only' | 'estimated';
  activityCount: number;
}

export async function getAthleteState(
  calibration: AthleteCalibration = {},
  asOfIso?: string
): Promise<AthleteState | null> {
  const today = asOfIso ?? new Date().toISOString().slice(0, 10);
  const windowStart = new Date(today + 'T00:00:00');
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const db = getDb();
  const activities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        gte(schema.activities.startDateLocal, windowStartIso),
        lte(schema.activities.startDateLocal, today + 'T23:59:59')
      )
    )
    .all();

  if (activities.length === 0) return null;

  const dailyLoad = new Map<string, number>();
  const confidenceCounts = { calibrated: 0, 'pace-only': 0, estimated: 0 };
  let withLoad = 0;

  for (const a of activities) {
    const load = computeActivityLoad(a, calibration);
    if (!load) continue;
    withLoad++;
    confidenceCounts[load.confidence]++;
    const dayIso = a.startDateLocal.slice(0, 10);
    dailyLoad.set(dayIso, (dailyLoad.get(dayIso) ?? 0) + load.points);
  }

  const ctl = computeEwma(dailyLoad, today, WINDOW_DAYS, CTL_TIME_CONSTANT);
  const atl = computeEwma(dailyLoad, today, WINDOW_DAYS, ATL_TIME_CONSTANT);
  const tsb = ctl - atl;

  return {
    asOfIso: today,
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(tsb),
    formClass: classifyForm(tsb),
    confidence: rollupConfidence(confidenceCounts, withLoad),
    activityCount: withLoad,
  };
}
