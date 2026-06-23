'use server';
import { eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/lib/db';

export interface SetCapacityResult {
  ok: boolean;
  error?: string;
}

/**
 * Phase 14 — write per-block capacity settings to the active plan_periods row.
 *
 * Empty string for a field = clear the per-block cap (revert to global
 * settings / engine default). Non-empty = validate and save.
 *
 * Both caps are updated together in a single DB write so they stay in sync.
 */
export async function setPlanCapacity(fd: FormData): Promise<SetCapacityResult> {
  const db = getDb();
  const activeRow = await db
    .select({ id: schema.planPeriods.id })
    .from(schema.planPeriods)
    .where(isNull(schema.planPeriods.endDate))
    .get();

  if (!activeRow) {
    return {
      ok: false,
      error: 'No active plan period. Start a block first (use the maintenance button on this page).',
    };
  }

  const weeklyRaw = String(fd.get('weekly_volume_cap_km') ?? '').trim();
  const longRaw = String(fd.get('long_run_cap_km') ?? '').trim();

  const weeklyVal = weeklyRaw === '' ? null : parseFloat(weeklyRaw);
  const longVal = longRaw === '' ? null : parseFloat(longRaw);

  if (weeklyRaw !== '') {
    if (isNaN(weeklyVal!) || weeklyVal! < 20 || weeklyVal! > 300) {
      return { ok: false, error: 'Weekly cap must be between 20 and 300 km.' };
    }
  }
  if (longRaw !== '') {
    if (isNaN(longVal!) || longVal! < 10 || longVal! > 50) {
      return { ok: false, error: 'Long-run cap must be between 10 and 50 km.' };
    }
    if (weeklyRaw !== '' && longVal! >= weeklyVal!) {
      return { ok: false, error: 'Long-run cap should be less than the weekly volume cap.' };
    }
  }

  await db
    .update(schema.planPeriods)
    .set({ weeklyVolumeCapKm: weeklyVal, longRunCapKm: longVal })
    .where(eq(schema.planPeriods.id, activeRow.id));

  revalidatePath('/dojo');
  revalidatePath('/patrol');
  return { ok: true };
}
