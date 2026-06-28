'use server';

import { revalidatePath } from 'next/cache';
import { setMidEntryDismissedPeriod } from '@/lib/store/settings';

export async function dismissMidEntryBanner(periodId: number): Promise<void> {
  await setMidEntryDismissedPeriod(periodId);
  revalidatePath('/patrol');
}
