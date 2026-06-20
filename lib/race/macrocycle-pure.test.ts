import { describe, it, expect } from 'vitest';
import {
  blockNumberForYear,
  compareWeeks,
  sameWeekLastYearMonday,
  distanceLabel,
} from './macrocycle-pure';

describe('blockNumberForYear', () => {
  const periods = [
    { startDate: '2026-01-05', goalDistanceKm: 42.195 },
    { startDate: '2026-05-04', goalDistanceKm: 42.0 },
    { startDate: '2026-06-01', goalDistanceKm: 21.1 }, // half - excluded
    { startDate: '2025-09-01', goalDistanceKm: 42.195 }, // last year - excluded
    { startDate: '2026-03-02', goalDistanceKm: null }, // no goal - excluded
  ];
  it('counts marathon-distance blocks in the calendar year within tolerance', () => {
    expect(blockNumberForYear(periods, 2026, 42.195)).toBe(2);
  });
  it('excludes other distances and other years', () => {
    expect(blockNumberForYear(periods, 2025, 42.195)).toBe(1);
    expect(blockNumberForYear(periods, 2026, 21.0975)).toBe(1);
  });
});

describe('compareWeeks', () => {
  it('computes km delta percent and pace delta (negative = faster)', () => {
    const c = compareWeeks({ totalKm: 88, avgPaceSpk: 300 }, { totalKm: 80, avgPaceSpk: 312 });
    expect(c.thisYearKm).toBe(88);
    expect(c.lastYearKm).toBe(80);
    expect(c.deltaKmPct).toBe(10);
    expect(c.paceDeltaSpk).toBe(-12); // 12s/km faster
  });
  it('nulls deltas when last year has no data', () => {
    const c = compareWeeks({ totalKm: 50, avgPaceSpk: 300 }, { totalKm: 0, avgPaceSpk: null });
    expect(c.deltaKmPct).toBeNull();
    expect(c.paceDeltaSpk).toBeNull();
  });
});

describe('sameWeekLastYearMonday', () => {
  it('subtracts exactly 52 weeks, preserving the weekday', () => {
    // 2026-06-15 is a Monday; minus 364 days -> 2025-06-16 (also a Monday)
    expect(sameWeekLastYearMonday('2026-06-15')).toBe('2025-06-16');
  });
});

describe('distanceLabel', () => {
  it('labels common race distances', () => {
    expect(distanceLabel(42.195)).toBe('marathon');
    expect(distanceLabel(21.0975)).toBe('half marathon');
    expect(distanceLabel(10)).toBe('10K');
    expect(distanceLabel(56)).toBe('56km');
  });
});
