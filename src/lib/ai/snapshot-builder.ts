import { query } from '@/db/client';
import { ENGINES, type Dojo } from '@/lib/plans/index';
import type { AthleteSnapshot, BiometricsSnapshot, RecentActivitySnapshot } from './context-pure';
import { loadCoachingHistory } from './coaching-memory';
import {
  computeEwma,
  classifyForm,
  rollupConfidence,
  CTL_TIME_CONSTANT,
  ATL_TIME_CONSTANT,
  WINDOW_DAYS,
} from '@/lib/analysis/athlete-state-pure';
import { computeActivityLoad, type LoadConfidence } from '@/lib/analysis/load';
import { computeReadiness, computeBaselineFromHistory, type ReadinessInputs } from '@/lib/analysis/readiness-pure';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function localIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentWeekBounds(): { startIso: string; endIso: string } {
  const now = new Date();
  const daysFromMon = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { startIso: localIso(mon), endIso: localIso(sun) };
}

function currentDow(): number {
  return (new Date().getDay() + 6) % 7; // Mon=0, Sun=6
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / 86_400_000
  );
}

function parseGoalTime(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export async function buildAthleteSnapshot(): Promise<AthleteSnapshot> {
  const todayIso = localIso();
  const { startIso, endIso } = currentWeekBounds();

  // Cutoff for the PMC window (56 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - WINDOW_DAYS);
  const cutoffIso = localIso(cutoffDate);

  // -- Run plan + PMC queries in parallel -----------------------------------
  const [planRows, pmcRows] = await Promise.all([
    query(
      `SELECT p.dojo, p.params_json, pp.start_date
       FROM plan_periods pp JOIN plans p ON p.id = pp.plan_id
       WHERE pp.end_date IS NULL ORDER BY pp.start_date DESC LIMIT 1`,
      []
    ),
    query(
      `SELECT start_date, distance, moving_time, average_heartrate, sport_type, average_speed, name, type
       FROM activities WHERE start_date >= ? AND start_date <= ? ORDER BY start_date`,
      [cutoffIso, todayIso + 'T99:99:99']
    ),
  ]);

  // -- Compute CTL/ATL/TSB from PMC rows ------------------------------------
  const dailyLoads = new Map<string, number>();
  let activityCount = 0;
  const confCounts = { calibrated: 0, 'pace-only': 0, estimated: 0 };

  for (const r of pmcRows) {
    const dayKey = (r[0] as string).slice(0, 10);
    const result = computeActivityLoad(
      {
        sportType: r[4] as string | null,
        type:      r[7] as string,
        name:      r[6] as string | null,
        movingTimeS: (r[2] as number) ?? 0,
        avgHr:     r[3] as number | null,
        avgSpeedMs: r[5] as number | null,
      },
      {},
    );
    if (!result) continue;
    activityCount++;
    dailyLoads.set(dayKey, (dailyLoads.get(dayKey) ?? 0) + result.points);
    const conf = result.confidence as LoadConfidence;
    if (conf === 'calibrated') confCounts.calibrated++;
    else if (conf === 'pace-only') confCounts['pace-only']++;
    else confCounts.estimated++;
  }

  const ctlVal  = computeEwma(dailyLoads, todayIso, WINDOW_DAYS, CTL_TIME_CONSTANT);
  const atlVal  = computeEwma(dailyLoads, todayIso, WINDOW_DAYS, ATL_TIME_CONSTANT);
  const tsbVal  = ctlVal - atlVal;
  const formClass  = classifyForm(tsbVal);
  const confidence = rollupConfidence(confCounts, activityCount);

  const athleteState = activityCount >= 7
    ? {
        ctl: Math.round(ctlVal * 10) / 10,
        atl: Math.round(atlVal * 10) / 10,
        tsb: Math.round(tsbVal * 10) / 10,
        formClass,
        confidence,
      }
    : null;

  // -- Active plan ----------------------------------------------------------
  const hasPlan = planRows.length > 0;
  const dojo = hasPlan ? (planRows[0][0] as string) : 'custom';
  let level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
  let programWeeks = 18;
  let startDate = todayIso;
  try {
    if (hasPlan) {
      startDate = planRows[0][2] as string;
      const params = JSON.parse(planRows[0][1] as string);
      if (params.level) level = params.level;
      if (params.programWeeks) programWeeks = params.programWeeks;
    }
  } catch { /* ignore */ }

  const daysIntoPlan = daysBetween(startDate, todayIso);
  const wk = Math.max(1, Math.floor(daysIntoPlan / 7) + 1);

  // -- Goal race ------------------------------------------------------------
  const goalRows = await query(
    `SELECT date, name, distance_km, goal_time FROM races WHERE is_goal = 1 ORDER BY date ASC LIMIT 1`,
    []
  );
  const goalRaceDate = goalRows.length ? (goalRows[0][0] as string) : null;
  const daysToRace = goalRaceDate ? daysBetween(todayIso, goalRaceDate) : null;
  const goalDistanceKm = goalRows.length ? ((goalRows[0][2] as number) ?? 42.195) : 42.195;
  const goalTimeS = goalRows.length ? parseGoalTime(goalRows[0][3] as string | null) : null;

  // -- This week's run stats ------------------------------------------------
  const weekRows = await query(
    `SELECT distance, moving_time, average_heartrate, average_speed
     FROM activities
     WHERE start_date >= ? AND start_date <= ? AND type IN ('Run','VirtualRun','TrailRun')`,
    [startIso, endIso + 'T99:99:99']
  );

  const weekRuns = weekRows.map((r) => ({
    km: ((r[0] as number) ?? 0) / 1000,
    timeS: (r[1] as number) ?? 0,
    hr: r[2] as number | null,
    speedMs: r[3] as number | null,
  }));

  const totalKm = weekRuns.reduce((s, a) => s + a.km, 0);
  const longRunKm = weekRuns.length ? Math.max(...weekRuns.map((a) => a.km)) : 0;
  const totalTimeS = weekRuns.reduce((s, a) => s + a.timeS, 0);
  const avgPaceSpk = totalKm > 0 && totalTimeS > 0 ? totalTimeS / totalKm : null;
  const hrRuns = weekRuns.filter((a) => a.hr != null && a.timeS > 0);
  const avgHr = hrRuns.length > 0
    ? hrRuns.reduce((s, a) => s + (a.hr ?? 0) * a.timeS, 0) / hrRuns.reduce((s, a) => s + a.timeS, 0)
    : null;

  // -- Today's session from plan engine -------------------------------------
  let todaySession: AthleteSnapshot['todaySession'] = null;
  let targetKm = 50;

  if (dojo === 'ai-coach') {
    // Load today's session from ai_plan_sessions (DB-backed AI plan)
    const [aiRows, weekTotal] = await Promise.all([
      query(
        `SELECT aps.session_type, aps.label, aps.distance_km_min, aps.distance_km_max, aps.pace_target
         FROM ai_plan_sessions aps
         JOIN plan_periods pp ON pp.plan_id = aps.plan_id
         WHERE pp.end_date IS NULL
           AND aps.week_number = ?
           AND aps.dow = ?`,
        [wk, currentDow()]
      ).catch(() => [] as unknown[][]),
      query(
        `SELECT SUM(aps.distance_km_max) as target
         FROM ai_plan_sessions aps
         JOIN plan_periods pp ON pp.plan_id = aps.plan_id
         WHERE pp.end_date IS NULL AND aps.week_number = ?`,
        [wk]
      ).catch(() => [] as unknown[][]),
    ]);
    targetKm = (weekTotal[0]?.[0] as number | null) ?? 50;
    if (aiRows.length > 0) {
      const r = aiRows[0];
      const sType = r[0] as string;
      if (sType !== 'rest') {
        const dkMin = r[2] as number | null;
        const dkMax = r[3] as number | null;
        const dist =
          dkMin != null && dkMax != null
            ? `${dkMin.toFixed(0)}–${dkMax.toFixed(0)}km`
            : dkMin != null
              ? `${dkMin.toFixed(0)}km`
              : 'see plan';
        todaySession = { label: r[1] as string, type: sType, prescription: dist };
      }
    }
  } else {
    const engine = ENGINES[dojo as Dojo];
    if (engine) {
      const params = { goalDistanceKm, goalTimeS: goalTimeS ?? 12600, level, programWeeks, startDate };
      const template = engine.renderWeek(params, wk);
      targetKm = template.totalKmTarget;
      const dayPlan = template.days.find((d) => d.dow === currentDow());
      if (dayPlan && dayPlan.sessions.length > 0 && dayPlan.sessions[0].type !== 'rest') {
        const s = dayPlan.sessions[0];
        const dist =
          s.distanceKmMin != null && s.distanceKmMax != null
            ? `${s.distanceKmMin.toFixed(0)}–${s.distanceKmMax.toFixed(0)}km`
            : s.durationMinMin != null
              ? `${s.durationMinMin}–${s.durationMinMax ?? s.durationMinMin}min`
              : 'see plan';
        todaySession = { label: s.label, type: s.type ?? 'run', prescription: dist };
      }
    }
  }

  // -- Recent activities (last 7) -------------------------------------------
  const recentRows = await query(
    `SELECT start_date, type, name, distance, moving_time, average_heartrate, average_speed
     FROM activities ORDER BY start_date DESC LIMIT 7`,
    []
  );

  const recentActivities: RecentActivitySnapshot[] = recentRows.map((r) => {
    const km = ((r[3] as number) ?? 0) / 1000;
    const speedMs = r[6] as number | null;
    return {
      date: (r[0] as string).slice(0, 10),
      type: r[1] as string,
      name: r[2] as string | null,
      distanceKm: km > 0 ? km : null,
      avgPaceSpk: speedMs && speedMs > 0 ? 1000 / speedMs : null,
      avgHr: r[5] as number | null,
    };
  });

  // -- Phase kind -----------------------------------------------------------
  const phaseKind = hasPlan
    ? wk <= 2 ? 'base-start'
      : wk >= programWeeks - 2 ? 'taper'
      : wk >= Math.round(programWeeks * 0.65) ? 'peak'
      : 'build'
    : 'off-season';

  // -- Today's biometrics: merge journal (HRV, RHR) + daily_health_metrics --
  const [journalBioRows, healthRows] = await Promise.all([
    query(
      `SELECT resting_hr, hrv FROM journal WHERE date = ? LIMIT 1`,
      [todayIso]
    ),
    query(
      `SELECT rhr_bpm, hrv_ms, sleep_duration_s, sleep_score, stress_score, body_battery
       FROM daily_health_metrics WHERE date = ? ORDER BY synced_at DESC LIMIT 1`,
      [todayIso]
    ).catch(() => [] as unknown[][]),
  ]);

  let biometrics: BiometricsSnapshot | null = null;
  const rhrBpm      = (healthRows[0]?.[0] ?? journalBioRows[0]?.[0]) as number | null;
  const hrvMs       = (healthRows[0]?.[1] ?? (journalBioRows[0]?.[1] != null ? journalBioRows[0][1] : null)) as number | null;
  const sleepDurationS = healthRows[0]?.[2] as number | null ?? null;
  const sleepScore     = healthRows[0]?.[3] as number | null ?? null;
  const stressScore    = healthRows[0]?.[4] as number | null ?? null;
  const bodyBattery    = healthRows[0]?.[5] as number | null ?? null;
  if (rhrBpm != null || hrvMs != null || bodyBattery != null || sleepScore != null) {
    biometrics = { rhrBpm, hrvMs, sleepDurationS, sleepScore, stressScore, bodyBattery };
  }

  // -- 7-day biometric trends + readiness score ----------------------------
  const [trendHealthRows, trendJournalRows, baselineHealthRows, baselineJournalRows] = await Promise.all([
    query(
      `SELECT date, hrv_ms, rhr_bpm, sleep_score, body_battery, stress_score
       FROM daily_health_metrics
       WHERE date >= date('now', '-14 days')
       ORDER BY date ASC`,
      []
    ).catch(() => [] as unknown[][]),
    query(
      `SELECT date, hrv, resting_hr
       FROM journal
       WHERE date >= date('now', '-14 days')
       ORDER BY date ASC`,
      []
    ).catch(() => [] as unknown[][]),
    query(
      `SELECT date, hrv_ms, rhr_bpm
       FROM daily_health_metrics
       WHERE date >= date('now', '-28 days') AND date < date('now', '-14 days')
       ORDER BY date ASC`,
      []
    ).catch(() => [] as unknown[][]),
    query(
      `SELECT date, hrv, resting_hr
       FROM journal
       WHERE date >= date('now', '-28 days') AND date < date('now', '-14 days')
       ORDER BY date ASC`,
      []
    ).catch(() => [] as unknown[][]),
  ]);

  function mergeMetricRows(
    healthRows: unknown[][],
    journalRows: unknown[][],
    window: '14d' | 'baseline',
  ): ReadinessInputs[] {
    const healthByDate = new Map<string, unknown[]>();
    for (const row of healthRows) {
      const d = (row[0] as string).slice(0, 10);
      if (!healthByDate.has(d)) healthByDate.set(d, row);
    }
    const journalByDate = new Map<string, unknown[]>();
    for (const row of journalRows) {
      const d = (row[0] as string).slice(0, 10);
      if (!journalByDate.has(d)) journalByDate.set(d, row);
    }
    const dates = new Set([...healthByDate.keys(), ...journalByDate.keys()]);
    const result: ReadinessInputs[] = [];
    for (const date of [...dates].sort()) {
      const h = healthByDate.get(date);
      const j = journalByDate.get(date);
      if (window === '14d') {
        result.push({
          hrvMs:        (h?.[1] ?? (j?.[1] != null ? j[1] : null)) as number | null,
          rhrBpm:       (h?.[2] ?? (j?.[2] != null ? j[2] : null)) as number | null,
          sleepScore:   (h?.[3] ?? null) as number | null,
          sleepDurationS: null,
          bodyBattery:  (h?.[4] ?? null) as number | null,
          stressScore:  (h?.[5] ?? null) as number | null,
        });
      } else {
        result.push({
          hrvMs:        (h?.[1] ?? (j?.[1] != null ? j[1] : null)) as number | null,
          rhrBpm:       (h?.[2] ?? (j?.[2] != null ? j[2] : null)) as number | null,
          sleepScore:   null,
          sleepDurationS: null,
          bodyBattery:  null,
          stressScore:  null,
        });
      }
    }
    return result;
  }

  const trendInputs = mergeMetricRows(trendHealthRows, trendJournalRows, '14d');

  const todayDate = new Date(todayIso + 'T00:00:00Z');
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setUTCDate(todayDate.getUTCDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10);

  function mergeMetricRowsWithDates(
    healthRows: unknown[][],
    journalRows: unknown[][],
  ): { date: string; inputs: ReadinessInputs }[] {
    const healthByDate = new Map<string, unknown[]>();
    for (const row of healthRows) {
      const d = (row[0] as string).slice(0, 10);
      if (!healthByDate.has(d)) healthByDate.set(d, row);
    }
    const journalByDate = new Map<string, unknown[]>();
    for (const row of journalRows) {
      const d = (row[0] as string).slice(0, 10);
      if (!journalByDate.has(d)) journalByDate.set(d, row);
    }
    const dates = new Set([...healthByDate.keys(), ...journalByDate.keys()]);
    return [...dates].sort().map((date) => {
      const h = healthByDate.get(date);
      const j = journalByDate.get(date);
      return {
        date,
        inputs: {
          hrvMs:         (h?.[1] ?? (j?.[1] != null ? j[1] : null)) as number | null,
          rhrBpm:        (h?.[2] ?? (j?.[2] != null ? j[2] : null)) as number | null,
          sleepScore:    (h?.[3] ?? null) as number | null,
          sleepDurationS: null,
          bodyBattery:   (h?.[4] ?? null) as number | null,
          stressScore:   (h?.[5] ?? null) as number | null,
        },
      };
    });
  }

  const trendWithDates = mergeMetricRowsWithDates(trendHealthRows, trendJournalRows);
  const recent7d  = trendWithDates.filter((r) => r.date > sevenDaysAgoIso);
  const prior7d   = trendWithDates.filter((r) => r.date <= sevenDaysAgoIso);

  function avg(values: (number | null)[]): number | null {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }

  const hrv7dAvg    = avg(recent7d.map((r) => r.inputs.hrvMs));
  const hrvPriorAvg = avg(prior7d.map((r) => r.inputs.hrvMs));
  let hrv7dDirection: 'up' | 'down' | 'stable' = 'stable';
  if (hrv7dAvg !== null && hrvPriorAvg !== null && hrvPriorAvg > 0) {
    const pctChange = (hrv7dAvg - hrvPriorAvg) / hrvPriorAvg;
    if (pctChange > 0.05) hrv7dDirection = 'up';
    else if (pctChange < -0.05) hrv7dDirection = 'down';
  }

  const sleep7dAvg = avg(recent7d.map((r) => r.inputs.sleepScore));
  const rhr7dAvg   = avg(recent7d.map((r) => r.inputs.rhrBpm));

  const allBaselineInputs = [
    ...mergeMetricRows(baselineHealthRows, baselineJournalRows, 'baseline'),
    ...trendInputs,
  ];
  const baselines = computeBaselineFromHistory(allBaselineInputs);
  const todayReadiness = biometrics
    ? computeReadiness(
        {
          hrvMs:          biometrics.hrvMs,
          rhrBpm:         biometrics.rhrBpm,
          sleepScore:     biometrics.sleepScore,
          sleepDurationS: biometrics.sleepDurationS,
          stressScore:    biometrics.stressScore,
          bodyBattery:    biometrics.bodyBattery,
        },
        baselines,
      )
    : null;

  const hasTrendData = recent7d.length > 0 || biometrics !== null;
  const biometricsTrend: AthleteSnapshot['biometricsTrend'] = hasTrendData
    ? {
        hrv7dAvg:       hrv7dAvg !== null ? Math.round(hrv7dAvg * 10) / 10 : null,
        hrv7dDirection,
        sleep7dAvg:     sleep7dAvg !== null ? Math.round(sleep7dAvg * 10) / 10 : null,
        rhr7dAvg:       rhr7dAvg !== null ? Math.round(rhr7dAvg * 10) / 10 : null,
        readinessScore: todayReadiness?.score ?? null,
        readinessLabel: todayReadiness?.label ?? null,
      }
    : undefined;

  // -- Coaching history (last 8 sessions + dojo trail + 12-week compliance) -
  const coachingHistory = await loadCoachingHistory().then((h) => {
    const total = h.complianceRecord.length;
    const compliant = h.complianceRecord.filter((w) => w.score >= 0.75).length;
    let consecutiveMissed = 0;
    for (const w of h.complianceRecord) {
      if (w.score < 0.75) consecutiveMissed++;
      else break;
    }
    const compliancePattern =
      total === 0
        ? 'no data'
        : consecutiveMissed > 0
          ? `${compliant}/${total} weeks compliant, ${consecutiveMissed} consecutive missed`
          : `${compliant}/${total} weeks compliant`;
    return {
      recentSessions: h.recentSessions.map((s) => ({
        type: s.sessionType,
        date: s.referenceDate,
        summary: s.response.slice(0, 120).replace(/\n/g, ' '),
      })),
      dojoHistory: h.dojoHistory,
      compliancePattern,
    };
  }).catch(() => undefined as AthleteSnapshot['coachingHistory']);

  return {
    asOfIso: todayIso,
    dojo,
    weekNumber: hasPlan ? wk : null,
    programWeeks: hasPlan ? programWeeks : null,
    phaseKind,
    daysToRace,
    todaySession,
    week: { totalKm, longRunKm, avgPaceSpk, avgHr, sessions: weekRuns.length, targetKm },
    state: athleteState,
    biometrics,
    biometricsTrend,
    recentActivities,
    activeInjuries: [],
    coachingHistory,
  };
}
