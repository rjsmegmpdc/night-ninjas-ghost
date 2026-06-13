'use server';

import { revalidatePath } from 'next/cache';
import { setFirstDayOfWeek } from '@/lib/store/settings';

/**
 * Update the first-day-of-week display preference.
 *
 * Accepts a FormData with a 'value' field set to 'monday' or 'sunday'.
 * Persists via setFirstDayOfWeek then revalidates the surfaces that
 * read the setting (Patrol matrix and Settings page itself).
 */
export async function updateFirstDayOfWeek(formData: FormData) {
  const raw = formData.get('value')?.toString();
  if (raw !== 'monday' && raw !== 'sunday') {
    throw new Error("first-day-of-week must be 'monday' or 'sunday'");
  }
  await setFirstDayOfWeek(raw);
  revalidatePath('/patrol');
  revalidatePath('/settings');
}
