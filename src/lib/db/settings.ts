import { query, exec } from '@/db/client';

export async function getSetting(key: string): Promise<string | null> {
  const rows = await query('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length ? (rows[0][0] as string) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  await exec('DELETE FROM settings WHERE key = ?', [key]);
}

// ---------------------------------------------------------------------------
// Strava token helpers
// ---------------------------------------------------------------------------

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix timestamp seconds
  athleteName: string;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const [at, rt, exp, name] = await Promise.all([
    getSetting('strava_access_token'),
    getSetting('strava_refresh_token'),
    getSetting('strava_expires_at'),
    getSetting('strava_athlete_name'),
  ]);
  if (!at || !rt || !exp) return null;
  return {
    accessToken: at,
    refreshToken: rt,
    expiresAt: Number(exp),
    athleteName: name ?? '',
  };
}

export async function storeTokens(t: StoredTokens): Promise<void> {
  await Promise.all([
    setSetting('strava_access_token', t.accessToken),
    setSetting('strava_refresh_token', t.refreshToken),
    setSetting('strava_expires_at', String(t.expiresAt)),
    setSetting('strava_athlete_name', t.athleteName),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    deleteSetting('strava_access_token'),
    deleteSetting('strava_refresh_token'),
    deleteSetting('strava_expires_at'),
    deleteSetting('strava_athlete_name'),
    deleteSetting('strava_last_sync'),
    deleteSetting('strava_last_sync_epoch'),
  ]);
}

export async function getLastSync(): Promise<string | null> {
  return getSetting('strava_last_sync');
}

export async function setLastSync(iso: string): Promise<void> {
  await setSetting('strava_last_sync', iso);
}
