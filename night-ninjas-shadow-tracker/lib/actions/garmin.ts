'use server';

import { revalidatePath } from 'next/cache';
import { connectGarmin, submitGarminMfa } from '@/lib/garmin/client';
import { syncGarminRange } from '@/lib/garmin/sync';
import { setGarminSyncEnabled } from '@/lib/store/settings';
import { clearGarminSecrets } from '@/lib/store/secrets';
import type { GarminConnectResult } from '@/lib/garmin/types';
import type { GarminSyncResult } from '@/lib/garmin/sync';

/**
 * Server actions for Garmin (Phase 12). All marked experimental in the UI.
 */

export async function garminConnectAction(formData: FormData): Promise<GarminConnectResult> {
  const username = formData.get('username')?.toString() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  if (!username || !password) {
    return { status: 'error', error: 'Email and password are required.' };
  }
  const result = await connectGarmin(username, password);
  if (result.status === 'connected') {
    await setGarminSyncEnabled(true);
    revalidatePath('/settings');
  }
  return result;
}

export async function garminSubmitMfaAction(formData: FormData): Promise<GarminConnectResult> {
  const mfaSessionId = formData.get('mfa_session_id')?.toString() ?? '';
  const code = formData.get('code')?.toString() ?? '';
  if (!mfaSessionId || !code) {
    return { status: 'error', error: 'MFA code is required.' };
  }
  const result = await submitGarminMfa(mfaSessionId, code);
  if (result.status === 'connected') {
    await setGarminSyncEnabled(true);
    revalidatePath('/settings');
  }
  return result;
}

export async function garminSyncAction(formData: FormData): Promise<GarminSyncResult> {
  const days = Number(formData.get('days')?.toString() ?? '7') || 7;
  const result = await syncGarminRange(days);
  revalidatePath('/settings');
  revalidatePath('/strike');
  return result;
}

export async function garminDisconnectAction(): Promise<void> {
  await clearGarminSecrets();
  await setGarminSyncEnabled(false);
  revalidatePath('/settings');
}
