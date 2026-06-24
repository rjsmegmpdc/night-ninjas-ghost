import { describe, it, expect } from 'vitest';
import { buildVo2Insights } from './vo2max-insights';
import type { Vo2Observation } from './vo2max-pure';

function series(values: number[], source: 'device' | 'cooper' = 'device'): Vo2Observation[] {
  return values.map((v, i) => ({
    dateIso: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`,
    source,
    value: v,
  }));
}

describe('Tier 1 - trends', () => {
  it('reports an upward trend as positive', () => {
    const r = buildVo2Insights(series([52, 54, 56]));
    const t = r.byTier.trend[0];
    expect(t.tone).toBe('positive');
    expect(t.title).toMatch(/up/i);
  });

  it('reports a downward trend as caution', () => {
    const r = buildVo2Insights(series([56, 54, 52]));
    expect(r.byTier.trend[0].tone).toBe('caution');
  });

  it('reports stability when within half a point', () => {
    const r = buildVo2Insights(series([55.0, 55.2, 55.1]));
    expect(r.byTier.trend[0].tone).toBe('neutral');
    expect(r.byTier.trend[0].title).toMatch(/steady/i);
  });

  it('returns nothing for a single reading', () => {
    const r = buildVo2Insights(series([55]));
    expect(r.hasInsights).toBe(false);
  });
});

describe('Tier 2 - contextual heuristics use hedged language', () => {
  it('attributes a rise to volume only as a "possible factor"', () => {
    const r = buildVo2Insights(series([52, 54, 56]), { recentWeeklyKm: 80, priorWeeklyKm: 60 });
    const c = r.byTier.context.find((i) => /volume/i.test(i.title));
    expect(c).toBeTruthy();
    expect(c!.body.toLowerCase()).toContain('possible');
    // never makes a causal claim
    expect(c!.body.toLowerCase()).not.toMatch(/\bbecause\b|\bcaused\b|\bproven\b/);
  });

  it('flags short sleep as a possible factor on a dip', () => {
    const r = buildVo2Insights(series([56, 54, 52]), { recentSleepHours: 6.2 });
    const c = r.byTier.context.find((i) => /sleep/i.test(i.title));
    expect(c).toBeTruthy();
    expect(c!.tone).toBe('caution');
    expect(c!.body.toLowerCase()).toContain('possible');
  });

  it('flags elevated resting HR as a possible factor on a dip', () => {
    const r = buildVo2Insights(series([56, 54, 52]), { recentRestingHr: 54, priorRestingHr: 49 });
    const c = r.byTier.context.find((i) => /resting hr/i.test(i.title));
    expect(c).toBeTruthy();
    expect(c!.body.toLowerCase()).toContain('possible');
  });

  it('stays silent on context when none provided', () => {
    const r = buildVo2Insights(series([52, 54, 56]));
    expect(r.byTier.context).toHaveLength(0);
  });
});

describe('Tier 3 - outliers at 2.5 sigma', () => {
  it('flags a reading far from the mean', () => {
    // tight cluster around 55 with one wild reading
    const r = buildVo2Insights(series([55, 55, 54, 56, 55, 72]));
    expect(r.byTier.outlier.length).toBeGreaterThanOrEqual(1);
    expect(r.byTier.outlier[0].body).toMatch(/standard deviation/i);
    expect(r.byTier.outlier[0].body.toLowerCase()).toContain('artefact');
  });

  it('does not flag a normal spread', () => {
    const r = buildVo2Insights(series([54, 55, 56, 55, 54, 56]));
    expect(r.byTier.outlier).toHaveLength(0);
  });

  it('needs at least 4 readings to assess outliers', () => {
    const r = buildVo2Insights(series([55, 70]));
    expect(r.byTier.outlier).toHaveLength(0);
  });

  it('flags a value clearly beyond 2.5σ from the cluster (large outlier)', () => {
    // Tight cluster [54-56] with one extreme reading; MAD ≈ 1, z-score of 65 ≈ 6.7σ → flagged
    const r = buildVo2Insights(series([54, 55, 56, 54, 55, 56, 65]));
    expect(r.byTier.outlier.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag a value within 1σ of the cluster', () => {
    // 57 is only 2 units above the cluster centroid, well within any 2.5σ threshold
    const r = buildVo2Insights(series([54, 55, 56, 54, 55, 56, 57]));
    expect(r.byTier.outlier).toHaveLength(0);
  });
});

describe('Tier 1 - trend threshold boundary', () => {
  it('change of exactly 0.5 triggers a positive trend (threshold is exclusive — < not <=)', () => {
    const r = buildVo2Insights(series([55.0, 55.5]));
    expect(r.byTier.trend[0].tone).toBe('positive');
  });

  it('a very small per-period change is treated as stable', () => {
    // 3 readings, total change 0.1 → linear slope ≈ 0.05/period → within stable range
    const r = buildVo2Insights(series([55.0, 55.05, 55.1]));
    expect(r.byTier.trend[0].tone).toBe('neutral');
  });
});
