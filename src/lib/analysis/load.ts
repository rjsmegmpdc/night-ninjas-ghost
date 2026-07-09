import type { Activity } from '@/lib/db/types';
import { classifySport, isRunning, type SportCategory } from './sport-classifier';

const SPORT_BASELINE: Record<SportCategory, number> = {
  run: 1.0,
  'trail-run': 1.05,
  'virtual-run': 1.0,
  ride: 0.65,
  'virtual-ride': 0.65,
  mtb: 0.75,
  swim: 0.85,
  walk: 0.45,
  hike: 0.45,
  weights: 0.55,
  workout: 0.55,
  crossfit: 0.7,
  yoga: 0.3,
  pilates: 0.35,
  mobility: 0.25,
  other: 0.5,
};

export type IntensityZone = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';

export const POINTS_PER_MIN: Record<IntensityZone, number> = {
  easy: 0.2,
  marathon: 0.4,
  threshold: 0.6,
  interval: 1.0,
  repetition: 1.5,
};

const HR_RESERVE_BOUNDS: Array<[IntensityZone, number]> = [
  ['easy', 0.7],
  ['marathon', 0.82],
  ['threshold', 0.88],
  ['interval', 0.95],
  ['repetition', 1.0],
];

export interface AthleteCalibration {
  maxHr?: number;
  restingHr?: number;
  thresholdPaceSpk?: number;
  age?: number;
}

export type LoadConfidence = 'calibrated' | 'pace-only' | 'estimated';

export interface ActivityLoad {
  points: number;
  zone: IntensityZone;
  sportBaseline: number;
  confidence: LoadConfidence;
  category: SportCategory;
}

export function computeActivityLoad(
  activity: Pick<Activity, 'sportType' | 'type' | 'name' | 'movingTimeS' | 'avgHr' | 'avgSpeedMs'>,
  calibration: AthleteCalibration = {}
): ActivityLoad | null {
  const durationMin =
    activity.movingTimeS != null && activity.movingTimeS > 0
      ? activity.movingTimeS / 60
      : null;

  if (!durationMin) return null;

  const category = classifySport(activity.sportType ?? activity.type ?? null, activity.name);
  const sportBaseline = SPORT_BASELINE[category];
  const { zone, confidence } = classifyIntensity(activity, calibration, category);
  const points = durationMin * sportBaseline * POINTS_PER_MIN[zone];

  return { points: round1(points), zone, sportBaseline, confidence, category };
}

function classifyIntensity(
  activity: Pick<Activity, 'avgHr' | 'avgSpeedMs'>,
  calibration: AthleteCalibration,
  category: SportCategory
): { zone: IntensityZone; confidence: LoadConfidence } {
  const avgHr = activity.avgHr;

  if (avgHr && calibration.maxHr) {
    const restingHr = calibration.restingHr ?? 50;
    const reserve = (avgHr - restingHr) / (calibration.maxHr - restingHr);
    return { zone: zoneFromHrReserve(reserve), confidence: 'calibrated' };
  }

  if (avgHr && calibration.age) {
    const ageMaxHr = 220 - calibration.age;
    const restingHr = calibration.restingHr ?? 50;
    const reserve = (avgHr - restingHr) / (ageMaxHr - restingHr);
    return { zone: zoneFromHrReserve(reserve), confidence: 'estimated' };
  }

  if (isRunning(category) && activity.avgSpeedMs && activity.avgSpeedMs > 0 && calibration.thresholdPaceSpk) {
    const paceSpk = 1000 / activity.avgSpeedMs;
    return { zone: zoneFromPace(paceSpk, calibration.thresholdPaceSpk), confidence: 'pace-only' };
  }

  return { zone: 'easy', confidence: 'estimated' };
}

function zoneFromHrReserve(reserve: number): IntensityZone {
  const clamped = Math.max(0, Math.min(1, reserve));
  for (const [zone, upperBound] of HR_RESERVE_BOUNDS) {
    if (clamped < upperBound) return zone;
  }
  return 'repetition';
}

function zoneFromPace(paceSpk: number, thresholdSpk: number): IntensityZone {
  const delta = paceSpk - thresholdSpk;
  if (delta <= -22) return 'repetition';
  if (delta <= -8) return 'interval';
  if (delta <= 5) return 'threshold';
  if (delta <= 18) return 'marathon';
  return 'easy';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
