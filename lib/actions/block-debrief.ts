'use server';

/**
 * Phase 9 — block-end debrief action.
 *
 * Upserts one block_debriefs row per plan period. Follows the race-debrief
 * pattern: the plan period row is immutable; this captures the athlete's
 * qualitative retrospective at block end. Updates in-place if the athlete
 * revises it.
 */

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

export interface BlockDebriefResult {
  ok: boolean;
  error?: string;
}

export async function logBlockDebrief(formData: FormData): Promise<BlockDebriefResult> {
  const planPeriodId = parseInt(String(formData.get('planPeriodId') ?? ''), 10);
  if (!planPeriodId || isNaN(planPeriodId)) {
    return { ok: false, error: 'No active plan period found.' };
  }

  const felt = String(formData.get('feltAboutBlock') ?? '').trim() || null;
  const learning = String(formData.get('mainLearning') ?? '').trim() || null;
  const focus = String(formData.get('nextBlockFocus') ?? '').trim() || null;

  if (!felt && !learning && !focus) {
    return { ok: false, error: 'Enter at least one reflection.' };
  }

  try {
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.blockDebriefs)
      .where(eq(schema.blockDebriefs.planPeriodId, planPeriodId))
      .get();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: sql`(unixepoch())` };
      if (felt !== null) updates.feltAboutBlock = felt;
      if (learning !== null) updates.mainLearning = learning;
      if (focus !== null) updates.nextBlockFocus = focus;
      await db
        .update(schema.blockDebriefs)
        .set(updates)
        .where(eq(schema.blockDebriefs.id, existing.id));
    } else {
      await db.insert(schema.blockDebriefs).values({
        planPeriodId,
        feltAboutBlock: felt,
        mainLearning: learning,
        nextBlockFocus: focus,
      });
    }
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  revalidatePath('/patrol');
  return { ok: true };
}
