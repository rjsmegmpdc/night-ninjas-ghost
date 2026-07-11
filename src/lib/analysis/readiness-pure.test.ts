import { describe, it, expect } from 'vitest';
import {
  computeReadiness,
  computeBaselineFromHistory,
  type ReadinessInputs,
} from './readiness-pure';

// ---------------------------------------------------------------------------
// Helper — fully null inputs (neutral baseline = 60 per component)
// ---------------------------------------------------------------------------
const nullInputs: ReadinessInputs = {
  hrvMs: null,
  rhrBpm: null,
  sleepScore: null,
  sleepDurationS: null,
  stressScore: null,
  bodyBattery: null,
};

describe('computeReadiness — null inputs give neutral score', () => {
  it('all-null inputs produce score 60 (neutral weighted average)', () => {
    const r = computeReadiness(nullInputs);
    expect(r.score).toBe(60);
  });

  it('all-null gives "Moderate" label', () => {
    const r = computeReadiness(nullInputs);
    expect(r.label).toBe('Moderate');
    expect(r.color).toBe('text-accent');
  });

  it('all-null has no factors', () => {
    const r = computeReadiness(nullInputs);
    expect(r.factors).toHaveLength(0);
  });
});

describe('computeReadiness — label thresholds', () => {
  it('score 80+ → Optimal', () => {
    // High HRV, good sleep, full battery, low stress = excellent
    const r = computeReadiness({
      hrvMs: 80,
      rhrBpm: 45,
      sleepScore: 92,
      sleepDurationS: 28800,
      stressScore: 10,
      bodyBattery: 95,
    });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.label).toBe('Optimal');
    expect(r.color).toBe('text-signal-ok');
  });

  it('score 65–79 → Good', () => {
    const r = computeReadiness({
      hrvMs: 55,
      rhrBpm: 58,
      sleepScore: 75,
      sleepDurationS: null,
      stressScore: 30,
      bodyBattery: 70,
    });
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(r.score).toBeLessThanOrEqual(79);
    expect(r.label).toBe('Good');
  });

  it('score 50–64 → Moderate', () => {
    const r = computeReadiness({
      hrvMs: 35,
      rhrBpm: 65,
      sleepScore: 60,
      sleepDurationS: null,
      stressScore: 50,
      bodyBattery: 50,
    });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.score).toBeLessThanOrEqual(64);
    expect(r.label).toBe('Moderate');
  });

  it('score 35–49 → Low', () => {
    // Mildly poor: HRV in 20ms absolute band (sub-score 50), moderate-poor sleep and battery,
    // moderate stress. Weighted: 50*0.35 + 45*0.25 + 40*0.20 + 40*0.15 + 60*0.05
    // = 17.5 + 11.25 + 8 + 6 + 3 = 45.75 → 46
    const r = computeReadiness({
      hrvMs: 25,       // absolute sub-score = 50
      rhrBpm: null,
      sleepScore: 45,
      sleepDurationS: null,
      stressScore: 60, // stressContrib = 40
      bodyBattery: 40,
    });
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.score).toBeLessThanOrEqual(49);
    expect(r.label).toBe('Low');
    expect(r.color).toBe('text-signal-warn');
  });

  it('score 0–34 → Rest', () => {
    const r = computeReadiness({
      hrvMs: 5,
      rhrBpm: 90,
      sleepScore: 10,
      sleepDurationS: null,
      stressScore: 95,
      bodyBattery: 5,
    });
    expect(r.score).toBeLessThanOrEqual(34);
    expect(r.label).toBe('Rest');
    expect(r.color).toBe('text-signal-miss');
  });
});

