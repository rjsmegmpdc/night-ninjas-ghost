import { describe, it, expect } from 'vitest';
import { monthlyVolume, zoneDistribution } from './trends-pure';

describe('monthlyVolume', () => {
  it('buckets samples by calendar month and computes deltas', () => {
    const samples = [
      { dateIso: '2026-04-03', km: 40 },
      { dateIso: '2026-04-20', km: 20 },  // April = 60
      { dateIso: '2026-05-10', km: 75 },  // May = 75
      { dateIso: '2026-06-01', km: 30 },  // June = 30
    ];
    const r = monthlyVolume(samples, '2026-06-13', 3);
    expect(r.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(r.map((m) => m.km)).toEqual([60, 75, 30]);
    expect(r[0].deltaKm).toBeNull();        // first month
    expect(r[1].deltaKm).toBe(15);          // 75-60
    expect(r[1].deltaPct).toBe(25);         // +25%
    expect(r[2].deltaKm).toBe(-45);         // 30-75
    expect(r[2].deltaPct).toBe(-60);
  });

  it('zero-fills months with no activity', () => {
    const r = monthlyVolume([{ dateIso: '2026-06-01', km: 50 }], '2026-06-13', 3);
    expect(r.map((m) => m.km)).toEqual([0, 0, 50]);
    expect(r[2].deltaPct).toBeNull(); // prior month was 0
  });

  it('emits exactly the requested number of months', () => {
    const r = monthlyVolume([], '2026-06-13', 6);
    expect(r).toHaveLength(6);
    expect(r.every((m) => m.km === 0)).toBe(true);
  });
});

describe('zoneDistribution', () => {
  it('aggregates minutes and computes percentages', () => {
    const r = zoneDistribution([
      { zone: 'easy', minutes: 80, confidence: 'calibrated' },
      { zone: 'threshold', minutes: 20, confidence: 'calibrated' },
    ]);
    expect(r.totalMin).toBe(100);
    expect(r.pct.easy).toBe(80);
    expect(r.pct.threshold).toBe(20);
    expect(r.confidence).toBe('calibrated');
  });

  it('takes the worst confidence across activities', () => {
    const r = zoneDistribution([
      { zone: 'easy', minutes: 50, confidence: 'calibrated' },
      { zone: 'easy', minutes: 50, confidence: 'estimated' },
    ]);
    expect(r.confidence).toBe('estimated');
  });

  it('returns estimated + zero pct on empty input', () => {
    const r = zoneDistribution([]);
    expect(r.totalMin).toBe(0);
    expect(r.confidence).toBe('estimated');
    expect(r.pct.easy).toBe(0);
  });
});
