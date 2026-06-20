import { describe, it, expect } from 'vitest';
import { recoveryProtocol } from './post-race-pure';

describe('recoveryProtocol', () => {
  it('uses the full marathon window (21 days, 4 phases)', () => {
    const r = recoveryProtocol(2, 42.195);
    expect(r.phases).toHaveLength(4);
    expect(r.windowDays).toBe(21);
    expect(r.phases.map((p) => p.toDay)).toEqual([3, 7, 14, 21]);
  });

  it('marks the active phase from days since race', () => {
    expect(recoveryProtocol(2, 42.195).currentIndex).toBe(1); // full rest
    expect(recoveryProtocol(6, 42.195).currentIndex).toBe(2); // active recovery
    expect(recoveryProtocol(10, 42.195).currentIndex).toBe(3); // reintroduce
    expect(recoveryProtocol(18, 42.195).currentIndex).toBe(4); // rebuild
    const active = recoveryProtocol(10, 42.195).phases.find((p) => p.active)!;
    expect(active.label).toBe('Reintroduce');
  });

  it('returns null current phase once the window has passed', () => {
    expect(recoveryProtocol(25, 42.195).currentIndex).toBeNull();
  });

  it('scales the window down for shorter races, keeping phases strictly increasing', () => {
    const tenK = recoveryProtocol(1, 10);
    expect(tenK.windowDays).toBeLessThan(21);
    expect(tenK.phases).toHaveLength(4);
    // strictly increasing, no zero-length phase
    for (let i = 0; i < tenK.phases.length; i++) {
      expect(tenK.phases[i].toDay).toBeGreaterThanOrEqual(tenK.phases[i].fromDay);
      if (i > 0) expect(tenK.phases[i].fromDay).toBe(tenK.phases[i - 1].toDay + 1);
    }
  });

  it('formats single-day and multi-day ranges', () => {
    const r = recoveryProtocol(1, 5);
    expect(r.phases[0].dayRange).toMatch(/^Day(s)? /);
  });
});
