import { describe, it, expect } from 'vitest';
import {
  interpretState,
  applyAdjustment,
  computeAcwr,
  phaseBandFor,
  DEFAULT_PROFILE,
  ACWR_HARD_RAIL,
  type DojoStateProfile,
} from './state-awareness';
import type { WeekTemplate } from './types';

const HANSONS_LIKE: DojoStateProfile = {
  tsbFloor: { base: -20, build: -30, peak: -30, taper: -10 },
  protectedTypes: ['tempo', 'long'],
  preferIntensityCut: false,
};

const POLARISED_LIKE: DojoStateProfile = {
  tsbFloor: { base: -15, build: -20, peak: -20, taper: -5 },
  protectedTypes: ['long'],
  preferIntensityCut: true,
};

function week(): WeekTemplate {
  return {
    weekNumber: 8,
    phaseName: 'build',
    totalKmTarget: 62,
    longRunKmTarget: 20,
    days: [
      { dow: 0, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 8, distanceKmMax: 8 }] },
      { dow: 1, sessions: [{ label: 'Intervals', type: 'interval', distanceKmMin: 10, distanceKmMax: 10 }] },
      { dow: 2, sessions: [{ label: 'Rest', type: 'rest' }] },
      { dow: 3, sessions: [{ label: 'Tempo', type: 'tempo', distanceKmMin: 12, distanceKmMax: 12 }] },
      { dow: 4, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 6, distanceKmMax: 6 }] },
      { dow: 5, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 6, distanceKmMax: 6 }] },
      { dow: 6, sessions: [{ label: 'Long', type: 'long', distanceKmMin: 20, distanceKmMax: 20 }] },
    ],
  };
}

describe('phaseBandFor', () => {
  it('bands an 18-week program correctly', () => {
    expect(phaseBandFor(1, 18)).toBe('base');
    expect(phaseBandFor(5, 18)).toBe('base');     // 5/18 = 0.28
    expect(phaseBandFor(6, 18)).toBe('build');    // 0.33
    expect(phaseBandFor(13, 18)).toBe('build');   // 0.72
    expect(phaseBandFor(14, 18)).toBe('peak');    // 0.78
    expect(phaseBandFor(17, 18)).toBe('taper');   // 0.94
    expect(phaseBandFor(null, 18)).toBe('off-program');
  });
});

describe('computeAcwr', () => {
  it('computes acute weekly vs chronic weekly average', () => {
    // 28d chronic 160km => 40km/wk chronic; acute 52km => 1.3
    expect(computeAcwr(52, 160)).toBe(1.3);
  });
  it('returns null without chronic history', () => {
    expect(computeAcwr(50, 0)).toBeNull();
  });
});

describe('interpretState', () => {
  const base = { tsb: 0, formClass: 'maintained' as const, acwr: 1.0, band: 'build' as const };

  it('holds when state is in range', () => {
    const r = interpretState(base, HANSONS_LIKE);
    expect(r.adjustment).toBe('hold');
    expect(r.rail).toBe(false);
  });

  it('fires the ACWR hard rail at >= 1.5 regardless of profile', () => {
    const r = interpretState({ ...base, acwr: 1.55 }, HANSONS_LIKE);
    expect(r.rail).toBe(true);
    expect(r.verdict).toBe('injury-risk');
    expect(r.adjustment).toBe('reduce-volume');
    expect(r.magnitude).toBe(0.25);
    expect(r.trigger).toBe('acwr-high');
  });

  it('rail fires even off-program', () => {
    const r = interpretState({ ...base, acwr: ACWR_HARD_RAIL, band: 'off-program' }, HANSONS_LIKE);
    expect(r.rail).toBe(true);
  });

  it('flags ACWR caution band at >= 1.3', () => {
    const r = interpretState({ ...base, acwr: 1.35 }, HANSONS_LIKE);
    expect(r.trigger).toBe('acwr-caution');
    expect(r.magnitude).toBe(0.15);
    expect(r.rail).toBe(false);
  });

  it('same TSB, different dojos, different verdicts - the philosophy point', () => {
    const input = { ...base, tsb: -24 };
    // Hansons build floor -30: -24 is INTENDED cumulative fatigue -> hold
    expect(interpretState(input, HANSONS_LIKE).adjustment).toBe('hold');
    // Polarised build floor -20: -24 is over-fatigued -> intensity cut
    const pol = interpretState(input, POLARISED_LIKE);
    expect(pol.adjustment).toBe('reduce-intensity');
    expect(pol.trigger).toBe('tsb-low');
  });

  it('scales magnitude with depth below floor', () => {
    const shallow = interpretState({ ...base, tsb: -21 }, POLARISED_LIKE); // 1 below
    const deep = interpretState({ ...base, tsb: -35 }, POLARISED_LIKE);    // 15 below
    expect(deep.magnitude).toBeGreaterThan(shallow.magnitude);
    expect(deep.magnitude).toBeLessThanOrEqual(0.25);
  });

  it('overreached form class earns add-recovery even above TSB floor', () => {
    const r = interpretState({ tsb: -18, formClass: 'overreached', acwr: 1.0, band: 'build' }, HANSONS_LIKE);
    expect(r.adjustment).toBe('add-recovery');
  });

  it('holds off-program when no rail fires', () => {
    const r = interpretState({ ...base, tsb: -40, band: 'off-program' }, HANSONS_LIKE);
    expect(r.adjustment).toBe('hold');
  });
});

