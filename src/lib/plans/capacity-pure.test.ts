import { describe, it, expect } from 'vitest';
import { resolveCapacity } from './capacity-pure';

describe('resolveCapacity', () => {
  it('uses per-block caps when set, sources = block', () => {
    const r = resolveCapacity({
      periodWeeklyCap: 70,
      settingsWeeklyCap: 80,
      periodLongRunCap: 24,
      settingsLongRunCap: 26,
    });
    expect(r.weeklyVolumeCapKm).toBe(70);
    expect(r.weeklyCapSource).toBe('block');
    expect(r.longRunCapKm).toBe(24);
    expect(r.longRunCapSource).toBe('block');
  });

  it('falls back to global settings when per-block is null', () => {
    const r = resolveCapacity({
      periodWeeklyCap: null,
      settingsWeeklyCap: 80,
      periodLongRunCap: null,
      settingsLongRunCap: 26,
    });
    expect(r.weeklyVolumeCapKm).toBe(80);
    expect(r.weeklyCapSource).toBe('global');
    expect(r.longRunCapKm).toBe(26);
    expect(r.longRunCapSource).toBe('global');
  });

  it('falls back to engine-default (undefined) when both sources are null', () => {
    const r = resolveCapacity({
      periodWeeklyCap: null,
      settingsWeeklyCap: null,
      periodLongRunCap: null,
      settingsLongRunCap: null,
    });
    expect(r.weeklyVolumeCapKm).toBeUndefined();
    expect(r.weeklyCapSource).toBe('engine-default');
    expect(r.longRunCapKm).toBeUndefined();
    expect(r.longRunCapSource).toBe('engine-default');
  });

  it('resolves each cap independently — weekly block + longrun global', () => {
    const r = resolveCapacity({
      periodWeeklyCap: 72,
      settingsWeeklyCap: 80,
      periodLongRunCap: null,
      settingsLongRunCap: 26,
    });
    expect(r.weeklyVolumeCapKm).toBe(72);
    expect(r.weeklyCapSource).toBe('block');
    expect(r.longRunCapKm).toBe(26);
    expect(r.longRunCapSource).toBe('global');
  });

  it('uses per-block even when it is 0 (edge case — not a real value but numerically valid)', () => {
    // 0 is technically a valid number (though no coach would set it);
    // the function trusts the caller to validate input range.
    const r = resolveCapacity({
      periodWeeklyCap: 0,
      settingsWeeklyCap: 80,
      periodLongRunCap: 0,
      settingsLongRunCap: 26,
    });
    expect(r.weeklyVolumeCapKm).toBe(0);
    expect(r.weeklyCapSource).toBe('block');
  });

  it('handles missing global settings but present block caps', () => {
    const r = resolveCapacity({
      periodWeeklyCap: 65,
      settingsWeeklyCap: null,
      periodLongRunCap: 22,
      settingsLongRunCap: null,
    });
    expect(r.weeklyVolumeCapKm).toBe(65);
    expect(r.longRunCapKm).toBe(22);
  });
});
