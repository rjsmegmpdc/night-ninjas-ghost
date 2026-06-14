import { describe, it, expect } from 'vitest';
import {
  extractSleep,
  extractDailySummary,
  extractHrv,
  extractVo2max,
  extractWeight,
  snapshotToRow,
} from './mapper';

describe('extractSleep', () => {
  it('reads duration and overall score from dailySleepDTO', () => {
    const payload = {
      dailySleepDTO: {
        sleepTimeSeconds: 27360,
        sleepScores: { overall: { value: 82 } },
      },
    };
    expect(extractSleep(payload)).toEqual({ sleepDurationS: 27360, sleepScore: 82 });
  });

  it('tolerates missing payload', () => {
    expect(extractSleep(null)).toEqual({ sleepDurationS: null, sleepScore: null });
    expect(extractSleep({})).toEqual({ sleepDurationS: null, sleepScore: null });
  });

  it('tolerates flat DTO without wrapper', () => {
    expect(extractSleep({ sleepTimeSeconds: 25000 })).toEqual({
      sleepDurationS: 25000,
      sleepScore: null,
    });
  });
});

describe('extractDailySummary', () => {
  it('reads rhr, stress, body battery', () => {
    const payload = {
      restingHeartRate: 48,
      averageStressLevel: 27,
      bodyBatteryMostRecentValue: 61,
    };
    expect(extractDailySummary(payload)).toEqual({
      rhrBpm: 48,
      stressScore: 27,
      bodyBattery: 61,
    });
  });

  it('treats Garmin -1/-2 sentinels as null', () => {
    const payload = { restingHeartRate: 48, averageStressLevel: -1, bodyBatteryMostRecentValue: -2 };
    expect(extractDailySummary(payload)).toEqual({ rhrBpm: 48, stressScore: null, bodyBattery: null });
  });

  it('falls back to highest body battery when most-recent missing', () => {
    expect(extractDailySummary({ bodyBatteryHighestValue: 88 }).bodyBattery).toBe(88);
  });
});

describe('extractHrv', () => {
  it('prefers lastNightAvg', () => {
    expect(extractHrv({ hrvSummary: { lastNightAvg: 52, weeklyAvg: 49 } })).toEqual({ hrvMs: 52 });
  });
  it('falls back to weeklyAvg', () => {
    expect(extractHrv({ hrvSummary: { weeklyAvg: 49 } })).toEqual({ hrvMs: 49 });
  });
  it('null when absent', () => {
    expect(extractHrv(null)).toEqual({ hrvMs: null });
    expect(extractHrv({})).toEqual({ hrvMs: null });
  });
});

describe('extractVo2max', () => {
  it('reads precise value from maxmet array', () => {
    const payload = [{ generic: { vo2MaxPreciseValue: 53.4, vo2MaxValue: 53 } }];
    expect(extractVo2max(payload)).toEqual({ vo2maxDevice: 53.4 });
  });
  it('falls back to rounded value', () => {
    expect(extractVo2max([{ generic: { vo2MaxValue: 51 } }])).toEqual({ vo2maxDevice: 51 });
  });
  it('null for empty or non-array', () => {
    expect(extractVo2max([])).toEqual({ vo2maxDevice: null });
    expect(extractVo2max(undefined)).toEqual({ vo2maxDevice: null });
  });
});

describe('extractWeight', () => {
  it('converts grams to kg with 0.1 precision', () => {
    expect(extractWeight({ weight: 72450 })).toEqual({ weightKg: 72.5 });
  });
  it('reads totalAverage fallback', () => {
    expect(extractWeight({ totalAverage: { weight: 71000 } })).toEqual({ weightKg: 71 });
  });
  it('null for zero/absent', () => {
    expect(extractWeight({ weight: 0 })).toEqual({ weightKg: null });
    expect(extractWeight(null)).toEqual({ weightKg: null });
  });
});

describe('snapshotToRow', () => {
  it('maps a full snapshot to a garmin-source row', () => {
    const row = snapshotToRow({
      date: '2026-06-11',
      rhrBpm: 48,
      hrvMs: 52,
      sleepDurationS: 27360,
      sleepScore: 82,
      stressScore: 27,
      bodyBattery: 61,
      vo2maxDevice: 53.4,
      weightKg: 72.5,
      raw: { note: 'x' },
    });
    expect(row.source).toBe('garmin');
    expect(row.date).toBe('2026-06-11');
    expect(row.rhrBpm).toBe(48);
    expect(row.vo2maxDevice).toBe(53.4);
    expect(JSON.parse(row.raw as string)).toEqual({ note: 'x' });
  });
});
