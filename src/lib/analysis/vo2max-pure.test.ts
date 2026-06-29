import { describe, it, expect } from 'vitest';
import {
  cooperVo2,
  rockportVo2,
  resolveVo2,
  rankVo2Source,
  vo2FitnessBand,
  type Vo2Observation,
} from './vo2max-pure';

describe('cooperVo2', () => {
  it('applies the (d-504.9)/44.73 formula', () => {
    // 3200m in 12 min -> (3200-504.9)/44.73 = 60.25 -> 60.3
    expect(cooperVo2(3200)).toBe(60.3);
  });
  it('a sub-3 marathoner-ish 12min distance lands in a sane range', () => {
    // ~3000m in 12 min
    const v = cooperVo2(3000);
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThan(60);
  });
});

describe('rockportVo2', () => {
  it('computes the standard regression', () => {
    // Known-ish worked example: 70kg, 40y, male, 13 min, 140 bpm
    const v = rockportVo2({ weightKg: 70, age: 40, sex: 'male', timeMin: 13, endHr: 140 });
    // Hand-calc: 132.853 - 0.0769*154.32 - 0.3877*40 + 6.315 - 3.2649*13 - 0.1565*140
    // = 132.853 - 11.867 - 15.508 + 6.315 - 42.444 - 21.91 = 47.44
    expect(v).toBeCloseTo(47.4, 0);
  });
  it('female sexFactor lowers the estimate vs male, all else equal', () => {
    const m = rockportVo2({ weightKg: 65, age: 35, sex: 'male', timeMin: 12, endHr: 135 });
    const f = rockportVo2({ weightKg: 65, age: 35, sex: 'female', timeMin: 12, endHr: 135 });
    expect(m - f).toBeCloseTo(6.315, 1);
  });
});

describe('rankVo2Source', () => {
  it('orders manual-lab > cooper > rockport > device', () => {
    expect(rankVo2Source('manual-lab')).toBeLessThan(rankVo2Source('cooper'));
    expect(rankVo2Source('cooper')).toBeLessThan(rankVo2Source('rockport'));
    expect(rankVo2Source('rockport')).toBeLessThan(rankVo2Source('device'));
  });
});

describe('resolveVo2', () => {
  const obs: Vo2Observation[] = [
    { dateIso: '2026-01-10', source: 'device', value: 55 },
    { dateIso: '2026-03-15', source: 'cooper', value: 58 },
    { dateIso: '2026-02-01', source: 'manual-lab', value: 56 },
    { dateIso: '2026-05-20', source: 'device', value: 57 },
  ];

  it('picks the highest-priority source even when a newer lower-priority obs exists', () => {
    const r = resolveVo2(obs);
    expect(r.currentSource).toBe('manual-lab'); // lab beats newer cooper/device
    expect(r.current).toBe(56);
    expect(r.currentDateIso).toBe('2026-02-01');
  });

  it('within the chosen source, takes the most recent', () => {
    const r = resolveVo2([
      { dateIso: '2026-01-01', source: 'device', value: 50 },
      { dateIso: '2026-04-01', source: 'device', value: 54 },
    ]);
    expect(r.currentSource).toBe('device');
    expect(r.current).toBe(54);
  });

  it('returns a full ascending series across sources', () => {
    const r = resolveVo2(obs);
    expect(r.series.map((o) => o.dateIso)).toEqual(['2026-01-10', '2026-02-01', '2026-03-15', '2026-05-20']);
  });

  it('handles empty observations', () => {
    const r = resolveVo2([]);
    expect(r.current).toBeNull();
    expect(r.currentSource).toBeNull();
    expect(r.series).toEqual([]);
  });
});

describe('vo2FitnessBand', () => {
  it('bands a strong masters runner as superior', () => {
    expect(vo2FitnessBand(56, 42, 'male')).toBe('superior');
  });
  it('returns a lower band for a lower value', () => {
    const band = vo2FitnessBand(35, 42, 'male');
    expect(['fair', 'developing']).toContain(band);
  });

  it('higher vo2 yields equal-or-better band at fixed age and sex (monotone)', () => {
    const BANDS = ['developing', 'fair', 'good', 'excellent', 'superior'];
    const b40 = BANDS.indexOf(vo2FitnessBand(40, 35, 'male'));
    const b50 = BANDS.indexOf(vo2FitnessBand(50, 35, 'male'));
    const b60 = BANDS.indexOf(vo2FitnessBand(60, 35, 'male'));
    expect(b40).toBeLessThanOrEqual(b50);
    expect(b50).toBeLessThanOrEqual(b60);
  });

  it('female gets equal-or-better band than male at same vo2 and age (female norms ~7 lower)', () => {
    const BANDS = ['developing', 'fair', 'good', 'excellent', 'superior'];
    const mBand = BANDS.indexOf(vo2FitnessBand(45, 40, 'male'));
    const fBand = BANDS.indexOf(vo2FitnessBand(45, 40, 'female'));
    expect(fBand).toBeGreaterThanOrEqual(mBand);
  });
});

describe('resolveVo2 — edge cases', () => {
  it('does not throw when observations contain an unrecognised source', () => {
    const obs = [
      { dateIso: '2026-01-01', source: 'device' as const, value: 50 },
      { dateIso: '2026-02-01', source: 'unknown-gadget' as unknown as 'device', value: 55 },
    ] as Vo2Observation[];
    expect(() => resolveVo2(obs)).not.toThrow();
  });

  it('rankVo2Source returns finite numbers for all known sources', () => {
    for (const src of ['manual-lab', 'cooper', 'rockport', 'device'] as const) {
      expect(Number.isFinite(rankVo2Source(src))).toBe(true);
    }
  });
});
