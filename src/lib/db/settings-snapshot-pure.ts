/**
 * Pure helpers for building and parsing the settings snapshot stored in athlete_profiles.
 * No browser APIs — safe for Vitest node env.
 */

const EXCLUDED_KEYS = new Set([
  'strava_access_token',
  'strava_refresh_token',
  'strava_expires_at',
  'strava_athlete_name',
  'strava_athlete_id',
  'strava_scope',
  'strava_last_sync',
  'strava_last_sync_epoch',
  'strava_sync_cursor',
]);

/** Returns a JSON string of all settings that are safe to snapshot (no credentials). */
export function buildSettingsSnapshot(settings: Record<string, string>): string {
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (!EXCLUDED_KEYS.has(k)) filtered[k] = v;
  }
  return JSON.stringify(filtered);
}

/** Parses a snapshot JSON back to a key/value map. Returns {} on invalid input. */
export function parseSettingsSnapshot(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}
