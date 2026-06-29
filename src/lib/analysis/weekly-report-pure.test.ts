import { describe, it, expect } from 'vitest';
import {
  getThisMondayIso,
  shouldGenerateReport,
  buildWeeklyReport,
  addUtcDays,
  type WeeklyReport,
} from './weekly-report-pure';
import type { WeekCompliance, ComplianceFlag } from './compliance';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Build a minimal WeekCompliance with the supplied day-flag overrides. */
function mkCompliance(
  dayFlags: Array<{ dow: number; flags: ComplianceFlag[] }>,
  totalKmActual = 0,
  longRunKmActual = 0,
): WeekCompliance {
  return {
    weekTemplate: {
      weekNumber: 1,
      phaseName: 'Base',
      totalKmTarget: 50,
      longRunKmTarget: 20,
      days: [],
      notes: undefined,
    },
    totalKmActual,
    longRunKmActual,
    daysWithSessions: dayFlags.length,
    days: dayFlags.map(({ dow, flags }) => ({
      dow,
      sessions: flags.map((flag) => ({
        flag,
        target: { type: flag === 'ok' ? 'easy' : flag === 'none' ? 'easy' : 'easy', label: 'Easy run' },
        message: flag,
      })),
    })),
  };
}

/**
 * Create a UTC Date for a given ISO date string.
 * Using 'T12:00:00Z' avoids any local-midnight ambiguity while keeping the
 * UTC date identical to the ISO string.
 */
function utcDate(iso: string): Date {
  return new Date(iso + 'T12:00:00Z');
}

/* -------------------------------------------------------------------------- */
/* getThisMondayIso                                                            */
/* -------------------------------------------------------------------------- */

describe('getThisMondayIso', () => {
  it('returns the same day when today IS Monday (UTC)', () => {
    // 2026-06-22 is a Monday
    const result = getThisMondayIso(utcDate('2026-06-22'));
    expect(result).toBe('2026-06-22');
  });

  it('returns the prior Monday when today is Wednesday (UTC)', () => {
    // 2026-06-24 is a Wednesday; prior Monday is 2026-06-22
    const result = getThisMondayIso(utcDate('2026-06-24'));
    expect(result).toBe('2026-06-22');
  });

  it('returns Monday 6 days earlier when today is Sunday (UTC)', () => {
    // 2026-06-28 is a Sunday; the Monday before it is 2026-06-22
    const result = getThisMondayIso(utcDate('2026-06-28'));
    expect(result).toBe('2026-06-22');
  });

  it('returns Monday 6 days earlier when today is Sunday — edge UTC check', () => {
    // 2026-06-21 is a Sunday; Monday is 2026-06-15
    const result = getThisMondayIso(utcDate('2026-06-21'));
    expect(result).toBe('2026-06-15');
  });
});

/* -------------------------------------------------------------------------- */
/* shouldGenerateReport                                                        */
/* -------------------------------------------------------------------------- */

