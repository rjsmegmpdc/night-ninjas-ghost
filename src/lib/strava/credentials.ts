/**
 * Strava API app credentials — per-user, stored locally.
 *
 * Every user creates their own (free) Strava API app and pastes its
 * Client ID + Client Secret into the guided Setup wizard. Both are stored
 * in the local SQLite settings table — they never leave the device except
 * inside token requests to Strava (via the CORS-proxy worker).
 *
 * A build-time VITE_STRAVA_CLIENT_ID remains as a fallback so deployments
 * that bake in a shared app (secret held by the worker) keep working.
 */

import { getSetting, setSetting } from '@/lib/db/settings';

export interface StravaAppCredentials {
  clientId: string;
  /** null = baked-in deployment; the worker holds the secret. */
  clientSecret: string | null;
}

const ENV_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;

export async function getStravaCredentials(): Promise<StravaAppCredentials | null> {
  const [id, secret] = await Promise.all([
    getSetting('strava.client_id'),
    getSetting('strava.client_secret'),
  ]);
  if (id && secret) return { clientId: id, clientSecret: secret };
  if (ENV_CLIENT_ID) return { clientId: ENV_CLIENT_ID, clientSecret: null };
  return null;
}

/**
 * Credentials shaped for token requests — null for baked-in deployments
 * (worker holds the secret, request carries none) and when not configured.
 */
export async function getTokenCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const creds = await getStravaCredentials();
  return creds?.clientSecret ? { clientId: creds.clientId, clientSecret: creds.clientSecret } : null;
}

export async function saveStravaCredentials(clientId: string, clientSecret: string): Promise<void> {
  await setSetting('strava.client_id', clientId.trim());
  await setSetting('strava.client_secret', clientSecret.trim());
}

export async function clearStravaCredentials(): Promise<void> {
  await setSetting('strava.client_id', '');
  await setSetting('strava.client_secret', '');
}
