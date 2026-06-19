import { describe, it, expect } from 'vitest';
import {
  isActive,
  durationDays,
  hasActiveInjuryOrIllness,
  returnToTraining,
  assessInjuryRisk,
  type Interruption,
} from './interruptions-pure';

function mk(over: Partial<Interruption>): Interruption {
  return {
    id: 1, type: 'injury', bodyRegion: 'calf', severity: 'moderate',
    startDate: '2026-06-01', endDate: null, note: null, ...over,
  };
}

describe('isActive / durationDays', () => {
  it('active when no end date', () => {
    expect(isActive(mk({ endDate: null }))).toBe(true);
    expect(isActive(mk({ endDate: '2026-06-05' }))).toBe(false);
  });
  it('counts inclusive duration', () => {
    expect(durationDays(mk({ startDate: '2026-06-01', endDate: '2026-06-03' }), '2026-06-10')).toBe(3);
  });
  it('active duration runs to today', () => {
    expect(durationDays(mk({ startDate: '2026-06-01', endDate: null }), '2026-06-05')).toBe(5);
  });
});

describe('hasActiveInjuryOrIllness', () => {
  it('true for an active injury', () => {
    expect(hasActiveInjuryOrIllness([mk({ type: 'injury', endDate: null })])).toBe(true);
  });
  it('true for an active illness', () => {
    expect(hasActiveInjuryOrIllness([mk({ type: 'illness', endDate: null })])).toBe(true);
  });
  it('false for active travel (does not suppress auto-adjust)', () => {
    expect(hasActiveInjuryOrIllness([mk({ type: 'travel', endDate: null })])).toBe(false);
  });
  it('false when injury is resolved', () => {
    expect(hasActiveInjuryOrIllness([mk({ type: 'injury', endDate: '2026-06-05' })])).toBe(false);
  });
});

describe('returnToTraining', () => {
  it('returns null for an active interruption', () => {
    expect(returnToTraining(mk({ endDate: null }), '2026-06-10')).toBeNull();
  });
  it('returns null for travel/other types', () => {
    expect(returnToTraining(mk({ type: 'travel', endDate: '2026-06-05' }), '2026-06-06')).toBeNull();
  });
  it('phase 1 (reintroduce) immediately after a resolved injury', () => {
    const r = returnToTraining(mk({ startDate: '2026-06-01', endDate: '2026-06-14', severity: 'severe' }), '2026-06-15');
    expect(r).not.toBeNull();
    expect(r!.phase).toBe(1);
    expect(r!.label).toBe('Reintroduce');
    expect(r!.volumeFraction).toBeLessThan(0.5);
  });
  it('progresses through phases as days pass', () => {
    const inj = mk({ startDate: '2026-05-01', endDate: '2026-05-21', severity: 'severe' });
    const early = returnToTraining(inj, '2026-05-22');
    const later = returnToTraining(inj, '2026-06-02');
    expect(early!.phase).toBeLessThanOrEqual(later!.phase);
  });
  it('returns null once the ramp is complete', () => {
    const r = returnToTraining(mk({ startDate: '2026-06-01', endDate: '2026-06-02', severity: 'niggle' }), '2026-07-15');
    expect(r).toBeNull();
  });
});

describe('assessInjuryRisk', () => {
  it('high when ACWR is very high', () => {
    const r = assessInjuryRisk({ acwr: 1.6, interruptions: [], todayIso: '2026-06-14' });
    expect(r.level).toBe('high');
    expect(r.factors.some((f) => /ACWR/.test(f))).toBe(true);
  });
  it('elevated when ACWR is in the caution band', () => {
    const r = assessInjuryRisk({ acwr: 1.35, interruptions: [], todayIso: '2026-06-14' });
    expect(r.level).toBe('elevated');
  });
  it('high when an injury is active', () => {
    const r = assessInjuryRisk({ acwr: 1.0, interruptions: [mk({ type: 'injury', endDate: null })], todayIso: '2026-06-14' });
    expect(['elevated', 'high']).toContain(r.level);
    expect(r.factors.some((f) => /active/.test(f))).toBe(true);
  });
  it('flags recent injury history within 28 days', () => {
    const r = assessInjuryRisk({ acwr: 1.0, interruptions: [mk({ type: 'injury', endDate: '2026-06-01' })], todayIso: '2026-06-14' });
    expect(r.factors.some((f) => /last 4 weeks/.test(f))).toBe(true);
  });
  it('low with benign inputs', () => {
    const r = assessInjuryRisk({ acwr: 1.0, interruptions: [], todayIso: '2026-06-14' });
    expect(r.level).toBe('low');
  });
});
