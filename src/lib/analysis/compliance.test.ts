/**
 * Tests for src/lib/analysis/compliance.ts
 *
 * evaluateWeek + evaluateSession (via evaluateWeek's day dispatch).
 *
 * Key coverage:
 *  - Pace band boundaries: faster than minSpk, exactly minSpk, inside band, exactly maxSpk, slower than maxSpk
 *  - UTC/local date fix: activity at 00:30 NZ Monday (= Sunday UTC) must land on dow 0 (Mon)
 *  - Rest, cross, strength session types
 *  - No session recorded ("none" flag)
 *  - Multiple activities on same day — best-match selection
 *  - evaluateWeek aggregates totalKmActual, longRunKmActual, daysWithSessions
 */

import { describe, expect, it } from 'vitest';
import { evaluateWeek } from './compliance';
import type { Activity } from '@/lib/db/schema';
import type { WeekTemplate } from '@/lib/plans/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    source: 'strava',
    sourceId: '111',
    name: 'Morning Run',
    type: 'Run',
    sportType: 'Run',
    startDateUtc: '2026-06-01T08:00:00Z',
    startDateLocal: '2026-06-01T20:00:00', // Mon 20:00 NZ (NZST winter = UTC+12)
    distanceM: 10000,
    movingTimeS: 3600,
    elapsedTimeS: 3700,
    elevationGainM: 50,
    avgSpeedMs: 2.778,  // ~360 sec/km
    maxSpeedMs: 3.5,
    avgHr: 140,
    maxHr: 165,
    avgCadence: 170,
    sufferScore: 50,
    kudos: 3,
    gearId: null,
    gearName: null,
    rawJson: null,
    createdAt: new Date('2026-06-01T08:30:00Z'),
    updatedAt: new Date('2026-06-01T08:30:00Z'),
    ...overrides,
  } as Activity;
}