describe('computeReadiness — HRV sub-score with and without baseline', () => {
  it('HRV above baseline pushes score up vs same HRV at a low baseline', () => {
    // HRV 70ms with baseline 40ms: relative = 50 + (70-40)/40*100 = 50+75 = 125 → clamped 100
    const highAboveBaseline = computeReadiness(
      { ...nullInputs, hrvMs: 70 },
      { hrvMs: 40 },
    );
    // HRV 70ms with baseline 80ms: relative = 50 + (70-80)/80*100 = 50-12.5 = 37.5
    const belowBaseline = computeReadiness(
      { ...nullInputs, hrvMs: 70 },
      { hrvMs: 80 },
    );
    expect(highAboveBaseline.score).toBeGreaterThan(belowBaseline.score);
  });

  it('HRV below baseline pushes score down', () => {
    const below = computeReadiness({ ...nullInputs, hrvMs: 40 }, { hrvMs: 60 });
    const neutral = computeReadiness({ ...nullInputs, hrvMs: 60 }, { hrvMs: 60 });
    expect(below.score).toBeLessThan(neutral.score);
  });

  it('HRV absolute scale — <20ms scores 20', () => {
    const r = computeReadiness({ ...nullInputs, hrvMs: 15 });
    // HRV component 20 * 0.35 + 60 * 0.65 = 7 + 39 = 46 — but other components are 60
    // weighted: 20*0.35 + 60*(0.25+0.20+0.15+0.05) = 7 + 39 = 46
    expect(r.score).toBeLessThan(60);
  });

  it('HRV absolute scale — >80ms scores 100', () => {
    const r = computeReadiness({ ...nullInputs, hrvMs: 85 });
    // 100*0.35 + 60*0.65 = 35 + 39 = 74
    expect(r.score).toBe(74);
  });
});

describe('computeReadiness — stress is inverted', () => {
  it('stress 0 → stress component 100', () => {
    const low  = computeReadiness({ ...nullInputs, stressScore: 0 });
    const high = computeReadiness({ ...nullInputs, stressScore: 100 });
    expect(low.score).toBeGreaterThan(high.score);
  });

  it('stress 100 → stress component 0', () => {
    const r = computeReadiness({ ...nullInputs, stressScore: 100 });
    // stress contrib 0 * 0.15 + rest neutral 60 * 0.85 = 0 + 51 = 51
    expect(r.score).toBe(51);
  });
});

describe('computeReadiness — body battery direct mapping', () => {
  it('body battery 100 → max contribution', () => {
    const full = computeReadiness({ ...nullInputs, bodyBattery: 100 });
    const empty = computeReadiness({ ...nullInputs, bodyBattery: 0 });
    expect(full.score).toBeGreaterThan(empty.score);
  });
});

describe('computeReadiness — factors', () => {
  it('includes a factor for each non-null input with non-zero contribution', () => {
    const r = computeReadiness({
      hrvMs: 75,
      rhrBpm: 48,
      sleepScore: 85,
      sleepDurationS: 28800,
      stressScore: 20,
      bodyBattery: 80,
    });
    // sleepDurationS is not scored independently — so up to 5 factors (hrv, sleep, battery, stress, rhr)
    expect(r.factors.length).toBeGreaterThanOrEqual(3);
    const names = r.factors.map((f) => f.name);
    expect(names).toContain('HRV');
    expect(names).toContain('Sleep quality');
  });

  it('factor contribution is in -1..+1 range', () => {
    const r = computeReadiness({
      hrvMs: 80,
      rhrBpm: 45,
      sleepScore: 95,
      sleepDurationS: null,
      stressScore: 5,
      bodyBattery: 90,
    });
    for (const f of r.factors) {
      expect(f.contribution).toBeGreaterThanOrEqual(-1);
      expect(f.contribution).toBeLessThanOrEqual(1);
    }
  });

  it('factor note describes the HRV baseline delta when baseline provided', () => {
    const r = computeReadiness({ ...nullInputs, hrvMs: 40 }, { hrvMs: 55 });
    const hrvFactor = r.factors.find((f) => f.name === 'HRV');
    expect(hrvFactor).toBeDefined();
    expect(hrvFactor!.note).toMatch(/below baseline/);
  });

  it('factor note uses absolute scale when no baseline', () => {
    const r = computeReadiness({ ...nullInputs, hrvMs: 50 });
    const hrvFactor = r.factors.find((f) => f.name === 'HRV');
    expect(hrvFactor).toBeDefined();
    expect(hrvFactor!.note).toMatch(/absolute scale/);
  });

  it('no factor for null input fields', () => {
    const r = computeReadiness({ ...nullInputs, hrvMs: 60 });
    // Only HRV provided; contribution at 60ms absolute = 70 → contrib = (70-60)/40 = 0.25
    const names = r.factors.map((f) => f.name);
    expect(names).not.toContain('Sleep quality');
    expect(names).not.toContain('Body battery');
    expect(names).not.toContain('Stress');
    expect(names).not.toContain('Resting HR');
  });
});

