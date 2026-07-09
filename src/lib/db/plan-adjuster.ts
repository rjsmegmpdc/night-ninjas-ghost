import { query, execBatch } from '@/db/client';
import type { CoachAdjustment } from '@/lib/ai/coach-triggers';

export interface AdjustmentResult {
  success: boolean;
  description: string;
}

/**
 * Apply a coach-suggested adjustment to the active plan.
 * Returns a human-readable description of what changed.
 */
export async function applyCoachAdjustment(adj: CoachAdjustment): Promise<AdjustmentResult> {
  // Get active plan
  const planRows = await query(
    `SELECT p.id, p.dojo, p.params_json FROM plans p
     JOIN plan_periods pp ON pp.plan_id = p.id
     WHERE pp.end_date IS NULL ORDER BY pp.start_date DESC LIMIT 1`,
    []
  );

  if (!planRows.length) {
    return { success: false, description: 'No active plan found' };
  }

  const planId = planRows[0][0] as number;
  const currentDojo = planRows[0][1] as string;
  let params: Record<string, unknown> = {};
  try { params = JSON.parse(planRows[0][2] as string); } catch { /* ignore */ }

  if (adj.type === 'reduce_load') {
    const pct = Number(adj.params['reduce_load_pct'] ?? 15);
    // Reduce effective load by adding a recovery week marker
    params['recoveryWeekOverride'] = true;
    params['loadReductionPct'] = pct;
    await execBatch([{
      sql: `UPDATE plans SET params_json = ? WHERE id = ?`,
      params: [JSON.stringify(params), planId],
    }]);
    return { success: true, description: `Load reduced by ${pct}% for next week (recovery week inserted)` };
  }

  if (adj.type === 'extend_recovery') {
    const days = Number(adj.params['days'] ?? 7);
    // Shift plan period start date forward to give recovery time
    const ppRows = await query(
      `SELECT id, start_date FROM plan_periods WHERE plan_id = ? AND end_date IS NULL`,
      [planId]
    );
    if (ppRows.length) {
      const ppId = ppRows[0][0] as number;
      const startDate = new Date(ppRows[0][1] as string);
      startDate.setDate(startDate.getDate() + days);
      await execBatch([{
        sql: `UPDATE plan_periods SET start_date = ? WHERE id = ?`,
        params: [startDate.toISOString().slice(0, 10), ppId],
      }]);
    }
    return { success: true, description: `Recovery period extended by ${days} days — plan start shifted` };
  }

  if (adj.type === 'change_dojo') {
    const newDojo = adj.params['to'] ?? 'custom';
    await execBatch([{
      sql: `UPDATE plans SET dojo = ? WHERE id = ?`,
      params: [newDojo, planId],
    }]);
    return { success: true, description: `Training method changed from ${currentDojo} to ${newDojo}` };
  }

  return { success: false, description: 'No adjustment applied (type: none)' };
}
