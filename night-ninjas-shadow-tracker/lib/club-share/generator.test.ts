import { describe, it, expect } from 'vitest';
import { generateSchedulePayload, buildShareFilename } from './generator';
import type { WeekTemplate } from '@/lib/plans/types';

/**
 * Synthetic week template factory for tests. Days 0..6 with specified
 * session types. Defaults to a simple training week pattern.
 */
function makeWeek(weekNumber: number, daysSpec: Array<{
  dow: number;
  type: 'easy' | 'long' | 'tempo' | 'interval' | 'rest' | 'recovery' | 'cross' | 'strength';
  distanceKm?: number;
  notes?: string;
}>): WeekTemplate {
  return {
    weekNumber,
    phaseName: 'test',
    totalKmTarget: daysSpec.reduce((sum, d) => sum + (d.distanceKm ?? 0), 0),
    longRunKmTarget: Math.max(...daysSpec.map((d) => d.distanceKm ?? 0)),
    days: daysSpec.map((d) => ({
      dow: d.dow as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      sessions: [
        {
          label: `day ${d.dow}`,
          type: d.type,
          distanceKmMin: d.distanceKm,
          distanceKmMax: d.distanceKm,
          notes: d.notes,
        },
      ],
    })),
  };
}

describe('generateSchedulePayload', () => {
  const baseInput = {
    parkrunId: 'A1234567',
    windowOption: '2w' as const,
    todayIso: '2026-05-11',
    completedSessionKeys: new Set<string>(),
    dayHasActivity: new Set<string>(),
    generatedAt: new Date('2026-05-11T10:00:00Z'),
  };

  it('produces correct window metadata for two-week window', () => {
    const weeks = [
      { weekStartIso: '2026-05-11', template: makeWeek(1, [{ dow: 0, type: 'easy', distanceKm: 8 }]) },
      { weekStartIso: '2026-05-18', template: makeWeek(2, [{ dow: 0, type: 'easy', distanceKm: 8 }]) },
    ];
    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.window.start_iso).toBe('2026-05-11');
    expect(payload.window.end_iso).toBe('2026-05-24'); // Sun of 2nd week
    expect(payload.window.weeks).toBe(2);
    expect(payload.window.option).toBe('2w');
    expect(payload.window.stale_after_iso).toBe('2026-05-16'); // 5 days after gen
  });

  it('strips completed sessions via completedSessionKeys', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 0, type: 'easy', distanceKm: 8 },   // Mon 2026-05-11 - completed
          { dow: 1, type: 'tempo', distanceKm: 12 }, // Tue 2026-05-12 - pending
        ]),
      },
    ];
    const completedSessionKeys = new Set(['2026-05-11:0']);

    const payload = generateSchedulePayload({
      ...baseInput,
      weeks,
      completedSessionKeys,
    });

    expect(payload.schedule.map((s) => s.date)).toEqual(['2026-05-12']);
  });

  it("strips today's session when activity is already logged", () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 0, type: 'tempo', distanceKm: 12 }, // Mon today
          { dow: 1, type: 'easy', distanceKm: 8 },   // Tue tomorrow
        ]),
      },
    ];
    const dayHasActivity = new Set(['2026-05-11']); // logged something today

    const payload = generateSchedulePayload({
      ...baseInput,
      weeks,
      dayHasActivity,
    });

    expect(payload.schedule.map((s) => s.date)).toEqual(['2026-05-12']);
  });

  it("keeps today's session when no activity logged yet", () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [{ dow: 0, type: 'tempo', distanceKm: 12 }]),
      },
    ];

    const payload = generateSchedulePayload({
      ...baseInput,
      weeks,
      dayHasActivity: new Set(),
    });

    expect(payload.schedule).toHaveLength(1);
    expect(payload.schedule[0].date).toBe('2026-05-11');
  });

  it('strips past days (before today) regardless of completion status', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-04', // Last week
        template: makeWeek(1, [
          { dow: 0, type: 'easy', distanceKm: 8 },   // Mon 2026-05-04 - past
          { dow: 6, type: 'long', distanceKm: 16 },  // Sun 2026-05-10 - past
        ]),
      },
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(2, [{ dow: 1, type: 'tempo', distanceKm: 12 }]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    // No past dates should appear
    expect(payload.schedule.every((s) => s.date >= '2026-05-11')).toBe(true);
    expect(payload.schedule.map((s) => s.date)).toEqual(['2026-05-12']);
  });

  it("suppresses 'rest' entries from output", () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 0, type: 'easy', distanceKm: 8 },
          { dow: 2, type: 'rest' },
          { dow: 3, type: 'tempo', distanceKm: 12 },
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.schedule.map((s) => s.type)).toEqual(['easy', 'tempo']);
  });

  it('collapses interval and repetition to "intervals" type', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 1, type: 'interval', distanceKm: 10 },
          { dow: 3, type: 'interval', distanceKm: 8 },
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.schedule.every((s) => s.type === 'intervals')).toBe(true);
  });

  it('strips pace targets from notes', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 1, type: 'tempo', distanceKm: 12, notes: 'Tue tempo @ MP' },
          { dow: 2, type: 'easy', distanceKm: 8, notes: 'Easy aerobic (5:30/km)' },
          { dow: 3, type: 'interval', distanceKm: 10, notes: '6x800m @ R-pace zone 4' },
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.schedule[0].notes).toBe('Tue tempo');
    expect(payload.schedule[1].notes).toBe('Easy aerobic');
    expect(payload.schedule[2].notes).toBe('6x800m');
  });

  it('strips HR zone references from notes', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 1, type: 'tempo', distanceKm: 12, notes: 'Tempo Z3' },
          { dow: 2, type: 'easy', distanceKm: 8, notes: 'Easy zone 2' },
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.schedule[0].notes).toBe('Tempo');
    expect(payload.schedule[1].notes).toBe('Easy');
  });

  it('emits day-of-week labels correctly mapping dow 0..6 to Mon..Sun', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11', // Mon
        template: makeWeek(1, [
          { dow: 0, type: 'easy', distanceKm: 8 },
          { dow: 1, type: 'tempo', distanceKm: 10 },
          { dow: 2, type: 'easy', distanceKm: 6 },
          { dow: 3, type: 'tempo', distanceKm: 10 },
          { dow: 4, type: 'easy', distanceKm: 6 },
          { dow: 5, type: 'easy', distanceKm: 8 },
          { dow: 6, type: 'long', distanceKm: 18 },
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.schedule.map((s) => s.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('throws when weeks is empty', () => {
    expect(() =>
      generateSchedulePayload({ ...baseInput, weeks: [] })
    ).toThrow('Cannot generate schedule with empty weeks list');
  });

  it('outputs sessions in ascending date order', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [
          { dow: 6, type: 'long', distanceKm: 18 },   // Sun 2026-05-17
          { dow: 0, type: 'easy', distanceKm: 8 },    // Mon 2026-05-11
        ]),
      },
      {
        weekStartIso: '2026-05-18',
        template: makeWeek(2, [
          { dow: 2, type: 'tempo', distanceKm: 12 },  // Wed 2026-05-20
        ]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    const dates = payload.schedule.map((s) => s.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('includes parkrun_id and version in payload', () => {
    const weeks = [
      {
        weekStartIso: '2026-05-11',
        template: makeWeek(1, [{ dow: 0, type: 'easy', distanceKm: 8 }]),
      },
    ];

    const payload = generateSchedulePayload({ ...baseInput, weeks });

    expect(payload.version).toBe('1.0');
    expect(payload.parkrun_id).toBe('A1234567');
  });
});

describe('buildShareFilename', () => {
  it('builds canonical filename', () => {
    expect(buildShareFilename('A1234567', '2026-05-11')).toBe(
      'velocity-schedule-A1234567-2026-05-11.json'
    );
  });

  it('sanitises non-alphanumeric characters in parkrun ID', () => {
    expect(buildShareFilename('A1234/567', '2026-05-11')).toBe(
      'velocity-schedule-A1234567-2026-05-11.json'
    );
  });
});
