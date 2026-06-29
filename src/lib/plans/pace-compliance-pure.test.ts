import { describe, it, expect } from 'vitest';
import { checkPaceCompliance, speedMsToSpk, verdictLabel } from './pace-compliance-pure';
import type { PaceZone } from './types';

const ZONE: PaceZone = { minSpk: 240, maxSpk: 260 }; // 4:00–4:20/km

describe('speedMsToSpk', () => {
  it('converts 4.0 m/s to 250 s/km', () => {
    expect(speedMsToSpk(4.0)).toBeCloseTo(250, 1);
  });
  it('converts a typical marathon pace (3.89 m/s = 4:17/km)', () => {
    expect(speedMsToSpk(3.89)).toBeCloseTo(257, 0);
  });
  it('returns 0 for zero speed', () => {
    expect(speedMsToSpk(0)).toBe(0);
  });
  it('returns 0 for negative speed', () => {
    expect(speedMsToSpk(-1)).toBe(0);
  });
});

describe('checkPaceCompliance', () => {
  it('returns on-target when pace is inside the zone', () => {
    expect(checkPaceCompliance(250, ZONE)).toBe('on-target');
  });
  it('returns on-target at the fast boundary (minSpk)', () => {
    expect(checkPaceCompliance(240, ZONE)).toBe('on-target');
  });
  it('returns on-target at the slow boundary (maxSpk)', () => {
    expect(checkPaceCompliance(260, ZONE)).toBe('on-target');
  });
  it('returns too-fast when pace is faster than minSpk', () => {
    expect(checkPaceCompliance(230, ZONE)).toBe('too-fast');
  });
  it('returns too-slow when pace is slower than maxSpk', () => {
    expect(checkPaceCompliance(280, ZONE)).toBe('too-slow');
  });
  it('returns unknown for null actual pace', () => {
    expect(checkPaceCompliance(null, ZONE)).toBe('unknown');
  });
  it('returns unknown for undefined actual pace', () => {
    expect(checkPaceCompliance(undefined, ZONE)).toBe('unknown');
  });
  it('returns unknown for zero actual pace', () => {
    expect(checkPaceCompliance(0, ZONE)).toBe('unknown');
  });
  it('returns unknown when zone is undefined', () => {
    expect(checkPaceCompliance(250, undefined)).toBe('unknown');
  });
  it('returns unknown for zero-zone (unset cross/strength days)', () => {
    expect(checkPaceCompliance(250, { minSpk: 0, maxSpk: 0 })).toBe('unknown');
  });
});

describe('verdictLabel', () => {
  it('labels on-target', () => {
    expect(verdictLabel('on-target')).toBe('on target');
  });
  it('labels too-fast', () => {
    expect(verdictLabel('too-fast')).toBe('faster than zone');
  });
  it('labels too-slow', () => {
    expect(verdictLabel('too-slow')).toBe('slower than zone');
  });
  it('returns empty string for unknown', () => {
    expect(verdictLabel('unknown')).toBe('');
  });
});