describe('computeReadiness — score is integer 0–100', () => {
  it('score is an integer', () => {
    const r = computeReadiness({
      hrvMs: 47.3,
      rhrBpm: 59,
      sleepScore: 73,
      sleepDurationS: 25200,
      stressScore: 41,
      bodyBattery: 62,
    });
    expect(Number.isInteger(r.score)).toBe(true);
  });

  it('score is clamped to 0–100', () => {
    const r1 = computeReadiness({ ...nullInputs, bodyBattery: 200 });
    expect(r1.score).toBeLessThanOrEqual(100);
    const r2 = computeReadiness({ ...nullInputs, bodyBattery: -50 });
    expect(r2.score).toBeGreaterThanOrEqual(0);
  });
});

describe('computeReadiness — recommendations', () => {
  it('Optimal recommendation mentions key session', () => {
    const r = computeReadiness({
      hrvMs: 80, rhrBpm: 45, sleepScore: 90,
      sleepDurationS: null, stressScore: 10, bodyBattery: 95,
    });
    if (r.label === 'Optimal') {
      expect(r.recommendation).toMatch(/key session/i);
    }
  });

  it('Rest recommendation mentions rest day', () => {
    const r = computeReadiness({
      hrvMs: 5, rhrBpm: 90, sleepScore: 10,
      sleepDurationS: null, stressScore: 95, bodyBattery: 5,
    });
    if (r.label === 'Rest') {
      expect(r.recommendation).toMatch(/rest day/i);
    }
  });
});

// ---------------------------------------------------------------------------
// computeBaselineFromHistory
// ---------------------------------------------------------------------------

describe('computeBaselineFromHistory', () => {
  it('returns median HRV and RHR from history', () => {
    const history: ReadinessInputs[] = [
      { ...nullInputs, hrvMs: 50, rhrBpm: 55 },
      { ...nullInputs, hrvMs: 60, rhrBpm: 58 },
      { ...nullInputs, hrvMs: 55, rhrBpm: 52 },
      { ...nullInputs, hrvMs: 70, rhrBpm: 60 },
      { ...nullInputs, hrvMs: 65, rhrBpm: 56 },
    ];
    const baselines = computeBaselineFromHistory(history);
    // Sorted HRV: [50, 55, 60, 65, 70] → median = 60
    expect(baselines.hrvMs).toBe(60);
    // Sorted RHR: [52, 55, 56, 58, 60] → median = 56
    expect(baselines.rhrBpm).toBe(56);
  });

  it('ignores null values when computing medians', () => {
    const history: ReadinessInputs[] = [
      { ...nullInputs, hrvMs: null, rhrBpm: 55 },
      { ...nullInputs, hrvMs: 60, rhrBpm: null },
      { ...nullInputs, hrvMs: 50, rhrBpm: 58 },
    ];
    const baselines = computeBaselineFromHistory(history);
    // HRV non-null: [50, 60] → median = 55
    expect(baselines.hrvMs).toBe(55);
    // RHR non-null: [55, 58] → median = 56.5
    expect(baselines.rhrBpm).toBe(56.5);
  });

  it('returns empty object when no non-null values', () => {
    const baselines = computeBaselineFromHistory([nullInputs, nullInputs]);
    expect(baselines.hrvMs).toBeUndefined();
    expect(baselines.rhrBpm).toBeUndefined();
  });

  it('returns empty object for empty history', () => {
    const baselines = computeBaselineFromHistory([]);
    expect(Object.keys(baselines)).toHaveLength(0);
  });

  it('even-length array uses average of two middle values', () => {
    const history: ReadinessInputs[] = [
      { ...nullInputs, hrvMs: 40 },
      { ...nullInputs, hrvMs: 50 },
      { ...nullInputs, hrvMs: 60 },
      { ...nullInputs, hrvMs: 70 },
    ];
    const baselines = computeBaselineFromHistory(history);
    // Sorted: [40, 50, 60, 70] → median = (50+60)/2 = 55
    expect(baselines.hrvMs).toBe(55);
  });

  it('single entry returns that value as median', () => {
    const history: ReadinessInputs[] = [{ ...nullInputs, hrvMs: 62, rhrBpm: 54 }];
    const baselines = computeBaselineFromHistory(history);
    expect(baselines.hrvMs).toBe(62);
    expect(baselines.rhrBpm).toBe(54);
  });
});
