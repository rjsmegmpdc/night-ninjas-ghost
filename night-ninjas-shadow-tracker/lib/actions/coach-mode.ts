'use server';

import { revalidatePath } from 'next/cache';
import { setCoachMode, type CoachMode } from '@/lib/store/settings';

export async function updateCoachMode(formData: FormData) {
  const v = formData.get('value')?.toString();
  if (v !== 'manual' && v !== 'assisted' && v !== 'automatic') return;
  await setCoachMode(v as CoachMode);
  revalidatePath('/settings');
  revalidatePath('/patrol');
}
