import { describe, it, expect } from 'vitest';
import { longRunFuelingPlan, applyHeatToFueling } from './fueling-pure';
import { fuelingPlan } from './execution-pure';

describe('longRunFuelingPlan', () => {
  it('always sets startFuelingAtMin to 45', () => {
    expect(longRunFuelingPlan(90).startFuelingAtMin).toBe(45);
    expect(longRunFuelingPlan(180).startFuelingAtMin).toBe(45);
  });

  it('uses 30g/hr for runs ≤60 min', () => {
    expect(longRunFuelingPlan(60).carbsPerHrG).toBe(30);
  });

  it('uses 60g/hr for runs between 60 and 150 min', () => {
    expect(longRunFuelingPlan(90).carbsPerHrG).toBe(60);
    expect(longRunFuelingPlan(120).carbsPerHrG).toBe(60);
    expect(longRunFuelingPlan(150).carbsPerHrG).toBe(60);
  });

  it('uses 90g/hr for runs >150 min', () => {
    expect(longRunFuelingPlan(151).carbsPerHrG).toBe(90);
    expect(longRunFuelingPlan(180).carbsPerHrG).toBe(90);
  });

  it('60-min run: no gels — short fueled window', () => {
    const p = longRunFuelingPlan(60);
    // fueled time = 15 min = 0.25hr; carbs = 30 * 0.25 = 7.5 → round = 8; gels = round(8/25) = 0
    expect(p.gelCount).toBe(0);
    expect(p.gelIntervalMin).toBe(0);
    expect(p.note).toMatch(/water to thirst/i);
  });

  it('90-min run: 1 gel at 30min into fueled window', () => {
    const p = longRunFuelingPlan(90);
    // fueled time = 45 min = 0.75hr; carbs = 60 * 0.75 = 45g; gels = round(45/25) = 2
    expect(p.gelCount).toBe(2);
    expect(p.gelIntervalMin).toBe(23); // round(45 / 2)
  });

  it('120-min run: reasonable gel count', () => {
    const p = longRunFuelingPlan(120);
    // fueled time = 75 min = 1.25hr; carbs = 60 * 1.25 = 75g; gels = round(75/25) = 3
    expect(p.gelCount).toBe(3);
    expect(p.gelIntervalMin).toBe(25); // round(75 / 3)
  });

  it('180-min run: 90g/hr ladder, 8 gels', () => {
    const p = longRunFuelingPlan(180);
    // fueled time = 135 min = 2.25hr; carbs = 90 * 2.25 = 202.5 → 203; gels = round(203/25) = 8
    expect(p.totalCarbsG).toBe(203);
    expect(p.gelCount).toBe(8);
    expect(p.gelIntervalMin).toBe(17); // round(135/8)
  });

  it('fluid and sodium baselines match training constants', () => {
    const p = longRunFuelingPlan(150);
    expect(p.fluidMlPerHr).toBe(500);
    expect(p.sodiumMgPerHr).toBe(400);
  });

  it('note references gel count and interval when gels > 0', () => {
    const p = longRunFuelingPlan(120);
    expect(p.note).toMatch(/45 min/);
    expect(p.note).toMatch(/3 gels/);
    expect(p.note).toMatch(/25 min/);
  });
});

describe('applyHeatToFueling', () => {
  const base = fuelingPlan(3 * 3600); // 3h race, 90g/hr

  it('severity none: returns original plan unchanged, heatNote null', () => {
    const { fueling, heatNote } = applyHeatToFueling(base, 'none');
    expect(fueling).toEqual(base);
    expect(heatNote).toBeNull();
  });

  it('mild: adds +150ml fluid, +200mg sodium', () => {
    const { fueling, heatNote } = applyHeatToFueling(base, 'mild');
    expect(fueling.fluidMlPerHr).toBe(base.fluidMlPerHr + 150);
    expect(fueling.sodiumMgPerHr).toBe(base.sodiumMgPerHr + 200);
    expect(heatNote).toMatch(/mild/i);
    expect(heatNote).toMatch(/\+150/);
    expect(heatNote).toMatch(/\+200/);
  });

  it('moderate: adds +300ml fluid, +400mg sodium', () => {
    const { fueling, heatNote } = applyHeatToFueling(base, 'moderate');
    expect(fueling.fluidMlPerHr).toBe(base.fluidMlPerHr + 300);
    expect(fueling.sodiumMgPerHr).toBe(base.sodiumMgPerHr + 400);
    expect(heatNote).toMatch(/moderate/i);
  });

  it('severe: adds +500ml fluid, +600mg sodium', () => {
    const { fueling, heatNote } = applyHeatToFueling(base, 'severe');
    expect(fueling.fluidMlPerHr).toBe(base.fluidMlPerHr + 500);
    expect(fueling.sodiumMgPerHr).toBe(base.sodiumMgPerHr + 600);
    expect(heatNote).toMatch(/severe/i);
  });

  it('recalculates totalFluidMl correctly', () => {
    const { fueling } = applyHeatToFueling(base, 'moderate');
    const expectedFluid = Math.round((base.fluidMlPerHr + 300) * (base.durationS / 3600));
    expect(fueling.totalFluidMl).toBe(expectedFluid);
  });

  it('does not change carbsPerHrG or gel counts', () => {
    const { fueling } = applyHeatToFueling(base, 'severe');
    expect(fueling.carbsPerHrG).toBe(base.carbsPerHrG);
    expect(fueling.totalCarbsG).toBe(base.totalCarbsG);
    expect(fueling.gelCount).toBe(base.gelCount);
    expect(fueling.gelIntervalMin).toBe(base.gelIntervalMin);
  });

  it('works on any duration', () => {
    const short = fuelingPlan(1 * 3600);
    const { fueling } = applyHeatToFueling(short, 'mild');
    expect(fueling.fluidMlPerHr).toBe(short.fluidMlPerHr + 150);
    expect(fueling.totalFluidMl).toBe(Math.round((short.fluidMlPerHr + 150) * 1));
  });
});
