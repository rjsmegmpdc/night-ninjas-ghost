/**
 * Plain TypeScript types that mirror the GHOST SQLite schema.
 *
 * The previous schema.ts used drizzle-orm $inferSelect / $inferInsert to
 * derive these. drizzle-orm has been removed (it was a VELOCITY server
 * dependency that was never used at runtime in GHOST). These hand-written
 * interfaces are the canonical shapes used by the analysis engines and
 * route components.
 */

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export interface Activity {
  id: number;
  source: 'strava' | 'garmin' | 'coros' | 'apple' | 'manual';
  sourceId: string;
  name: string | null;
  type: string;
  sportType: string | null;
  startDateUtc: string;
  startDateLocal: string;
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  elevationGainM: number | null;
  avgSpeedMs: number | null;
  maxSpeedMs: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  sufferScore: number | null;
  kudos: number | null;
  gearId: string | null;
  gearName: string | null;
  rawJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewActivity = Omit<Activity, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

// ---------------------------------------------------------------------------
// Daily health metrics
// ---------------------------------------------------------------------------

export interface DailyHealthMetric {
  id: number;
  date: string;
  source: string;
  rhrBpm: number | null;
  hrvMs: number | null;
  sleepDurationS: number | null;
  sleepScore: number | null;
  stressScore: number | null;
  bodyBattery: number | null;
  vo2maxDevice: number | null;
  weightKg: number | null;
  raw: string | null;
  syncedAt: string;
}

export type NewDailyHealthMetric = Omit<DailyHealthMetric, 'id' | 'syncedAt'> & {
  id?: number;
  syncedAt?: string;
};
