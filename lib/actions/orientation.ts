'use server';

import { revalidatePath } from 'next/cache';
import { markPatrolOrientationDismissed } from '@/lib/store/settings';

export async function dismissPatrolOrientation(): Promise<void> {
  await markPatrolOrientationDismissed();
  revalidatePath('/patrol');
}
