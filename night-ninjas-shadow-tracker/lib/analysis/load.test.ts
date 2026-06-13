import { describe, expect, it } from 'vitest';
import { computeActivityLoad, POINTS_PER_MIN } from './load';
import type { Activity } from '@/lib/db/schema';

/**
 * Test fixture builder. Most fields irrelevant for load computation;
 * we only need the subset Pick'd by computeActivityLoad.
 */
function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    source: 'strava',
    sourceId: '1',
    name: 'Test',
    type: 'Run',
    sportType: 'Run',
    startDateUtc: '2026-05-02T08:00:00Z',
    startDateLocal: '2026-05-02T20:00:00',
    distanceM: 10000,
    movingTimeS: 3600,
    elapsedTimeS: 3600,
    elevationGainM: null,
    avgSpeedMs: 2.78,
    maxSpeedMs: null,
    avgHr: null,
    maxHr: null,
    avgCadence: null,
    sufferScore: null,
    kudos: null,
    gearId: null,
    gearName: null,
    rawJson: null,
    createdAt: new Date('2026-05-02T08:30:00Z'),
    updatedAt: new Date('2026-05-02T08:30:00Z'),
    ...overrides,
  } as Activity;
}

describe('computeActivityLoad', () => {
  describe('returns null for activities with no useful duration', () => {
    it('null movingTimeS', () => {
      expect(computeActivityLoad(activity({ movingTimeS: null }))).toBeNull();
    });

    it('zero movingTimeS', () => {
      expect(computeActivityLoad(activity({ movingTimeS: 0 }))).toBeNull();
    });
  });

  describe('Tier 1 — calibrated HR-reserve', () => {
    const calibration = { maxHr: 185, restingHr: 50 };

    it('classifies easy when HR-reserve below 70%', () => {
      // HR 130 → reserve = (130-50)/(185-50) = 80/135 ≈ 0.59 → easy
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 130 }),
        calibration
      );
      expect(result?.zone).toBe('easy');
      expect(result?.confidence).toBe('calibrated');
    });

    it('classifies marathon between 70-82%', () => {
      // HR 153 → (153-50)/(185-50) = 103/135 ≈ 0.76 → marathon
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 153 }),
        calibration
      );
      expect(result?.zone).toBe('marathon');
    });

    it('classifies threshold between 82-88%', () => {
      // HR 165 → (165-50)/(185-50) = 115/135 ≈ 0.85 → threshold
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 165 }),
        calibration
      );
      expect(result?.zone).toBe('threshold');
    });

    it('classifies interval between 88-95%', () => {
      // HR 175 → (175-50)/(185-50) ≈ 0.93 → interval
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 175 }),
        calibration
      );
      expect(result?.zone).toBe('interval');
    });

    it('classifies repetition above 95%', () => {
      // HR 182 → (182-50)/(185-50) ≈ 0.978 → repetition
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 182 }),
        calibration
      );
      expect(result?.zone).toBe('repetition');
    });
  });

  describe('Tier 2 — age-predicted max HR', () => {
    it('uses age-predicted max when no measured max provided', () => {
      // Age 38 → predicted max HR = 220-38 = 182
      // HR 145 → (145-50)/(182-50) = 95/132 ≈ 0.72 → marathon
      const result = computeActivityLoad(
        activity({ movingTimeS: 3600, avgHr: 145 }),
        { age: 38 }
      );
      expect(result?.zone).toBe('marathon');
      expect(result?.confidence).toBe('estimated');
    });
  });

  describe('Tier 3 — pace classification (runs only)', () => {
    it('classifies threshold pace correctly', () => {
      // Threshold = 240 spk (4:00/km). Activity at 240 spk → threshold zone
      // Activity speed 1000/240 ≈ 4.17 m/s
      const result = computeActivityLoad(
        activity({
          sportType: 'Run',
          movingTimeS: 1800,
          avgSpeedMs: 1000 / 240,
          avgHr: null,
        }),
        { thresholdPaceSpk: 240 }
      );
      expect(result?.zone).toBe('threshold');
      expect(result?.confidence).toBe('pace-only');
    });

    it('classifies easy pace as easy', () => {
      // Threshold 240. Activity at 290 spk = 50 sec slower → easy zone
      const result = computeActivityLoad(
        activity({
          sportType: 'Run',
          movingTimeS: 3600,
          avgSpeedMs: 1000 / 290,
          avgHr: null,
        }),
        { thresholdPaceSpk: 240 }
      );
      expect(result?.zone).toBe('easy');
    });

    it('classifies fast pace as interval', () => {
      // Threshold 240. Activity at 220 spk = 20 sec faster → interval (delta -20, between -22 and -8)
      const result = computeActivityLoad(
        activity({
          sportType: 'Run',
          movingTimeS: 1200,
          avgSpeedMs: 1000 / 220,
          avgHr: null,
        }),
        { thresholdPaceSpk: 240 }
      );
      expect(result?.zone).toBe('interval');
    });

    it('falls back to easy for non-run pace classification', () => {
      // Even with pace data, a Ride won't be pace-classified
      const result = computeActivityLoad(
        activity({
          sportType: 'Ride',
          type: 'Ride',
          movingTimeS: 3600,
          avgSpeedMs: 8.3, // ~30 km/h
          avgHr: null,
        }),
        { thresholdPaceSpk: 240 }
      );
      expect(result?.zone).toBe('easy');
      expect(result?.confidence).toBe('estimated');
    });
  });

  describe('fallback — no calibration, no HR, no pace', () => {
    it('assumes easy intensity', () => {
      const result = computeActivityLoad(
        activity({ sportType: 'Run', movingTimeS: 3600, avgHr: null }),
        {}
      );
      expect(result?.zone).toBe('easy');
      expect(result?.confidence).toBe('estimated');
    });
  });

  describe('sport baseline application', () => {
    const calibration = { maxHr: 185, restingHr: 50 };
    // HR 130 → easy zone for all
    const easyHr = 130;

    it('Run gets 1.0 baseline', () => {
      const result = computeActivityLoad(
        activity({ sportType: 'Run', movingTimeS: 3600, avgHr: easyHr }),
        calibration
      );
      // 60 min × 1.0 baseline × 0.20 easy = 12.0
      expect(result?.points).toBeCloseTo(12, 1);
      expect(result?.sportBaseline).toBe(1.0);
    });

    it('Ride gets 0.65 baseline (lower stress per minute)', () => {
      const result = computeActivityLoad(
        activity({
          sportType: 'Ride',
          type: 'Ride',
          movingTimeS: 3600,
          avgHr: easyHr,
        }),
        calibration
      );
      // 60 min × 0.65 × 0.20 = 7.8
      expect(result?.points).toBeCloseTo(7.8, 1);
      expect(result?.sportBaseline).toBe(0.65);
    });

    it('Yoga gets 0.30 baseline (recovery-adjacent)', () => {
      const result = computeActivityLoad(
        activity({
          sportType: 'Yoga',
          type: 'Yoga',
          movingTimeS: 1800,
          avgHr: easyHr,
        }),
        calibration
      );
      // 30 min × 0.30 × 0.20 = 1.8
      expect(result?.points).toBeCloseTo(1.8, 1);
    });

    it('Pilates recognised from activity name when sport_type is generic', () => {
      const result = computeActivityLoad(
        activity({
          sportType: 'Workout',
          type: 'Workout',
          name: 'Morning Pilates',
          movingTimeS: 1800,
          avgHr: easyHr,
        }),
        calibration
      );
      expect(result?.category).toBe('pilates');
      expect(result?.sportBaseline).toBe(0.35);
    });
  });

  describe('worked example from coach review', () => {
    it('matches the doc: 90min run @ marathon HR = ~36 points', () => {
      // 90 min, max 185, resting 50, avg 153 → reserve ≈ 0.76 → marathon zone
      const result = computeActivityLoad(
        activity({ sportType: 'Run', movingTimeS: 5400, avgHr: 153 }),
        { maxHr: 185, restingHr: 50 }
      );
      // 90 × 1.0 × 0.40 = 36
      expect(result?.points).toBeCloseTo(36, 0);
      expect(result?.zone).toBe('marathon');
    });

    it('matches the doc: 60min ride @ marathon HR = ~15.6 points', () => {
      // 60 min, ride baseline 0.65, marathon zone 0.40
      const result = computeActivityLoad(
        activity({
          sportType: 'Ride',
          type: 'Ride',
          movingTimeS: 3600,
          avgHr: 145,
        }),
        { maxHr: 185, restingHr: 50 }
      );
      // 60 × 0.65 × 0.40 = 15.6
      expect(result?.points).toBeCloseTo(15.6, 1);
    });
  });

  describe('points-per-minute table is internally consistent', () => {
    it('repetition > interval > threshold > marathon > easy', () => {
      expect(POINTS_PER_MIN.repetition).toBeGreaterThan(POINTS_PER_MIN.interval);
      expect(POINTS_PER_MIN.interval).toBeGreaterThan(POINTS_PER_MIN.threshold);
      expect(POINTS_PER_MIN.threshold).toBeGreaterThan(POINTS_PER_MIN.marathon);
      expect(POINTS_PER_MIN.marathon).toBeGreaterThan(POINTS_PER_MIN.easy);
    });
  });
});
