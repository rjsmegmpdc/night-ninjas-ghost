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

/** Returns all settings as a key/value map. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await query('SELECT key, value FROM settings');
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r[0] as string] = r[1] as string;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Strava token helpers
// ---------------------------------------------------------------------------

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;   // Unix timestamp (seconds)
  athleteName: string;
  athleteId: number;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const rows = await query(
    `SELECT key, value FROM settings
     WHERE key IN (
       'strava_access_token', 'strava_refresh_token', 'strava_expires_at',
       'strava_athlete_name', 'strava_athlete_id'
     )`,
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(r[0] as string, r[1] as string);

  const at  = map.get('strava_access_token')  ?? null;
  const rt  = map.get('strava_refresh_token') ?? null;
  const exp = map.get('strava_expires_at')    ?? null;
  if (!at || !rt || !exp) return null;
  return {
    accessToken:  at,
    refreshToken: rt,
    expiresAt:    Number(exp),
    athleteName:  map.get('strava_athlete_name') ?? '',
    athleteId:    map.has('strava_athlete_id') ? Number(map.get('strava_athlete_id')) : 0,
  };
}

export async function storeTokens(t: StoredTokens): Promise<void> {
  await Promise.all([
    setSetting('strava_access_token',  t.accessToken),
    setSetting('strava_refresh_token', t.refreshToken),
    setSetting('strava_expires_at',    String(t.expiresAt)),
    setSetting('strava_athlete_name',  t.athleteName),
    setSetting('strava_athlete_id',    String(t.athleteId)),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    deleteSetting('strava_access_token'),
    deleteSetting('strava_refresh_token'),
    deleteSetting('strava_expires_at'),
    deleteSetting('strava_athlete_name'),
    deleteSetting('strava_athlete_id'),
    deleteSetting('strava_scope'),
    deleteSetting('strava_last_sync'),
    deleteSetting('strava_last_sync_epoch'),
    deleteSetting('strava_sync_cursor'),
  ]);
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

export async function getLastSync(): Promise<string | null> {
  return getSetting('strava_last_sync');
}

export async function setLastSync(iso: string): Promise<void> {
  await setSetting('strava_last_sync', iso);
}

export async function getSyncCursor(): Promise<number | null> {
  const v = await getSetting('strava_sync_cursor');
  return v !== null ? Number(v) : null;
}

export async function setSyncCursor(epoch: number): Promise<void> {
  await setSetting('strava_sync_cursor', String(epoch));
}

export async function clearSyncCursor(): Promise<void> {
  await deleteSetting('strava_sync_cursor');
}

// ---------------------------------------------------------------------------
// Athlete profile (settings persist across reconnects)
// ---------------------------------------------------------------------------

export interface AthleteProfile {
  athleteId:    number;
  athleteName:  string;
  scope:        string | null;
  syncCursor:   number | null;
  lastSync:     string | null;
  settingsJson: string | null;
}

export async function getAthleteProfile(athleteId: number): Promise<AthleteProfile | null> {
  const rows = await query(
    `SELECT athlete_id, athlete_name, scope, sync_cursor, last_sync, settings_json
     FROM athlete_profiles WHERE athlete_id = ?`,
    [athleteId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    athleteId:    r[0] as number,
    athleteName:  r[1] as string,
    scope:        r[2] as string | null,
    syncCursor:   r[3] != null ? (r[3] as number) : null,
    lastSync:     r[4] as string | null,
    settingsJson: r[5] as string | null,
  };
}

export async function upsertAthleteProfile(p: AthleteProfile): Promise<void> {
  await exec(
    `INSERT INTO athlete_profiles
       (athlete_id, athlete_name, scope, sync_cursor, last_sync, settings_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(athlete_id) DO UPDATE SET
       athlete_name  = excluded.athlete_name,
       scope         = excluded.scope,
       sync_cursor   = excluded.sync_cursor,
       last_sync     = excluded.last_sync,
       settings_json = excluded.settings_json,
       updated_at    = excluded.updated_at`,
    [
      p.athleteId,
      p.athleteName,
      p.scope       ?? null,
      p.syncCursor  ?? null,
      p.lastSync    ?? null,
      p.settingsJson ?? null,
    ],
  );
}
