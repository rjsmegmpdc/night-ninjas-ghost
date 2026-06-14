import { describe, it, expect } from 'vitest';
import { resolveDayRows, trendFor, type ResolvedDayMetrics } from './biometrics-pure';

describe('resolveDayRows - per-field source priority', () => {
  it('takes each field from the highest-priority source that has it', () => {
    const r = resolveDayRows('2026-06-10', [
      { source: 'garmin', rhrBpm: 48, hrvMs: 62, sleepDurationS: 27000, sleepScore: 80 },
      { source: 'manual-lab', rhrBpm: 45, vo2maxDevice: 58 }, // lab RHR + VO2 win
    ]);
    expect(r.rhrBpm).toBe(45);        // manual-lab outranks garmin
    expect(r.vo2maxDevice).toBe(58);  // only lab has it
    expect(r.hrvMs).toBe(62);         // only garmin has it
    expect(r.sleepDurationS).toBe(27000);
  });

  it('falls through to lower-priority source when higher has null', () => {
    const r = resolveDayRows('2026-06-10', [
      { source: 'manual-lab', rhrBpm: null, vo2maxDevice: 60 },
      { source: 'garmin', rhrBpm: 50 },
    ]);
    expect(r.rhrBpm).toBe(50); // lab RHR null -> garmin wins
    expect(r.vo2maxDevice).toBe(60);
  });

  it('records all contributing sources', () => {
    const r = resolveDayRows('2026-06-10', [
      { source: 'garmin', rhrBpm: 48 },
      { source: 'manual-lab', vo2maxDevice: 58 },
    ]);
    expect(r.sources.sort()).toEqual(['garmin', 'manual-lab']);
  });

  it('handles unknown sources as lowest priority', () => {
    const r = resolveDayRows('2026-06-10', [
      { source: 'some-future-vendor', rhrBpm: 99 },
      { source: 'garmin', rhrBpm: 50 },
    ]);
    expect(r.rhrBpm).toBe(50); // garmin (known) beats unknown
  });

  it('whoop beats apple-health beats coros', () => {
    const r = resolveDayRows('2026-06-10', [
      { source: 'coros', hrvMs: 30 },
      { source: 'apple-health', hrvMs: 40 },
      { source: 'whoop', hrvMs: 55 },
    ]);
    expect(r.hrvMs).toBe(55);
  });

  it('returns all-null day when rows have no values', () => {
    const r = resolveDayRows('2026-06-10', [{ source: 'garmin' }]);
    expect(r.rhrBpm).toBeNull();
    expect(r.sources).toEqual([]);
  });
});

describe('trendFor', () => {
  const days: ResolvedDayMetrics[] = [
    { date: '2026-06-01', rhrBpm: 50, hrvMs: null, sleepDurationS: null, sleepScore: null, stressScore: null, bodyBattery: null, vo2maxDevice: null, weightKg: null, sources: ['garmin'] },
    { date: '2026-06-02', rhrBpm: 52, hrvMs: null, sleepDurationS: null, sleepScore: null, stressScore: null, bodyBattery: null, vo2maxDevice: null, weightKg: null, sources: ['garmin'] },
    { date: '2026-06-03', rhrBpm: 48, hrvMs: null, sleepDurationS: null, sleepScore: null, stressScore: null, bodyBattery: null, vo2maxDevice: null, weightKg: null, sources: ['garmin'] },
    { date: '2026-06-04', rhrBpm: 46, hrvMs: null, sleepDurationS: null, sleepScore: null, stressScore: null, bodyBattery: null, vo2maxDevice: null, weightKg: null, sources: ['garmin'] },
  ];

  it('picks the latest non-null value and date', () => {
    const t = trendFor(days, 'rhrBpm');
    expect(t.latest).toBe(46);
    expect(t.latestDate).toBe('2026-06-04');
  });

  it('computes window mean', () => {
    const t = trendFor(days, 'rhrBpm');
    expect(t.mean).toBe(49); // (50+52+48+46)/4
  });

  it('computes prior mean from older half', () => {
    const t = trendFor(days, 'rhrBpm');
    expect(t.priorMean).toBe(51); // older half = [50,52]
  });

  it('returns nulls for a field with no data', () => {
    const t = trendFor(days, 'hrvMs');
    expect(t.latest).toBeNull();
    expect(t.mean).toBeNull();
    expect(t.series).toHaveLength(4);
  });
});
