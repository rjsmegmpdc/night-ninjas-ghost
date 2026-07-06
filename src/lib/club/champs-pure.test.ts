import { describe, it, expect } from 'vitest';
import {
  riegelPredictHalfS,
  computeBaseline,
  rankChamps,
  ageGroupFor,
  parseTimeS,
  formatTimeS,
  type ChampsEntry,
} from './champs-pure';

function entry(over: Partial<ChampsEntry>): ChampsEntry {
  return {
    id: 1, name: 'Test', sex: 'M', yob: 1985,
    pb5kS: null, pb10kS: null, pb21kS: null, actualS: null,
    ...over,
  };
}

describe('riegelPredictHalfS', () => {
  it('predicts a half from a 5k PB', () => {
    // 20:00 5k → Riegel half ≈ 20*60 * (21.0975/5)^1.06 ≈ 5541s ≈ 1:32:21
    const predicted = riegelPredictHalfS(1200, 5);
    expect(predicted).toBeGreaterThan(5400);
    expect(predicted).toBeLessThan(5700);
  });

  it('a 21.1k input predicts itself', () => {
    expect(riegelPredictHalfS(5400, 21.0975)).toBeCloseTo(5400, 5);
  });
});

describe('computeBaseline', () => {
  it('returns null with no PBs', () => {
    expect(computeBaseline({ pb5kS: null, pb10kS: null, pb21kS: null })).toBeNull();
  });

  it('uses the fastest predicted half across PBs', () => {
    // Strong 5k (19:00 → ~87:44 half) vs weak half PB (1:45:00)
    const b = computeBaseline({ pb5kS: 1140, pb10kS: null, pb21kS: 6300 });
    expect(b!.source).toBe('5k');
    expect(b!.baselineS).toBeLessThan(6300);
  });

  it('uses the half PB directly when it is the best evidence', () => {
    // 1:25 half beats what a 20:00 5k predicts (~92:21)
    const b = computeBaseline({ pb5kS: 1200, pb10kS: null, pb21kS: 5100 });
    expect(b!.source).toBe('21.1k');
    expect(b!.baselineS).toBe(5100);
  });
});

describe('rankChamps', () => {
  it('ranks by improvement descending', () => {
    const ranked = rankChamps([
      // baseline 5400 (half PB), ran 5100 → improvement ≈ 1.059
      entry({ id: 1, name: 'Improver', pb21kS: 5400, actualS: 5100 }),
      // baseline 5400, ran 5600 → improvement ≈ 0.964
      entry({ id: 2, name: 'Slower', pb21kS: 5400, actualS: 5600 }),
    ]);
    expect(ranked[0].name).toBe('Improver');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].improvement!).toBeGreaterThan(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[1].improvement!).toBeLessThan(1);
  });

  it('carries registered-but-unfinished entries unranked at the bottom', () => {
    const ranked = rankChamps([
      entry({ id: 1, name: 'Done', pb21kS: 5400, actualS: 5300 }),
      entry({ id: 2, name: 'Registered', pb21kS: 5000, actualS: null }),
    ]);
    expect(ranked[0].name).toBe('Done');
    expect(ranked[1].name).toBe('Registered');
    expect(ranked[1].rank).toBeNull();
    expect(ranked[1].baselineS).toBe(5000);
  });

  it('finished athletes with no PBs are unranked but shown before unfinished', () => {
    const ranked = rankChamps([
      entry({ id: 1, name: 'NoPBs', actualS: 5300 }),
      entry({ id: 2, name: 'Waiting', pb21kS: 5000 }),
      entry({ id: 3, name: 'Winner', pb21kS: 5400, actualS: 5200 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['Winner', 'NoPBs', 'Waiting']);
  });
});

describe('ageGroupFor', () => {
  it('derives brackets from year of birth', () => {
    expect(ageGroupFor(2010, 2026)).toBe('U20');   // 16
    expect(ageGroupFor(1996, 2026)).toBe('20-34'); // 30
    expect(ageGroupFor(1989, 2026)).toBe('35-39'); // 37
    expect(ageGroupFor(1980, 2026)).toBe('45-49'); // 46
    expect(ageGroupFor(1960, 2026)).toBe('60+');   // 66
    expect(ageGroupFor(null, 2026)).toBeNull();
  });
});

describe('time parse/format', () => {
  it('parses mm:ss and h:mm:ss', () => {
    expect(parseTimeS('19:30')).toBe(1170);
    expect(parseTimeS('1:29:05')).toBe(5345);
  });

  it('rejects malformed input', () => {
    expect(parseTimeS('90')).toBeNull();
    expect(parseTimeS('1:75')).toBeNull();
    expect(parseTimeS('1:00:75')).toBeNull();
    expect(parseTimeS('abc')).toBeNull();
    expect(parseTimeS('0:00')).toBeNull();
  });

  it('round-trips through format', () => {
    expect(formatTimeS(5345)).toBe('1:29:05');
    expect(formatTimeS(1170)).toBe('19:30');
  });
});
