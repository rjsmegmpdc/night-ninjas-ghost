/**
 * Profile sync — optional backup/restore of the small setup blob via the
 * oauth-worker's Access-protected /sync endpoints.
 *
 * What syncs: Strava API app credentials + display preferences + gear
 * profile. Never activities — any device re-pulls those from Strava.
 *
 * Auth flow (no third-party cookies, mobile-Safari safe):
 *   1. App navigates to  <worker>/sync/start?return_to=<app>/setup
 *   2. Cloudflare Access intercepts → email + one-time PIN
 *   3. Worker bounces back to /setup#sync_token=<Access JWT>
 *   4. App calls /sync/profile with  Authorization: Bearer <jwt>
 *
 * End-to-end encryption: the blob is encrypted on-device with a key
 * derived from a user passphrase (PBKDF2-SHA256 → AES-256-GCM) before
 * upload. The server — including the deployment owner — stores only
 * ciphertext. There is no passphrase reset: losing it means backing up
 * again from a configured device.
 */

import { getStravaCredentials, saveStravaCredentials } from '@/lib/strava/credentials';
import {
  encryptProfile,
  decryptProfile,
  type ProfileBlob,
  type EncryptedEnvelope,
} from '@/lib/sync-crypto-pure';

export type { ProfileBlob, EncryptedEnvelope } from '@/lib/sync-crypto-pure';

const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

export type SyncIntent = 'backup' | 'restore';

// ---------------------------------------------------------------------------
// Auth handoff
// ---------------------------------------------------------------------------

export function startSyncAuth(intent: SyncIntent): void {
  sessionStorage.setItem('ghost.sync_intent', intent);
  const returnTo = encodeURIComponent(`${window.location.origin}/setup`);
  window.location.href = `${WORKER_URL}/sync/start?return_to=${returnTo}`;
}

/**
 * Call on /setup mount. If we just returned from Access, captures the JWT
 * from the fragment, cleans the URL, and returns the pending intent.
 */
export function consumeSyncReturn(): SyncIntent | null {
  const match = window.location.hash.match(/sync_token=([^&]+)/);
  if (!match) return null;
  sessionStorage.setItem('ghost.sync_jwt', match[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const intent = sessionStorage.getItem('ghost.sync_intent') as SyncIntent | null;
  sessionStorage.removeItem('ghost.sync_intent');
  return intent;
}

function getJwt(): string {
  const jwt = sessionStorage.getItem('ghost.sync_jwt');
  if (!jwt) throw new Error('Not authenticated for sync — try again');
  return jwt;
}

// ---------------------------------------------------------------------------
// Blob build / apply
// ---------------------------------------------------------------------------

export async function buildProfileBlob(): Promise<ProfileBlob> {
  const creds = await getStravaCredentials();
  const blob: ProfileBlob = { v: 1 };
  // Only locally entered credentials are worth backing up — a baked-in
  // deployment's env client ID travels with the deployment, not the user.
  if (creds?.clientSecret) {
    blob.clientId = creds.clientId;
    blob.clientSecret = creds.clientSecret;
  }
  blob.prefs = {
    homePage:    localStorage.getItem('ghost.home_page')    ?? undefined,
    fontScale:   localStorage.getItem('ghost.font_scale')   ?? undefined,
    colorPreset: localStorage.getItem('ghost.color_preset') ?? undefined,
  };
  const gearProfile = localStorage.getItem('ghost.gear_profile');
  if (gearProfile) blob.gearProfile = gearProfile;
  return blob;
}

export async function applyProfileBlob(blob: ProfileBlob): Promise<{ restoredCreds: boolean }> {
  let restoredCreds = false;
  if (blob.clientId && blob.clientSecret) {
    await saveStravaCredentials(blob.clientId, blob.clientSecret);
    restoredCreds = true;
  }
  const p = blob.prefs ?? {};
  if (p.homePage)    localStorage.setItem('ghost.home_page',    p.homePage);
  if (p.fontScale)   localStorage.setItem('ghost.font_scale',   p.fontScale);
  if (p.colorPreset) localStorage.setItem('ghost.color_preset', p.colorPreset);
  if (blob.gearProfile) localStorage.setItem('ghost.gear_profile', blob.gearProfile);

  // Apply display prefs live — same effect as applyDisplayPrefs() at boot
  const root = document.documentElement;
  if (p.fontScale) root.style.setProperty('--font-scale', p.fontScale);
  if (p.colorPreset) {
    if (p.colorPreset === 'ink') {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    } else {
      root.setAttribute('data-theme', p.colorPreset);
      root.style.colorScheme = p.colorPreset === 'dawn' ? 'light' : 'dark';
    }
  }
  return { restoredCreds };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function uploadProfile(passphrase: string): Promise<void> {
  const blob = await buildProfileBlob();
  const envelope = await encryptProfile(blob, passphrase);
  const res = await fetch(`${WORKER_URL}/sync/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getJwt()}`,
    },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Backup failed (${res.status}): ${body}`);
  }
}

export async function downloadAndDecryptProfile(passphrase: string): Promise<ProfileBlob> {
  const res = await fetch(`${WORKER_URL}/sync/profile`, {
    headers: { Authorization: `Bearer ${getJwt()}` },
  });
  if (res.status === 404) throw new Error('No backup found for this email — back up from your other device first');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Restore failed (${res.status}): ${body}`);
  }
  const data = await res.json() as EncryptedEnvelope | ProfileBlob;
  if ('ct' in data) return decryptProfile(data, passphrase);
  // Legacy v1 plaintext blob (pre-encryption MVP) — apply as-is
  return data;
}
