import { describe, it, expect } from 'vitest';
import { pacePlan, fuelingPlan, carbLoadPlan } from './execution-pure';

const MARA = 42.195;
const SUB3 = 3 * 3600; // 3:00:00

describe('pacePlan', () => {
  it('covers the full distance in 5km segments + final partial', () => {
    const p = pacePlan(MARA, SUB3, 'even');
    expect(p.segments.length).toBe(9); // 8 x 5km + 2.195
    // cumulativeKm is rounded to 2dp for display (42.195 -> 42.2).
    expect(p.segments[p.segments.length - 1].cumulativeKm).toBeCloseTo(MARA, 1);
  });

  it('even strategy holds goal pace and finishes exactly on target', () => {
    const p = pacePlan(MARA, SUB3, 'even');
    const goal = SUB3 / MARA;
    for (const s of p.segments) expect(s.paceSpk).toBeCloseTo(goal, 5);
    expect(p.segments[p.segments.length - 1].cumulativeTimeS).toBeCloseTo(SUB3, 3);
  });

  it('negative strategy starts slower than it finishes, same total', () => {
    const p = pacePlan(MARA, SUB3, 'negative');
    const first = p.segments[0].paceSpk;
    const last = p.segments[p.segments.length - 1].paceSpk;
    expect(first).toBeGreaterThan(last); // higher spk = slower
    expect(p.segments[p.segments.length - 1].cumulativeTimeS).toBeCloseTo(SUB3, 3);
  });

  it('progressive strategy speeds up monotonically, same total', () => {
    const p = pacePlan(MARA, SUB3, 'progressive');
    for (let i = 1; i < p.segments.length; i++) {
      expect(p.segments[i].paceSpk).toBeLessThanOrEqual(p.segments[i - 1].paceSpk + 1e-6);
    }
    expect(p.segments[p.segments.length - 1].cumulativeTimeS).toBeCloseTo(SUB3, 3);
  });
});

describe('fuelingPlan', () => {
  it('uses 90 g/hr for a long (2.5h+) effort', () => {
    expect(fuelingPlan(SUB3).carbsPerHrG).toBe(90);
  });
  it('uses 60 g/hr for a moderate effort', () => {
    expect(fuelingPlan(2 * 3600).carbsPerHrG).toBe(60);
  });
  it('uses 30 g/hr for a short (<=1h) effort', () => {
    expect(fuelingPlan(50 * 60).carbsPerHrG).toBe(30);
  });
  it('scales totals and spaces gels across the effort', () => {
    const f = fuelingPlan(SUB3);
    expect(f.totalCarbsG).toBe(270); // 90 * 3
    expect(f.gelCount).toBeGreaterThan(0);
    expect(f.gelIntervalMin).toBeGreaterThan(0);
  });
});

describe('carbLoadPlan', () => {
  it('computes ~9 g/kg/day across three days with 4 kcal/g', () => {
    const c = carbLoadPlan(70);
    expect(c.days).toHaveLength(3);
    expect(c.days[0].gramsCarb).toBe(630); // 9 * 70
    expect(c.days[0].approxCalories).toBe(2520); // 630 * 4
    expect(c.days.map((d) => d.daysOut)).toEqual([3, 2, 1]);
  });
});

describe('pacePlan — additional invariants', () => {
  it('single-segment race (≤5km) returns 1 segment and hits target time', () => {
    const p = pacePlan(3, 15 * 60, 'negative');
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0].cumulativeTimeS).toBeCloseTo(15 * 60, 3);
    expect(p.segments[0].cumulativeKm).toBeCloseTo(3, 5);
  });

  it('negative strategy: first segment is meaningfully slower than last (~3%)', () => {
    const p = pacePlan(MARA, SUB3, 'negative');
    const first = p.segments[0].paceSpk;
    const last = p.segments[p.segments.length - 1].paceSpk;
    // Multipliers 1.015 (slow half) and 0.985 (fast half) → ratio ≈ 1.030
    expect(first / last).toBeGreaterThan(1.02);
    expect(first / last).toBeLessThan(1.05);
  });
});

describe('fuelingPlan — carb ladder boundary values', () => {
  it('exactly 1h effort returns 30 g/hr (boundary inclusive)', () => {
    expect(fuelingPlan(3600).carbsPerHrG).toBe(30);
  });

  it('1h + 1s crosses to 60 g/hr', () => {
    expect(fuelingPlan(3601).carbsPerHrG).toBe(60);
  });

  it('exactly 2.5h effort returns 60 g/hr (boundary inclusive)', () => {
    expect(fuelingPlan(9000).carbsPerHrG).toBe(60);
  });

  it('2.5h + 1s crosses to 90 g/hr', () => {
    expect(fuelingPlan(9001).carbsPerHrG).toBe(90);
  });
});
