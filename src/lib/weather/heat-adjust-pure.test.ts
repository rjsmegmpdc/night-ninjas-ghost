import { describe, expect, it } from 'vitest';
import {
  heatAdjust,
  applyHeatToPaceSpk,
  apparentTemperature,
  MAX_PACE_ADJUST_PCT,
  HEAT_THRESHOLD_C,
  type HeatConditions,
} from './heat-adjust-pure';

describe('heatAdjust', () => {
  it('returns no penalty in cool conditions (12C / 40%)', () => {
    const r = heatAdjust({ tempC: 12, humidityPct: 40 });
    expect(r.paceAdjustPct).toBe(0);
    expect(r.severity).toBe('none');
    expect(r.apparentTempC).toBe(12);
  });

  it('returns no penalty exactly at the threshold', () => {
    const r = heatAdjust({ tempC: HEAT_THRESHOLD_C, humidityPct: 90 });
    expect(r.paceAdjustPct).toBe(0);
    expect(r.severity).toBe('none');
  });

  it('penalises hot + humid more than hot + dry at the same temperature', () => {
    const hotDry = heatAdjust({ tempC: 28, humidityPct: 30 });
    const hotHumid = heatAdjust({ tempC: 28, humidityPct: 90 });
    expect(hotHumid.paceAdjustPct).toBeGreaterThan(hotDry.paceAdjustPct);
    expect(hotHumid.apparentTempC).toBeGreaterThan(hotDry.apparentTempC);
  });

  it('increases monotonically with temperature at fixed humidity', () => {
    const humidity = 55;
    let prev = -1;
    for (const tempC of [14, 16, 20, 24, 28, 32, 36, 40]) {
      const pct = heatAdjust({ tempC, humidityPct: humidity }).paceAdjustPct;
      expect(pct).toBeGreaterThanOrEqual(prev);
      prev = pct;
    }
  });

  it('walks through the severity bands as it gets hotter', () => {
    const bands = [14, 20, 28, 42].map(
      (tempC) => heatAdjust({ tempC, humidityPct: 60 }).severity,
    );
    expect(bands).toEqual(['none', 'mild', 'moderate', 'severe']);
  });

  it('respects the pace-adjustment cap in extreme heat', () => {
    const r = heatAdjust({ tempC: 50, humidityPct: 100 });
    expect(r.paceAdjustPct).toBeLessThanOrEqual(MAX_PACE_ADJUST_PCT);
    expect(r.severity).toBe('severe');
    expect(r.advisory).toMatch(/severe/i);
  });

  it('produces an advisory string for every condition', () => {
    const conditions: HeatConditions[] = [
      { tempC: 10, humidityPct: 50 },
      { tempC: 22, humidityPct: 40 },
      { tempC: 30, humidityPct: 70 },
      { tempC: 40, humidityPct: 95 },
    ];
    for (const c of conditions) {
      expect(heatAdjust(c).advisory.length).toBeGreaterThan(0);
    }
  });

  it('clamps out-of-range humidity instead of throwing', () => {
    const low = heatAdjust({ tempC: 28, humidityPct: -20 });
    const high = heatAdjust({ tempC: 28, humidityPct: 250 });
    // -20% behaves like 0% (dry); 250% behaves like 100% (saturated).
    expect(low.paceAdjustPct).toBe(heatAdjust({ tempC: 28, humidityPct: 0 }).paceAdjustPct);
    expect(high.paceAdjustPct).toBe(heatAdjust({ tempC: 28, humidityPct: 100 }).paceAdjustPct);
  });
});

describe('applyHeatToPaceSpk', () => {
  it('leaves goal pace unchanged in cool conditions', () => {
    expect(applyHeatToPaceSpk(300, { tempC: 12, humidityPct: 40 })).toBe(300);
  });

  it('slows pace (larger spk) in the heat', () => {
    const goal = 300; // 5:00 / km
    const adjusted = applyHeatToPaceSpk(goal, { tempC: 30, humidityPct: 75 });
    expect(adjusted).toBeGreaterThan(goal);
  });

  it('matches goalSpk * (1 + paceAdjustPct/100)', () => {
    const goal = 270;
    const c = { tempC: 26, humidityPct: 80 };
    const expected = Math.round(goal * (1 + heatAdjust(c).paceAdjustPct / 100) * 10) / 10;
    expect(applyHeatToPaceSpk(goal, c)).toBe(expected);
  });
});

describe('apparentTemperature', () => {
  it('equals air temperature in cold or dry air', () => {
    expect(apparentTemperature({ tempC: 10, humidityPct: 90 })).toBe(10);
    expect(apparentTemperature({ tempC: 25, humidityPct: 40 })).toBe(25);
  });

  it('reads hotter than air temperature when warm and humid', () => {
    expect(apparentTemperature({ tempC: 30, humidityPct: 90 })).toBeGreaterThan(30);
  });
});