describe('shouldGenerateReport', () => {
  // chosenDow: 4 = Friday (Mon=0)

  it('returns true when today IS the chosen DOW and no prior report (happy path)', () => {
    // 2026-06-26 is a Friday (dow=4)
    expect(shouldGenerateReport(utcDate('2026-06-26'), 4, null)).toBe(true);
  });

  it('returns true when today is AFTER the chosen DOW and no prior report (happy path)', () => {
    // 2026-06-27 is Saturday (dow=5), chosen Friday (dow=4)
    expect(shouldGenerateReport(utcDate('2026-06-27'), 4, null)).toBe(true);
  });

  it('returns false when today is BEFORE the chosen DOW (negative)', () => {
    // 2026-06-25 is Thursday (dow=3), chosen Friday (dow=4)
    expect(shouldGenerateReport(utcDate('2026-06-25'), 4, null)).toBe(false);
  });

  it('returns false when lastGeneratedWeekStart equals this Monday (already done this week) (negative)', () => {
    // 2026-06-26 is Friday; Monday is 2026-06-22 — report already generated
    expect(shouldGenerateReport(utcDate('2026-06-26'), 4, '2026-06-22')).toBe(false);
  });

  it('returns false when null lastGenerated + today before chosen DOW (negative)', () => {
    // 2026-06-23 is Tuesday (dow=1), chosen Friday (dow=4)
    expect(shouldGenerateReport(utcDate('2026-06-23'), 4, null)).toBe(false);
  });

  it('returns true when lastGeneratedWeekStart is a PRIOR week Monday', () => {
    // Last generated was 2026-06-15 (previous week), today is Friday 2026-06-26
    expect(shouldGenerateReport(utcDate('2026-06-26'), 4, '2026-06-15')).toBe(true);
  });

  it('returns true on Monday when chosenDow is Monday (dow=0) and no prior report', () => {
    // 2026-06-22 is Monday, chosen Monday (dow=0)
    expect(shouldGenerateReport(utcDate('2026-06-22'), 0, null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* UTC/local week-boundary divergence — NZ timezone regression                */
/* -------------------------------------------------------------------------- */

describe('UTC/local boundary — NZ Monday-local / Sunday-UTC scenario', () => {
  /**
   * 2026-06-22T10:00:00+12:00 is:
   *   Local (NZ NZST, UTC+12): Monday 22 June 2026, 10:00
   *   UTC:                     Sunday 21 June 2026, 22:00
   *
   * toISOString() returns the UTC representation: '2026-06-21T22:00:00.000Z'
   * so today.toISOString().slice(0,10) === '2026-06-21' (Sunday UTC).
   *
   * Both getThisMondayIso and shouldGenerateReport must operate in UTC and
   * therefore agree that this is still the week starting 2026-06-15 (the most
   * recent UTC Monday before the UTC Sunday 2026-06-21).
   *
   * The watermark stored by generateWeeklyReportIfDue is also UTC-based, so
   * both sides of the dedup check resolve to the same ISO string — no mismatch.
   */
  const nzMonday10am = new Date('2026-06-22T10:00:00+12:00');

  it('getThisMondayIso returns the UTC-based Monday (2026-06-15) not the local Monday (2026-06-22)', () => {
    // UTC representation of the moment is Sunday 2026-06-21, so UTC-Monday is 2026-06-15
    expect(getThisMondayIso(nzMonday10am)).toBe('2026-06-15');
  });

  it('shouldGenerateReport uses same UTC Monday as getThisMondayIso — dedup check is consistent', () => {
    // Watermark stored as getThisMondayIso result: '2026-06-15'
    // shouldGenerateReport also derives '2026-06-15' for this moment
    // so it returns false (already generated this UTC week)
    const utcMondayFromThisMoment = getThisMondayIso(nzMonday10am);
    expect(shouldGenerateReport(nzMonday10am, 4, utcMondayFromThisMoment)).toBe(false);
  });

  it('shouldGenerateReport returns true when watermark is prior UTC week (2026-06-08)', () => {
    // Same NZ Monday 10am moment, but last generated was 2 UTC weeks ago
    expect(shouldGenerateReport(nzMonday10am, 0, '2026-06-08')).toBe(true);
  });

  it('addUtcDays produces weekEnd 6 days after the UTC Monday', () => {
    // weekStart from UTC = '2026-06-15', weekEnd = '2026-06-21' (UTC Sunday)
    expect(addUtcDays('2026-06-15', 6)).toBe('2026-06-21');
  });
});

/* -------------------------------------------------------------------------- */
/* buildWeeklyReport — happy paths                                             */
/* -------------------------------------------------------------------------- */

describe('buildWeeklyReport — happy paths', () => {
  it('returns green when all days are compliant', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['ok'] },
      { dow: 2, flags: ['ok'] },
      { dow: 4, flags: ['ok'] },
    ], 45, 22);

    const report = buildWeeklyReport(
      compliance,
      '2026-06-22',
      50,
      20,
      'Hansons — Base (Week 8)',
      utcDate('2026-06-26'),
      4,
    );

    expect(report.overallCompliance).toBe('green');
    expect(report.longRunCompliant).toBe(true);
    expect(report.volumeKm).toBe(45);
    expect(report.phase).toBe('Hansons — Base (Week 8)');
    expect(report.weekStart).toBe('2026-06-22');
    expect(report.weekEnd).toBe('2026-06-28');
    expect(report.days).toHaveLength(3);
    expect(report.days[0].status).toBe('compliant');
    expect(report.days[0].date).toBe('2026-06-22'); // dow=0 → Mon
    expect(report.days[1].date).toBe('2026-06-24'); // dow=2 → Wed
    expect(report.days[2].date).toBe('2026-06-26'); // dow=4 → Fri
  });

  it('returns red when one day is missed', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['ok'] },
      { dow: 2, flags: ['none'] }, // missed
      { dow: 4, flags: ['ok'] },
    ]);

    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );

    expect(report.overallCompliance).toBe('red');
    expect(report.days[1].status).toBe('missed');
  });

  it('returns amber when a day is partial (no missed, no full-miss)', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['ok'] },
      { dow: 2, flags: ['slow'] }, // partial
      { dow: 4, flags: ['ok'] },
    ]);

    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );

    expect(report.overallCompliance).toBe('amber');
    expect(report.days[1].status).toBe('partial');
  });

  it('sets longRunCompliant false when actual < target', () => {
    const compliance = mkCompliance([{ dow: 6, flags: ['ok'] }], 15, 18);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );
    expect(report.longRunCompliant).toBe(false);
  });

  it('sets longRunCompliant true when actual equals target exactly', () => {
    const compliance = mkCompliance([{ dow: 6, flags: ['ok'] }], 20, 20);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );
    expect(report.longRunCompliant).toBe(true);
  });

  it('derives correct day dates from weekStart + dow', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['ok'] }, // Mon → 2026-06-22
      { dow: 6, flags: ['ok'] }, // Sun → 2026-06-28
    ]);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );
    expect(report.days[0].date).toBe('2026-06-22');
    expect(report.days[1].date).toBe('2026-06-28');
  });

  it('nextReportDate is the next Friday after Saturday', () => {
    // Today is Saturday 2026-06-27, chosenDow=4 (Friday)
    // Next Friday = 2026-07-03
    const compliance = mkCompliance([]);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 0, 0, 'Test', utcDate('2026-06-27'), 4,
    );
    expect(report.nextReportDate).toBe('2026-07-03');
  });
});

