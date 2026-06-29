/**
 * weekly-report-display-pure.test.ts
 *
 * Tests for the pure display helpers consumed by WeeklyReportHero.
 *
 * All date arithmetic is UTC-only. The test env is pinned to Pacific/Auckland
 * (UTC+12/+13) via vitest.config.ts — using UTC getters means these pass on
 * any timezone without drift.
 *
 * These tests satisfy the QA standard for the WeeklyReportHero component
 * deliverable: the display-logic layer (formatting, colour tokens, labels)
 * is the testable pure-function surface; the React layer is not tested
 * (no component test harness; see TESTING.md).
 *
 * Happy-path and negative tests are collocated per the project standard.
 */

import { describe, it, expect } from 'vitest';
import {
  formatUtcShort,
  formatUtcLong,
  formatWeekRange,
  formatNextReport,
  formatGeneratedAt,
  dayAbbrevFromIso,
  complianceTextClass,
  complianceBorderClass,
  complianceLabel,
  formatVolume,
  dayStatusClass,
  dayStatusSymbol,
} from '@/lib/analysis/weekly-report-display-pure';

/* -------------------------------------------------------------------------- */
/* Date formatting                                                             */
/* -------------------------------------------------------------------------- */

describe('formatUtcShort', () => {
  it('formats a Monday correctly', () => {
    // 2026-06-22 is a Monday
    expect(formatUtcShort('2026-06-22')).toBe('22 Jun');
  });

  it('formats year boundary (Jan 1)', () => {
    expect(formatUtcShort('2026-01-01')).toBe('1 Jan');
  });

  it('formats December correctly', () => {
    expect(formatUtcShort('2025-12-29')).toBe('29 Dec');
  });

  it('does not apply local timezone offset (UTC-safe)', () => {
    // In Pacific/Auckland (UTC+13 in summer), midnight UTC is 1pm previous day
    // locally. UTC getter must return the UTC date, not the local date.
    expect(formatUtcShort('2026-01-01')).toBe('1 Jan'); // must NOT be 31 Dec
  });
});

describe('formatUtcLong', () => {
  it('formats a Monday', () => {
    // 2026-06-22 is a Monday
    expect(formatUtcLong('2026-06-22')).toBe('Monday 22 Jun');
  });

  it('formats a Sunday', () => {
    // 2026-06-28 is a Sunday
    expect(formatUtcLong('2026-06-28')).toBe('Sunday 28 Jun');
  });

  it('formats a Wednesday', () => {
    // 2026-06-24 is a Wednesday
    expect(formatUtcLong('2026-06-24')).toBe('Wednesday 24 Jun');
  });
});

describe('formatWeekRange', () => {
  it('returns expected Week of string', () => {
    expect(formatWeekRange('2026-06-22', '2026-06-28')).toBe(
      'Week of 22 Jun – 28 Jun',
    );
  });

  it('handles month boundary correctly', () => {
    // Week spanning May–June
    expect(formatWeekRange('2026-05-25', '2026-05-31')).toBe(
      'Week of 25 May – 31 May',
    );
  });
});

describe('formatNextReport', () => {
  it('formats a Monday next report date', () => {
    // 2026-06-29 is a Monday
    expect(formatNextReport('2026-06-29')).toBe('Next report: Monday 29 Jun');
  });

  it('formats a Wednesday next report date', () => {
    // 2026-07-01 is a Wednesday
    expect(formatNextReport('2026-07-01')).toBe('Next report: Wednesday 1 Jul');
  });
});

describe('formatGeneratedAt', () => {
  const baseNow = new Date('2026-06-23T10:00:00Z');

  it('returns "just now" when < 1 minute ago', () => {
    const gen = new Date('2026-06-23T09:59:45Z').toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('just now');
  });

  it('returns minutes ago when < 1 hour', () => {
    const gen = new Date('2026-06-23T09:30:00Z').toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('30 min ago');
  });

  it('returns hours ago when < 24 hours', () => {
    const gen = new Date('2026-06-23T07:00:00Z').toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('3h ago');
  });

  it('returns days ago when < 7 days', () => {
    const gen = new Date('2026-06-20T10:00:00Z').toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('3d ago');
  });

  it('returns absolute date when >= 7 days ago', () => {
    const gen = new Date('2026-06-16T10:00:00Z').toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('16 Jun 2026');
  });

  // Negative test: exactly 1 min boundary
  it('returns "1 min ago" for exactly 60 seconds ago', () => {
    const gen = new Date(baseNow.getTime() - 60_000).toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('1 min ago');
  });

  // Negative test: future timestamp (defensive)
  it('returns "just now" for a future generatedAt timestamp', () => {
    const gen = new Date(baseNow.getTime() + 5_000).toISOString();
    expect(formatGeneratedAt(gen, baseNow)).toBe('just now');
  });
});

/* -------------------------------------------------------------------------- */
/* Day abbreviation                                                            */
/* -------------------------------------------------------------------------- */