/** Minimal WeekTemplate with one day. */
function singleDayTemplate(
  dow: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  sessionOverrides: Parameters<typeof makeActivity>[0] extends unknown
    ? Partial<import('@/lib/plans/types').SessionTarget>
    : never = {}
): WeekTemplate {
  return {
    weekNumber: 1,
    phaseName: 'Base',
    totalKmTarget: 50,
    longRunKmTarget: 20,
    days: [
      {
        dow,
        sessions: [
          {
            label: 'Easy run',
            type: 'easy',
            paceZone: { minSpk: 320, maxSpk: 380 }, // 5:20–6:20 /km
            distanceKmMin: 8,
            distanceKmMax: 12,
            ...sessionOverrides,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// evaluateWeek — aggregate metrics
// ---------------------------------------------------------------------------

describe('evaluateWeek — aggregate metrics', () => {
  it('returns zero totals and empty sessions for an empty activity list', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Easy', type: 'easy' }] }],
    };
    const result = evaluateWeek(template, []);
    expect(result.totalKmActual).toBe(0);
    expect(result.longRunKmActual).toBe(0);
    expect(result.daysWithSessions).toBe(0);
  });

  it('sums km from Run and VirtualRun only, ignoring Ride/WeightTraining', () => {
    const activities = [
      makeActivity({ distanceM: 10000, type: 'Run', startDateLocal: '2026-06-01T20:00:00' }),
      makeActivity({ distanceM: 8000,  type: 'VirtualRun', startDateLocal: '2026-06-02T06:00:00' }),
      makeActivity({ distanceM: 25000, type: 'Ride', startDateLocal: '2026-06-03T07:00:00' }),
      makeActivity({ distanceM: 5000,  type: 'WeightTraining', startDateLocal: '2026-06-04T07:00:00' }),
    ];
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [],
    };
    const result = evaluateWeek(template, activities);
    expect(result.totalKmActual).toBeCloseTo(18, 2); // 10 + 8
    expect(result.longRunKmActual).toBe(10);
  });

  it('counts daysWithSessions from all activity types (not just runs)', () => {
    const activities = [
      makeActivity({ startDateLocal: '2026-06-01T20:00:00', type: 'Run' }),
      makeActivity({ startDateLocal: '2026-06-03T07:00:00', type: 'Ride' }),
    ];
    const result = evaluateWeek({ weekNumber: 1, phaseName: 'Base', totalKmTarget: 0, longRunKmTarget: 0, days: [] }, activities);
    // dowOf groups by date: Mon (0) and Wed (2)
    expect(result.daysWithSessions).toBe(2);
  });

  it('longRunKmActual is 0 when there are no run activities', () => {
    const activities = [makeActivity({ type: 'Ride', distanceM: 50000 })];
    const result = evaluateWeek({ weekNumber: 1, phaseName: 'Base', totalKmTarget: 0, longRunKmTarget: 0, days: [] }, activities);
    expect(result.longRunKmActual).toBe(0);
  });

  it('picks correct longRunKmActual from multiple runs', () => {
    const activities = [
      makeActivity({ distanceM: 10000, startDateLocal: '2026-06-01T06:00:00' }),
      makeActivity({ distanceM: 22000, startDateLocal: '2026-06-06T06:00:00' }), // Sat
      makeActivity({ distanceM: 8000,  startDateLocal: '2026-06-03T06:00:00' }),
    ];
    const result = evaluateWeek({ weekNumber: 1, phaseName: 'Base', totalKmTarget: 0, longRunKmTarget: 0, days: [] }, activities);
    expect(result.longRunKmActual).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// evaluateWeek — DOW UTC/local boundary (R7 requirement)
// ---------------------------------------------------------------------------

describe('evaluateWeek — DOW local/UTC boundary fix', () => {
  /**
   * Activity at 00:30 NZ Monday (summer, UTC+13) = Sunday UTC.
   * dowOf() uses new Date(isoLocal).getDay() — local time — so it must land on
   * dow 0 (Monday in ISO week order).  A naive UTC calculation would classify
   * it as dow 6 (Sunday).
   *
   * Concrete date: 2026-01-05T00:30:00 NZ = 2026-01-04T11:30:00 UTC (Sunday UTC).
   */
  it('activity at NZ Monday 00:30 is classified as Monday (dow 0), not Sunday', () => {
    const mondayNzEarlyMorning = makeActivity({
      startDateLocal: '2026-01-05T00:30:00', // Mon 00:30 NZ
      distanceM: 10000,
      type: 'Run',
    });

    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [
        {
          dow: 0, // Monday
          sessions: [{ label: 'Easy', type: 'easy' }],
        },
        {
          dow: 6, // Sunday — should have no activity
          sessions: [{ label: 'Long', type: 'long' }],
        },
      ],
    };

    const result = evaluateWeek(template, [mondayNzEarlyMorning]);

    const mondayDay = result.days.find((d) => d.dow === 0)!;
    const sundayDay = result.days.find((d) => d.dow === 6)!;

    // Monday should have a recorded activity (flag 'ok'), not 'none'
    expect(mondayDay.sessions[0].flag).not.toBe('none');
    // Sunday should be unmatched (flag 'none')
    expect(sundayDay.sessions[0].flag).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// evaluateSession — pace band boundaries
// ---------------------------------------------------------------------------

describe('evaluateWeek — pace band boundaries (via evaluateSession)', () => {
  // Target pace zone: minSpk=320 (5:20/km faster end), maxSpk=380 (6:20/km slower end)
  // avgSpeedMs = 1000 / paceSpk

  function makeRunActivity(paceSpk: number): Activity {
    return makeActivity({
      avgSpeedMs: 1000 / paceSpk,
      distanceM: 10000,
      startDateLocal: '2026-06-01T20:00:00', // Monday
    });
  }

  it('pace exactly at minSpk (fastest acceptable) → flag ok', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(320)]);
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });

  it('pace exactly at maxSpk (slowest acceptable) → flag ok', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(380)]);
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });

  it('pace inside band (between min and max) → flag ok', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(350)]); // 5:50/km
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });

  it('pace faster than minSpk (e.g. 5% faster, 304 spk) → flag fast', () => {
    // +5% faster: 320 * 0.95 = 304 spk
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(304)]);
    expect(result.days[0].sessions[0].flag).toBe('fast');
  });

  it('pace slower than maxSpk (e.g. 5% slower, 399 spk) → flag slow', () => {
    // +5% slower: 380 * 1.05 = 399 spk
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(399)]);
    expect(result.days[0].sessions[0].flag).toBe('slow');
  });

  it('pace at +10% faster than minSpk → flag fast', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(288)]); // 320 * 0.9
    expect(result.days[0].sessions[0].flag).toBe('fast');
  });

  it('pace at +15% slower than maxSpk → flag slow', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, [makeRunActivity(437)]); // 380 * 1.15
    expect(result.days[0].sessions[0].flag).toBe('slow');
  });
});

