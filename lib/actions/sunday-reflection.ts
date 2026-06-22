'use server';

/**
 * Phase 9 — Sunday-night reflection prompt.
 *
 * Upserts three free-text reflection fields onto the journal row for the
 * supplied date. Uses the same no-clobber pattern as wellness.ts — partial
 * submits never overwrite fields the athlete didn't touch.
 */

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

export interface SundayReflectionResult {
  ok: boolean;
  error?: string;
}

export async function logSundayReflection(formData: FormData): Promise<SundayReflectionResult> {
  const date = String(formData.get('date') ?? '').trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };

  const felt = String(formData.get('reflectionFelt') ?? '').trim() || null;
  const worked = String(formData.get('reflectionWorked') ?? '').trim() || null;
  const uncertain = String(formData.get('reflectionUncertain') ?? '').trim() || null;

  if (!felt && !worked && !uncertain) {
    return { ok: false, error: 'Enter at least one reflection field.' };
  }

  const insertVals: typeof schema.journal.$inferInsert = { date };
  const updates: Record<string, unknown> = { updatedAt: sql`(unixepoch())` };

  if (felt !== null) { insertVals.reflectionFelt = felt; updates.reflectionFelt = felt; }
  if (worked !== null) { insertVals.reflectionWorked = worked; updates.reflectionWorked = worked; }
  if (uncertain !== null) { insertVals.reflectionUncertain = uncertain; updates.reflectionUncertain = uncertain; }

  try {
    await getDb()
      .insert(schema.journal)
      .values(insertVals)
      .onConflictDoUpdate({ target: schema.journal.date, set: updates });
  } catch {
    return { ok: false, error: 'Could not save. Has the database been migrated?' };
  }

  revalidatePath('/patrol');
  revalidatePath('/journal');
  return { ok: true };
}