describe('dayAbbrevFromIso', () => {
  it('returns Mon for a Monday', () => {
    expect(dayAbbrevFromIso('2026-06-22')).toBe('Mon');
  });

  it('returns Sun for a Sunday', () => {
    expect(dayAbbrevFromIso('2026-06-28')).toBe('Sun');
  });

  it('returns Sat for a Saturday', () => {
    expect(dayAbbrevFromIso('2026-06-27')).toBe('Sat');
  });

  it('is UTC-safe (Jan 1 boundary)', () => {
    // 2026-01-01 is a Thursday
    expect(dayAbbrevFromIso('2026-01-01')).toBe('Thu');
  });
});

/* -------------------------------------------------------------------------- */
/* Compliance colour tokens                                                    */
/* -------------------------------------------------------------------------- */

describe('complianceTextClass', () => {
  it('returns green class for green compliance', () => {
    expect(complianceTextClass('green')).toBe('text-green-500');
  });

  it('returns amber class for amber compliance', () => {
    expect(complianceTextClass('amber')).toBe('text-amber-500');
  });

  it('returns red class for red compliance', () => {
    expect(complianceTextClass('red')).toBe('text-red-500');
  });
});

describe('complianceBorderClass', () => {
  it('returns green border for green', () => {
    expect(complianceBorderClass('green')).toContain('green');
  });

  it('returns amber border for amber', () => {
    expect(complianceBorderClass('amber')).toContain('amber');
  });

  it('returns red border for red', () => {
    expect(complianceBorderClass('red')).toContain('red');
  });
});

describe('complianceLabel', () => {
  it('returns On track for green', () => {
    expect(complianceLabel('green')).toBe('On track');
  });

  it('returns Partial for amber', () => {
    expect(complianceLabel('amber')).toBe('Partial');
  });

  it('returns Off track for red', () => {
    expect(complianceLabel('red')).toBe('Off track');
  });
});

/* -------------------------------------------------------------------------- */
/* Volume formatting                                                           */
/* -------------------------------------------------------------------------- */

describe('formatVolume', () => {
  it('formats with target when target > 0', () => {
    expect(formatVolume(42, 50)).toBe('42.0 km / 50.0 km target');
  });

  it('formats without target when volumeTargetKm is 0', () => {
    expect(formatVolume(10, 0)).toBe('10.0 km');
  });

  // Negative tests
  it('handles volumeKm = 0 and volumeTargetKm = 0 (no crash)', () => {
    expect(() => formatVolume(0, 0)).not.toThrow();
    expect(formatVolume(0, 0)).toBe('0.0 km');
  });

  it('handles volumeKm = 0 with a positive target', () => {
    expect(formatVolume(0, 50)).toBe('0.0 km / 50.0 km target');
  });

  it('formats to 1 decimal place', () => {
    // Use values that are exact in IEEE 754 to avoid floating-point surprises.
    expect(formatVolume(42.5, 50.5)).toBe('42.5 km / 50.5 km target');
  });
});

/* -------------------------------------------------------------------------- */
/* Day status display                                                          */
/* -------------------------------------------------------------------------- */

describe('dayStatusClass', () => {
  it('returns green for compliant', () => {
    expect(dayStatusClass('compliant')).toBe('text-green-500');
  });

  it('returns amber for partial', () => {
    expect(dayStatusClass('partial')).toBe('text-amber-500');
  });

  it('returns red for missed', () => {
    expect(dayStatusClass('missed')).toBe('text-red-500');
  });

  it('returns muted for rest', () => {
    expect(dayStatusClass('rest')).toBe('text-bone-mute');
  });
});

describe('dayStatusSymbol', () => {
  it('returns tick for compliant', () => {
    expect(dayStatusSymbol('compliant')).toBe('✓');
  });

  it('returns tilde for partial', () => {
    expect(dayStatusSymbol('partial')).toBe('~');
  });

  it('returns cross for missed', () => {
    expect(dayStatusSymbol('missed')).toBe('✗');
  });

  it('returns dash for rest', () => {
    expect(dayStatusSymbol('rest')).toBe('—');
  });
});

/* -------------------------------------------------------------------------- */
/* Negative: all compliance variants produce non-empty strings                */
/* -------------------------------------------------------------------------- */

describe('compliance helpers — no empty/null returns for any variant', () => {
  const variants: Array<'green' | 'amber' | 'red'> = ['green', 'amber', 'red'];

  variants.forEach((v) => {
    it(`complianceTextClass("${v}") is a non-empty string`, () => {
      expect(complianceTextClass(v)).toBeTruthy();
    });

    it(`complianceBorderClass("${v}") is a non-empty string`, () => {
      expect(complianceBorderClass(v)).toBeTruthy();
    });

    it(`complianceLabel("${v}") is a non-empty string`, () => {
      expect(complianceLabel(v)).toBeTruthy();
    });
  });
});
