import { describe, it, expect } from 'vitest';
import {
  stdev,
  dailyLoadSeries,
  monotony,
  evaluateMonotony,
  MONOTONY_CAP,
  MONOTONY_THRESHOLD,
} from './monotony-pure';

describe('stdev', () => {
  it('matches the classic worked example (population SD)', () => {
    // mean 5; squared devs sum 32; /8 = 4; sqrt = 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it('is 0 for identical values', () => {
    expect(stdev([5, 5, 5])).toBe(0);
  });
  it('is 0 for an empty series', () => {
    expect(stdev([])).toBe(0);
  });
});

describe('dailyLoadSeries', () => {
  it('builds a 7-day series ending at asOf, zero-filling missing days', () => {
    const map = new Map<string, number>([
      ['2026-06-20', 50],
      ['2026-06-18', 30],
    ]);
    // 2026-06-14 .. 2026-06-20 inclusive
    expect(dailyLoadSeries(map, '2026-06-20', 7)).toEqual([0, 0, 0, 0, 30, 0, 50]);
  });
  it('includes asOf as the last element', () => {
    const map = new Map<string, number>([['2026-06-20', 12]]);
    const s = dailyLoadSeries(map, '2026-06-20', 7);
    expect(s).toHaveLength(7);
    expect(s[6]).toBe(12);
  });
});

describe('monotony', () => {
  it('caps at MONOTONY_CAP when every day is identical and non-zero', () => {
    expect(monotony([10, 10, 10, 10, 10, 10, 10])).toBe(MONOTONY_CAP);
  });
  it('is 0 for a fully rest week', () => {
    expect(monotony([0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });
  it('is high for a low-variation training week', () => {
    // 7 similar moderate days -> tiny SD -> high (capped) monotony
    expect(monotony([40, 42, 38, 41, 39, 40, 43])).toBeGreaterThanOrEqual(2);
  });
  it('is low for a well-varied week (hard/easy/rest)', () => {
    expect(monotony([60, 30, 0, 50, 30, 0, 80])).toBeLessThan(2);
  });
});

describe('evaluateMonotony', () => {
  it('fires when monotony is high and there were enough active days', () => {
    const r = evaluateMonotony([40, 42, 38, 41, 39, 40, 43]);
    expect(r.shouldTrigger).toBe(true);
    expect(r.monotony).toBeGreaterThanOrEqual(MONOTONY_THRESHOLD);
    expect(r.weeklyLoad).toBe(283);
    expect(r.strain).toBe(Math.round(r.monotony * r.weeklyLoad));
    expect(r.magnitude).toBe(0.1);
  });
  it('does NOT fire on a light week even if variation is low (too few active days)', () => {
    // only 3 active days -> guarded out regardless of monotony
    const r = evaluateMonotony([0, 0, 20, 0, 30, 0, 40]);
    expect(r.activeDays).toBe(3);
    expect(r.shouldTrigger).toBe(false);
  });
  it('does NOT fire on a well-varied week', () => {
    const r = evaluateMonotony([60, 30, 0, 50, 30, 0, 80]);
    expect(r.shouldTrigger).toBe(false);
  });
  it('respects a custom threshold', () => {
    const r = evaluateMonotony([40, 42, 38, 41, 39, 40, 43], { threshold: 99 });
    expect(r.shouldTrigger).toBe(false);
  });
});
