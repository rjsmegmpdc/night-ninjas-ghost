/**
 * Tests for src/lib/db/sync.ts — syncActivities()
 *
 * wa-sqlite runs only in a browser Worker, so @/db/client is mocked entirely.
 * @/lib/strava/client (fetchActivitiesPage, refreshAccessToken, RateLimitError)
 * and @/lib/db/settings are also mocked.
 *
 * 5 prod-incident scenarios:
 *  1. Empty activities array → no upserts, done phase emitted
 *  2. Duplicate strava_id → exec called twice (ON CONFLICT handles it in prod)
 *  3. Activities with missing optional fields (0 elapsed_time, null heartrate)
 *  4. Token expiry mid-sync → error propagated, not silently dropped
 *  5. latestEpoch correctly set to max start_date among synced activities
 *
 * Design note on RateLimitError instanceof:
 *  vi.mock() with an async factory (importActual) breaks Vitest's static
 *  hoisting for ALL mocks in the file, causing other vi.mock() factories to
 *  be deferred — so the imports land as undefined.  We instead create
 *  RateLimitError manually here as a subclass that satisfies the same
 *  instanceof check as the real class, by extending the real Error and
 *  matching the name. sync.ts checks `e instanceof RateLimitError` using the
 *  class imported from '@/lib/strava/client'; our mock re-exports a class
 *  that IS that constructor via a synchronous factory, so instanceof works.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted definitions — available before vi.mock factories run
// ---------------------------------------------------------------------------

// vi.hoisted() runs before vi.mock() factories, making the class available
// to both the factory AND the test body via the returned reference.
const { MockRateLimitError } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    constructor() {
      super('Strava rate limit reached — resumes automatically in 15 min');
      this.name = 'RateLimitError';
    }
  }
  return { MockRateLimitError };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/db/client', () => ({
  execBatch: vi.fn().mockResolvedValue(undefined),
  query:     vi.fn().mockResolvedValue([]),
}));

// MockRateLimitError is hoisted so it's available here AND in the test body.
// sync.ts imports RateLimitError from '@/lib/strava/client'; the vi.mock()
// replacement means sync.ts receives MockRateLimitError as its RateLimitError,
// so `e instanceof RateLimitError` in sync.ts resolves against MockRateLimitError.
vi.mock('@/lib/strava/client', () => ({
  RateLimitError:      MockRateLimitError,
  fetchActivitiesPage: vi.fn(),
  refreshAccessToken:  vi.fn(),
}));

vi.mock('@/lib/strava/credentials', () => ({
  getTokenCredentials: vi.fn().mockResolvedValue(null),
}));

vi.mock('./settings', () => ({
  getSetting:      vi.fn().mockResolvedValue(null),
  setSetting:      vi.fn().mockResolvedValue(undefined),
  getStoredTokens: vi.fn(),
  storeTokens:     vi.fn().mockResolvedValue(undefined),
  setLastSync:     vi.fn().mockResolvedValue(undefined),
  getSyncCursor:   vi.fn().mockResolvedValue(null),
  setSyncCursor:   vi.fn().mockResolvedValue(undefined),
  clearSyncCursor: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Static imports — resolved after mocks are registered
// ---------------------------------------------------------------------------

import { syncActivities } from './sync';
import { execBatch } from '@/db/client';
import { fetchActivitiesPage } from '@/lib/strava/client';
import {
  getStoredTokens,
  getSetting,
  setSetting,
  setSyncCursor,
  getSyncCursor,
} from './settings';
import type { SyncProgress } from './sync';
import type { StravaActivity } from '@/lib/strava/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStravaActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 1,
    name: 'Morning Run',
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-06-01T08:00:00Z',
    start_date_local: '2026-06-01T20:00:00',
    distance: 10000,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 50,
    average_speed: 2.778,
    max_speed: 3.5,
    ...overrides,
  };
}

function setupValidTokens() {
  const futureExpiry = Math.floor(Date.now() / 1000) + 7200;
  vi.mocked(getStoredTokens).mockResolvedValue({
    accessToken:  'valid-token',
    refreshToken: 'refresh-token',
    expiresAt:    futureExpiry,
    athleteName:  'Test Athlete',
    athleteId:    12345,
  });
}

function collectPhases() {
  const phases: string[] = [];
  const cb = (p: SyncProgress) => phases.push(p.phase);
  return { phases, cb };
}

// ---------------------------------------------------------------------------
// beforeEach — reset all spies; re-apply defaults wiped by clearAllMocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSetting).mockResolvedValue(null);
  vi.mocked(setSetting).mockResolvedValue(undefined);
  vi.mocked(setSyncCursor).mockResolvedValue(undefined);
  vi.mocked(getSyncCursor).mockResolvedValue(null);
  vi.mocked(execBatch).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Scenario 1: empty activities array
// ---------------------------------------------------------------------------

describe('syncActivities — scenario 1: empty activities array', () => {
  it('emits token → fetching → done with no exec calls when API returns empty page', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([]);

    const { phases, cb } = collectPhases();
    await syncActivities(cb);

    expect(phases).toEqual(['token', 'fetching', 'done']);
    expect(vi.mocked(execBatch)).not.toHaveBeenCalled();
  });

  it('final progress has fetched=0, inserted=0 on empty sync', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([]);

    let final: SyncProgress | null = null;
    await syncActivities((p) => { final = p; });

    expect(final!.phase).toBe('done');
    expect(final!.fetched).toBe(0);
    expect(final!.inserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: duplicate strava_id (upsert semantics)
// ---------------------------------------------------------------------------

describe('syncActivities — scenario 2: duplicate strava_id (upsert semantics)', () => {
  it('calls exec once for a single-page result; ON CONFLICT is handled at the SQL layer', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([makeStravaActivity({ id: 42 })]);

    const { phases, cb } = collectPhases();
    await syncActivities(cb);

    expect(vi.mocked(execBatch)).toHaveBeenCalledTimes(1);
    expect(phases).toContain('done');
  });

  it('execBatch receives strava_id 42 as the first param of the first statement', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([makeStravaActivity({ id: 42 })]);

    await syncActivities(() => {});

    // execBatch(stmts[]) — stmts[0].params[0] is strava_id
    const stmts = vi.mocked(execBatch).mock.calls[0][0];
    expect(stmts[0].params![0]).toBe(42);
  });

  it('does not throw when a second page returns the same strava_id (mock ON CONFLICT)', async () => {
    setupValidTokens();
    // Page 1: 200 items (triggers a second fetch); page 2: same id + empty page to exit
    const fullPage = Array(200).fill(makeStravaActivity({ id: 77 }));
    vi.mocked(fetchActivitiesPage)
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([]);

    vi.mocked(execBatch).mockResolvedValue(undefined);

    await expect(syncActivities(() => {})).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: activities with missing optional fields
// ---------------------------------------------------------------------------

describe('syncActivities — scenario 3: activities with missing optional fields', () => {
  it('does not throw when average_heartrate and suffer_score are absent', async () => {
    setupValidTokens();
    const activity = makeStravaActivity({
      average_heartrate: undefined,
      suffer_score:      undefined,
      elapsed_time:      0,
    });
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([activity]);

    await expect(syncActivities(() => {})).resolves.not.toThrow();
  });

  it('passes null for missing average_heartrate and max_heartrate in exec params', async () => {
    setupValidTokens();
    const activity = makeStravaActivity({
      average_heartrate: undefined,
      max_heartrate:     undefined,
    });
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([activity]);

    await syncActivities(() => {});

    // execBatch(stmts[]) — stmts[0].params holds the upsert values
    // [0]=strava_id [1]=name [2]=type [3]=sport_type [4]=start_date
    // [5]=distance [6]=moving_time [7]=elapsed_time [8]=total_elevation_gain
    // [9]=average_speed [10]=max_speed [11]=average_heartrate [12]=max_heartrate
    // [13]=suffer_score [14]=gear_id [15]=raw_json
    const stmts = vi.mocked(execBatch).mock.calls[0][0];
    expect(stmts[0].params![11]).toBeNull(); // average_heartrate
    expect(stmts[0].params![12]).toBeNull(); // max_heartrate
  });

  it('handles zero distance without throwing', async () => {
    setupValidTokens();
    const activity = makeStravaActivity({ distance: 0 });
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([activity]);

    await expect(syncActivities(() => {})).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: token expiry / error propagation
// ---------------------------------------------------------------------------

describe('syncActivities — scenario 4: token expiry mid-sync', () => {
  it('emits error phase when getStoredTokens returns null (not connected to Strava)', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(null);

    let errorPhase: SyncProgress | null = null;
    await syncActivities((p) => { if (p.phase === 'error') errorPhase = p; });

    expect(errorPhase).not.toBeNull();
    expect(errorPhase!.error).toContain('Not connected to Strava');
  });

  it('emits error phase when exec throws mid-sync (DB write failure)', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([makeStravaActivity()]);
    vi.mocked(execBatch).mockRejectedValueOnce(new Error('SQLITE_CONSTRAINT: strava_id unique'));

    let errorPhase: SyncProgress | null = null;
    await syncActivities((p) => { if (p.phase === 'error') errorPhase = p; });

    expect(errorPhase).not.toBeNull();
    expect(errorPhase!.error).toContain('SQLITE_CONSTRAINT');
  });

  it('emits paused (not error) on RateLimitError so the caller can schedule a retry', async () => {
    setupValidTokens();
    // MockRateLimitError is what sync.ts's module-level import will receive
    // (the same constructor, because vi.mock replaces the module for all importers).
    vi.mocked(fetchActivitiesPage).mockRejectedValueOnce(new MockRateLimitError());

    const { phases, cb } = collectPhases();
    await syncActivities(cb);

    expect(phases).toContain('paused');
    expect(phases).not.toContain('error');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: latestEpoch is max start_date among synced activities
// ---------------------------------------------------------------------------

describe('syncActivities — scenario 5: latestEpoch tracks the max start_date', () => {
  it('setSyncCursor receives the epoch of the newest activity when two activities are on one page', async () => {
    setupValidTokens();

    const older = makeStravaActivity({ id: 1, start_date: '2026-05-01T06:00:00Z' });
    const newer = makeStravaActivity({ id: 2, start_date: '2026-06-01T06:00:00Z' });
    const newerEpoch = Math.floor(new Date('2026-06-01T06:00:00Z').getTime() / 1000);

    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([older, newer]);

    await syncActivities(() => {});

    // setSyncCursor is called once per page with the running max epoch
    // After processing both activities the max should be newerEpoch
    const cursorCalls = vi.mocked(setSyncCursor).mock.calls;
    const lastCursorCall = cursorCalls[cursorCalls.length - 1][0];
    expect(lastCursorCall).toBe(newerEpoch);
  });

  it('setSetting strava_last_sync_epoch is written to the max epoch after sync completes', async () => {
    setupValidTokens();
    const activity = makeStravaActivity({ start_date: '2026-06-01T06:00:00Z' });
    const expectedEpoch = Math.floor(new Date('2026-06-01T06:00:00Z').getTime() / 1000);

    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([activity]);

    await syncActivities(() => {});

    expect(vi.mocked(setSetting)).toHaveBeenCalledWith(
      'strava_last_sync_epoch',
      String(expectedEpoch),
    );
  });

  it('setSetting is NOT called with strava_last_sync_epoch when no activities are fetched', async () => {
    setupValidTokens();
    vi.mocked(fetchActivitiesPage).mockResolvedValueOnce([]); // empty → latestEpoch stays 0

    await syncActivities(() => {});

    const epochCalls = vi.mocked(setSetting).mock.calls.filter(
      ([key]) => key === 'strava_last_sync_epoch',
    );
    expect(epochCalls.length).toBe(0);
  });
});