/* -------------------------------------------------------------------------- */
/* buildWeeklyReport — negative / edge tests                                  */
/* -------------------------------------------------------------------------- */

describe('buildWeeklyReport — negative and edge cases', () => {
  it('does not throw and returns green when weekCompliance has zero days', () => {
    const compliance: WeekCompliance = {
      weekTemplate: {
        weekNumber: 1,
        phaseName: 'Base',
        totalKmTarget: 0,
        longRunKmTarget: 0,
        days: [],
        notes: undefined,
      },
      totalKmActual: 0,
      longRunKmActual: 0,
      daysWithSessions: 0,
      days: [],
    };

    let report: WeeklyReport | undefined;
    expect(() => {
      report = buildWeeklyReport(
        compliance, '2026-06-22', 0, 0, 'No active plan', utcDate('2026-06-26'), 4,
      );
    }).not.toThrow();

    expect(report!.days).toHaveLength(0);
    expect(report!.overallCompliance).toBe('green');
  });

  it('marks all days missed and returns red when all sessions are flagged none', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['none'] },
      { dow: 2, flags: ['none'] },
      { dow: 4, flags: ['none'] },
    ]);

    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );

    expect(report.overallCompliance).toBe('red');
    expect(report.days.every((d) => d.status === 'missed')).toBe(true);
  });

  it('handles zero volumeTargetKm without crashing', () => {
    const compliance = mkCompliance([{ dow: 0, flags: ['ok'] }]);
    expect(() =>
      buildWeeklyReport(compliance, '2026-06-22', 0, 0, 'Test', utcDate('2026-06-26'), 4),
    ).not.toThrow();
  });

  it('returns amber (not green) when mix of ok and slow on different days', () => {
    const compliance = mkCompliance([
      { dow: 0, flags: ['ok'] },
      { dow: 2, flags: ['fast'] },
    ]);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 50, 20, 'Test', utcDate('2026-06-26'), 4,
    );
    expect(report.overallCompliance).toBe('amber');
  });

  it('nextReportDate is always in the future (today IS chosenDow → +7)', () => {
    // Today IS Friday (chosenDow=4), so next Friday is +7 days
    const compliance = mkCompliance([]);
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 0, 0, 'Test', utcDate('2026-06-26'), 4,
    );
    expect(report.nextReportDate).toBe('2026-07-03');
  });

  it('generatedAt is an ISO 8601 string', () => {
    const compliance = mkCompliance([]);
    const today = utcDate('2026-06-26');
    const report = buildWeeklyReport(
      compliance, '2026-06-22', 0, 0, 'Test', today, 4,
    );
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });
});
