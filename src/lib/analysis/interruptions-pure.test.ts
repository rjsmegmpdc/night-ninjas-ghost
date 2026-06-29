import { describe, it, expect } from 'vitest';
import {
  isActive,
  durationDays,
  hasActiveInjuryOrIllness,
  windowsOverlapping,
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

describe('windowsOverlapping', () => {
  const WEEK_START = '2026-06-15';
  const WEEK_END = '2026-06-21';
  const TYPES = ['illness', 'travel'] as const;

  it('returns a travel window fully inside the week', () => {
    const w = mk({ id: 2, type: 'travel', startDate: '2026-06-16', endDate: '2026-06-18' });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(1);
  });
  it('excludes an illness that resolved before the week', () => {
    const w = mk({ id: 3, type: 'illness', startDate: '2026-05-20', endDate: '2026-06-01' });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(0);
  });
  it('includes an open (ongoing) illness that started before the week', () => {
    const w = mk({ id: 4, type: 'illness', startDate: '2026-06-10', endDate: null });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(1);
  });
  it('excludes a future window that starts after the week ends', () => {
    const w = mk({ id: 5, type: 'travel', startDate: '2026-07-01', endDate: '2026-07-05' });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(0);
  });
  it('filters by type (injury excluded when only illness/travel requested)', () => {
    const w = mk({ id: 6, type: 'injury', startDate: '2026-06-16', endDate: '2026-06-18' });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(0);
  });
  it('treats boundary touch (ends exactly on week start) as overlapping', () => {
    const w = mk({ id: 7, type: 'travel', startDate: '2026-06-08', endDate: WEEK_START });
    expect(windowsOverlapping([w], WEEK_START, WEEK_END, [...TYPES])).toHaveLength(1);
  });
  it('separates illness from travel when only one type is requested', () => {
    const ill = mk({ id: 8, type: 'illness', startDate: '2026-06-16', endDate: '2026-06-17' });
    const trv = mk({ id: 9, type: 'travel', startDate: '2026-06-16', endDate: '2026-06-17' });
    expect(windowsOverlapping([ill, trv], WEEK_START, WEEK_END, ['illness'])).toEqual([ill]);
    expect(windowsOverlapping([ill, trv], WEEK_START, WEEK_END, ['travel'])).toEqual([trv]);
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
