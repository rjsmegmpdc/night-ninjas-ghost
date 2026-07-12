import type { AiPlan } from '@/../oauth-worker/src/plan-prompt';

export type { AiPlan };

const WORKER_URL =
  (import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined) ?? '';

export async function callGeneratePlan(params: {
  athleteId: number;
  context: string;
  goalDistanceKm: number;
  goalTimeS: number;
  weeksAvailable: number;
}): Promise<AiPlan> {
  if (!WORKER_URL) throw new Error('VITE_STRAVA_OAUTH_WORKER not configured');
  const res = await fetch(`${WORKER_URL}/generate-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Plan generation failed (${res.status})`);
  }
  return res.json() as Promise<AiPlan>;
}

export async function saveAiPlan(planId: number, plan: AiPlan): Promise<void> {
  const { execBatch } = await import('@/db/client');

  const stmts: { sql: string; params?: unknown[] }[] = [
    {
      sql: 'DELETE FROM ai_plan_sessions WHERE plan_id = ?',
      params: [planId],
    },
  ];

  for (const week of plan.weeks) {
    for (const day of week.days) {
      stmts.push({
        sql: `INSERT INTO ai_plan_sessions
              (plan_id, week_number, dow, session_type, label, distance_km_min, distance_km_max, pace_target, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          planId,
          week.weekNumber,
          day.dow,
          day.sessionType,
          day.label,
          day.distanceKmMin ?? null,
          day.distanceKmMax ?? null,
          day.paceTarget ?? null,
          day.notes ?? null,
        ],
      });
    }
  }

  await execBatch(stmts);
}
