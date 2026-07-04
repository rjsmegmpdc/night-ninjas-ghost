import { describe, it, expect } from 'vitest';
import { buildSettingsSnapshot, parseSettingsSnapshot } from './settings-snapshot-pure';

describe('buildSettingsSnapshot', () => {
  it('excludes all token and auth keys', () => {
    const settings: Record<string, string> = {
      strava_access_token:   'secret-at',
      strava_refresh_token:  'secret-rt',
      strava_expires_at:     '9999999999',
      strava_athlete_name:   'Matt H',
      strava_athlete_id:     '12345',
      strava_scope:          'activity:read_all',
      strava_last_sync:      '2026-07-01T00:00:00.000Z',
      strava_last_sync_epoch:'1751000000',
      strava_sync_cursor:    '1750000000',
      training_plan:         'hansons',
      units:                 'metric',
    };
    const result = JSON.parse(buildSettingsSnapshot(settings)) as Record<string, string>;
    expect(result).toEqual({ training_plan: 'hansons', units: 'metric' });
  });

  it('returns {} JSON for empty input', () => {
    expect(buildSettingsSnapshot({})).toBe('{}');
  });

  it('preserves arbitrary non-credential settings', () => {
    const settings = { capacity_km: '60', plan_start: '2026-08-01', athlete_age: '38' };
    const result = JSON.parse(buildSettingsSnapshot(settings)) as Record<string, string>;
    expect(result).toEqual(settings);
  });

  it('handles settings with only credential keys', () => {
    const settings = { strava_access_token: 'x', strava_refresh_token: 'y' };
    expect(buildSettingsSnapshot(settings)).toBe('{}');
  });
});

describe('parseSettingsSnapshot', () => {
  it('parses valid JSON back to a string map', () => {
    const input = { capacity_km: '60', plan_start: '2026-08-01' };
    expect(parseSettingsSnapshot(JSON.stringify(input))).toEqual(input);
  });

  it('returns {} for invalid JSON', () => {
    expect(parseSettingsSnapshot('not-json')).toEqual({});
    expect(parseSettingsSnapshot('')).toEqual({});
  });

  it('returns {} for non-object JSON', () => {
    expect(parseSettingsSnapshot('"string"')).toEqual({});
    expect(parseSettingsSnapshot('42')).toEqual({});
    expect(parseSettingsSnapshot('[]')).toEqual({});
    expect(parseSettingsSnapshot('null')).toEqual({});
  });

  it('skips non-string values silently', () => {
    const json = JSON.stringify({ a: 'ok', b: 42, c: null, d: true });
    expect(parseSettingsSnapshot(json)).toEqual({ a: 'ok' });
  });

  it('round-trips through buildSettingsSnapshot', () => {
    const settings = { plan: 'lydiard', units: 'metric', athlete_age: '40' };
    const snapshot = buildSettingsSnapshot(settings);
    expect(parseSettingsSnapshot(snapshot)).toEqual(settings);
  });
});
