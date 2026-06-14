import { describe, it, expect } from 'vitest';
import {
  evaluateEasyDiscipline,
  evaluateRepIntensity,
  computeQualityCap,
  evaluateMaxHrValidity,
  buildNsGuardReport,
  type SessionSample,
} from './ns-guardrails';

const easy = (reserve: number | null, dateIso = '2026-06-01'): SessionSample => ({ dateIso, kind: 'easy', reserve, minutes: 50 });
const quality = (reserve: number | null, minutes = 25, dateIso = '2026-06-02'): SessionSample => ({ dateIso, kind: 'quality', reserve, minutes });

describe('evaluateEasyDiscipline', () => {
  it('passes when all easy days are below the ceiling', () => {
    const r = evaluateEasyDiscipline([easy(0.6), easy(0.65), easy(0.55)]);
    expect(r.severity).toBe('ok');
  });
  it('warns when some easy days run hot', () => {
    const r = evaluateEasyDiscipline([easy(0.6), easy(0.72), easy(0.6), easy(0.55)]); // 1/4 = 25%
    expect(r.severity).toBe('warn');
  });
  it('misses when many easy days run hot', () => {
    const r = evaluateEasyDiscipline([easy(0.72), easy(0.74), easy(0.6)]); // 2/3 = 67%
    expect(r.severity).toBe('miss');
  });
  it('ignores sessions without HR data', () => {
    const r = evaluateEasyDiscipline([easy(null), easy(null)]);
    expect(r.severity).toBe('ok');
    expect(r.body).toMatch(/no easy sessions/i);
  });
});

describe('evaluateRepIntensity', () => {
  it('passes when reps stay sub-threshold', () => {
    const r = evaluateRepIntensity([quality(0.82), quality(0.85), quality(0.80)]);
    expect(r.severity).toBe('ok');
    expect(r.title).toMatch(/controlled/i);
  });
  it('warns when some sessions reach threshold/VO2', () => {
    const r = evaluateRepIntensity([quality(0.82), quality(0.90), quality(0.84)]); // 1/3 = 33%
    expect(r.severity).toBe('warn');
  });
  it('misses when half or more run too hot', () => {
    const r = evaluateRepIntensity([quality(0.90), quality(0.92)]); // 2/2 = 100%
    expect(r.severity).toBe('miss');
  });
});

describe('computeQualityCap', () => {
  it('is ok inside the 20-25% band', () => {
    // 22 quality min of 100 total = 22%
    const samples: SessionSample[] = [
      quality(0.84, 22),
      easy(0.6),  // 50
      { dateIso: '2026-06-03', kind: 'easy', reserve: 0.6, minutes: 28 },
    ];
    const r = computeQualityCap(samples);
    expect(r.severity).toBe('ok');
    expect(Math.round(r.fraction * 100)).toBe(22);
  });
  it('misses when well over the ceiling', () => {
    const samples: SessionSample[] = [quality(0.84, 40), easy(0.6)]; // 40/90 = 44%
    const r = computeQualityCap(samples);
    expect(r.severity).toBe('miss');
  });
  it('warns when under the floor', () => {
    const samples: SessionSample[] = [quality(0.84, 5), easy(0.6), easy(0.6)]; // 5/105 = 5%
    const r = computeQualityCap(samples);
    expect(r.severity).toBe('warn');
    expect(r.body).toMatch(/too low|under/i);
  });
});