describe('applyAdjustment', () => {
  it('returns the same template on hold', () => {
    const raw = week();
    const r = applyAdjustment(raw, interpretState({ tsb: 0, formClass: 'maintained', acwr: 1.0, band: 'build' }, HANSONS_LIKE), HANSONS_LIKE);
    expect(r.changed).toBe(false);
    expect(r.template).toBe(raw);
  });

  it('never mutates the raw template', () => {
    const raw = week();
    const snapshot = JSON.stringify(raw);
    const interp = interpretState({ tsb: -40, formClass: 'loaded', acwr: 1.0, band: 'build' }, POLARISED_LIKE);
    applyAdjustment(raw, interp, POLARISED_LIKE);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it('reduce-volume respects protected types on soft adjustments', () => {
    const interp = interpretState({ tsb: -26, formClass: 'loaded', acwr: 1.0, band: 'build' }, { ...HANSONS_LIKE, tsbFloor: { ...HANSONS_LIKE.tsbFloor, build: -20 } });
    expect(interp.adjustment).toBe('reduce-volume');
    const r = applyAdjustment(week(), interp, HANSONS_LIKE);
    expect(r.changed).toBe(true);
    const tempo = r.template.days.find((d) => d.dow === 3)!.sessions[0];
    const long = r.template.days.find((d) => d.dow === 6)!.sessions[0];
    expect(tempo.distanceKmMin).toBe(12); // protected
    expect(long.distanceKmMin).toBe(20);  // protected
    const easyMon = r.template.days.find((d) => d.dow === 0)!.sessions[0];
    expect(easyMon.distanceKmMin!).toBeLessThan(8);
  });

  it('hard rail cuts protected sessions too', () => {
    const interp = interpretState({ tsb: 0, formClass: 'maintained', acwr: 1.6, band: 'build' }, HANSONS_LIKE);
    const r = applyAdjustment(week(), interp, HANSONS_LIKE);
    const tempo = r.template.days.find((d) => d.dow === 3)!.sessions[0];
    expect(tempo.distanceKmMin!).toBeLessThan(12); // protection overridden
  });

  it('reduce-intensity downgrades the hottest unprotected quality session', () => {
    const interp = interpretState({ tsb: -24, formClass: 'loaded', acwr: 1.0, band: 'build' }, POLARISED_LIKE);
    expect(interp.adjustment).toBe('reduce-intensity');
    const r = applyAdjustment(week(), interp, POLARISED_LIKE);
    const tue = r.template.days.find((d) => d.dow === 1)!.sessions[0];
    expect(tue.type).toBe('easy'); // interval downgraded
    expect(r.changes.length).toBe(1);
  });

  it('add-recovery converts the shortest easy day', () => {
    const interp = interpretState({ tsb: -10, formClass: 'overreached', acwr: 1.0, band: 'build' }, HANSONS_LIKE);
    const r = applyAdjustment(week(), interp, HANSONS_LIKE);
    const converted = r.template.days.flatMap((d) => d.sessions).filter((s) => s.type === 'recovery');
    expect(converted.length).toBe(1);
    expect(converted[0].distanceKmMin!).toBeLessThan(6);
  });

  it('recomputes weekly totals after adjustment', () => {
    const interp = interpretState({ tsb: 0, formClass: 'maintained', acwr: 1.6, band: 'build' }, HANSONS_LIKE);
    const r = applyAdjustment(week(), interp, HANSONS_LIKE);
    expect(r.template.totalKmTarget).toBeLessThan(62);
  });
});
