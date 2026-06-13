'use server';

import { revalidatePath } from 'next/cache';
import { setStreakRunEverydayMode } from '@/lib/store/settings';

/**
 * Toggle the run-every-day streak mode.
 *
 * Pass true to require runs only; false to allow any activity. Side
 * effect: revalidates Patrol so the streak counter recomputes against
 * the new rule on next render.
 */
export async function setStreakMode(formData: FormData): Promise<void> {
  const v = formData.get('mode');
  await setStreakRunEverydayMode(v === 'true');
  revalidatePath('/patrol');
  revalidatePath('/settings');
}
