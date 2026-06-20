import { describe, it, expect } from 'vitest';
import { taperChecklist, buildTaperCues } from './taper-pure';

describe('taperChecklist', () => {
  it('returns the full discipline set', () => {
    const items = taperChecklist(14);
    expect(items.map((i) => i.key)).toEqual(['sleep', 'hydration', 'fuel', 'last-hard', 'strides', 'logistics']);
  });
  it('holds normal fuelling outside the final 3 days', () => {
    const fuel = taperChecklist(10).find((i) => i.key === 'fuel')!;
    expect(fuel.title).toBe('Hold normal fuelling');
  });
  it('flips to carb-load inside the final 3 days', () => {
    const fuel = taperChecklist(3).find((i) => i.key === 'fuel')!;
    expect(fuel.title).toBe('Carb-load');
  });
});

describe('buildTaperCues', () => {
  it('emits cues only for present, meaningful data', () => {
    const cues = buildTaperCues({ volumeDeltaPct: 12, biggestWeekKm: 92, compliancePct: 85, longestRunKm: 32 });
    expect(cues).toHaveLength(4);
    expect(cues[0]).toContain('92 km');
    expect(cues.some((c) => c.includes('12%'))).toBe(true);
    expect(cues.some((c) => c.includes('85%'))).toBe(true);
  });
  it('drops a negative/flat volume delta and weak compliance', () => {
    const cues = buildTaperCues({ volumeDeltaPct: -4, biggestWeekKm: null, compliancePct: 50, longestRunKm: null });
    expect(cues).toEqual([]);
  });
  it('returns nothing when no data is available', () => {
    expect(buildTaperCues({ volumeDeltaPct: null, biggestWeekKm: null, compliancePct: null, longestRunKm: null })).toEqual([]);
  });
});