describe('evaluateMaxHrValidity', () => {
  it('misses when an observed activity HR exceeds configured max', () => {
    const r = evaluateMaxHrValidity({ configuredMaxHr: 180, hasMeasuredMax: true, age: 40, observedMaxHr: 188 });
    expect(r.severity).toBe('miss');
    expect(r.body).toMatch(/exceeds|above/i);
  });
  it('warns when relying on age-predicted max', () => {
    const r = evaluateMaxHrValidity({ configuredMaxHr: 180, hasMeasuredMax: false, age: 40, observedMaxHr: 170 });
    expect(r.severity).toBe('warn');
    expect(r.body).toContain('180'); // 220-40
  });
  it('is ok with a measured max and no exceedance', () => {
    const r = evaluateMaxHrValidity({ configuredMaxHr: 185, hasMeasuredMax: true, age: 40, observedMaxHr: 180 });
    expect(r.severity).toBe('ok');
  });
  it('handles no max and no age', () => {
    const r = evaluateMaxHrValidity({ configuredMaxHr: null, hasMeasuredMax: false, age: null, observedMaxHr: null });
    expect(r.severity).toBe('warn');
    expect(r.body).toMatch(/can't run reliably|profile/i);
  });
});

describe('buildNsGuardReport', () => {
  it('surfaces the worst severity across guards', () => {
    const samples = [easy(0.72), easy(0.74), quality(0.90, 25)];
    const r = buildNsGuardReport(samples, { configuredMaxHr: 185, hasMeasuredMax: true, age: 40, observedMaxHr: 180 });
    expect(r.worst).toBe('miss'); // easy discipline misses
  });
  it('is ok when everything passes', () => {
    const samples = [quality(0.84, 22), { dateIso: '2026-06-01', kind: 'easy' as const, reserve: 0.6, minutes: 39 }, { dateIso: '2026-06-03', kind: 'easy' as const, reserve: 0.6, minutes: 39 }];
    const r = buildNsGuardReport(samples, { configuredMaxHr: 185, hasMeasuredMax: true, age: 40, observedMaxHr: 180 });
    expect(r.worst).toBe('ok');
  });
});

describe('absolute HR caps (NS personal calibration)', () => {
  const easyHr = (avgHr: number | null): SessionSample => ({ dateIso: '2026-06-01', kind: 'easy', reserve: null, avgHr, minutes: 50 });
  const qualHr = (avgHr: number | null): SessionSample => ({ dateIso: '2026-06-02', kind: 'quality', reserve: null, avgHr, minutes: 25 });

  it('uses the absolute easy cap when avgHr + cap are present, ignoring reserve', () => {
    // 130 bpm > 128 cap -> hot, even with no reserve data
    const r = evaluateEasyDiscipline([easyHr(130), easyHr(120), easyHr(118)], { easyHrCap: 128 });
    expect(r.severity).toBe('warn'); // 1 of 3 hot = 33%
    expect(r.body).toContain('128');
  });

  it('passes easy days under the absolute cap', () => {
    const r = evaluateEasyDiscipline([easyHr(122), easyHr(125)], { easyHrCap: 128 });
    expect(r.severity).toBe('ok');
    expect(r.body).toContain('128');
  });

  it('uses the absolute sub-threshold cap for reps', () => {
    // 145 > 141 cap -> too hot
    const r = evaluateRepIntensity([qualHr(145), qualHr(138), qualHr(137)], { subThresholdHrCap: 141 });
    expect(r.severity).toBe('warn'); // 1 of 3 = 33%
    expect(r.body).toContain('141');
  });

  it('passes reps under the absolute sub-threshold cap', () => {
    const r = evaluateRepIntensity([qualHr(139), qualHr(140)], { subThresholdHrCap: 141 });
    expect(r.severity).toBe('ok');
  });

  it('falls back to reserve when avgHr is absent even if a cap is set', () => {
    const r = evaluateEasyDiscipline([{ dateIso: '2026-06-01', kind: 'easy', reserve: 0.75, avgHr: null, minutes: 50 }, { dateIso: '2026-06-02', kind: 'easy', reserve: 0.6, avgHr: null, minutes: 50 }, { dateIso: '2026-06-03', kind: 'easy', reserve: 0.6, avgHr: null, minutes: 50 }], { easyHrCap: 128 });
    expect(r.severity).toBe('warn'); // reserve fallback 1 of 3 = 33%
  });

  it("Matt's caps: a 130bpm easy run and 143bpm rep both flag", () => {
    const samples = [easyHr(130), qualHr(143)];
    const r = buildNsGuardReport(samples, { configuredMaxHr: 166, hasMeasuredMax: false, age: null, observedMaxHr: 160 }, { easyHrCap: 128, subThresholdHrCap: 141 });
    expect(r.easyDiscipline.severity).not.toBe('ok');
    expect(r.repIntensity.severity).not.toBe('ok');
  });
});