// ---------------------------------------------------------------------------
// evaluateSession — special session types
// ---------------------------------------------------------------------------

describe('evaluateWeek — special session types', () => {
  it('rest day always returns flag ok', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Rest', type: 'rest' }] }],
    };
    const result = evaluateWeek(template, []);
    expect(result.days[0].sessions[0].flag).toBe('ok');
    expect(result.days[0].sessions[0].message).toBe('Rest day');
  });

  it('cross session with no activity → flag none', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Cross-train', type: 'cross', durationMinMin: 30 }] }],
    };
    const result = evaluateWeek(template, []);
    expect(result.days[0].sessions[0].flag).toBe('none');
  });

  it('cross session with sufficient Ride activity → flag ok', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Cross-train', type: 'cross', durationMinMin: 30 }] }],
    };
    const rideActivity = makeActivity({
      type: 'Ride',
      movingTimeS: 2400, // 40 minutes
      startDateLocal: '2026-06-01T17:00:00',
    });
    const result = evaluateWeek(template, [rideActivity]);
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });

  it('cross session below minimum duration → flag short', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Cross-train', type: 'cross', durationMinMin: 60 }] }],
    };
    const rideActivity = makeActivity({
      type: 'Ride',
      movingTimeS: 1200, // 20 minutes — below 60 min target
      startDateLocal: '2026-06-01T17:00:00',
    });
    const result = evaluateWeek(template, [rideActivity]);
    expect(result.days[0].sessions[0].flag).toBe('short');
  });

  it('strength session with WeightTraining activity → flag ok', () => {
    const template: WeekTemplate = {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [{ dow: 0, sessions: [{ label: 'Strength', type: 'strength', durationMinMin: 30 }] }],
    };
    const strengthActivity = makeActivity({
      type: 'WeightTraining',
      movingTimeS: 2700, // 45 minutes
      startDateLocal: '2026-06-01T17:00:00',
    });
    const result = evaluateWeek(template, [strengthActivity]);
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });

  it('run session with no matching activity → flag none', () => {
    const template = singleDayTemplate(0);
    const result = evaluateWeek(template, []);
    expect(result.days[0].sessions[0].flag).toBe('none');
  });

  it('run session with null avgSpeedMs → flag ok (pace not evaluated)', () => {
    // If avgSpeedMs is 0/null, paceSpkFromSpeed returns null — pace check skipped
    const template = singleDayTemplate(0);
    const activity = makeActivity({
      avgSpeedMs: 0,
      distanceM: 10000,
      startDateLocal: '2026-06-01T20:00:00',
    });
    const result = evaluateWeek(template, [activity]);
    expect(result.days[0].sessions[0].flag).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// evaluateSession — best activity selection when multiple runs on same day
// ---------------------------------------------------------------------------

describe('evaluateWeek — best run selection on multi-run days', () => {
  it('selects the run whose pace is closest to the target band centre', () => {
    // Band: 320–380, centre = 350 spk
    // Run A: 340 spk (10 from centre) — should win
    // Run B: 410 spk (60 from centre)
    const template = singleDayTemplate(0);

    const runA = makeActivity({
      avgSpeedMs: 1000 / 340,
      distanceM: 10000,
      startDateLocal: '2026-06-01T06:00:00',
    });
    const runB = makeActivity({
      avgSpeedMs: 1000 / 410,
      distanceM: 8000,
      startDateLocal: '2026-06-01T20:00:00',
    });

    const result = evaluateWeek(template, [runA, runB]);
    const session = result.days[0].sessions[0];

    // Run A pace (340 spk) is within band → ok
    expect(session.flag).toBe('ok');
    expect(session.actualPaceSpk).toBeCloseTo(340, 0);
  });
});
