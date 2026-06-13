/**
 * Garmin integration types (Phase 12).
 *
 * GarminDailySnapshot is the normalized shape one day of Garmin wellness
 * data is reduced to before mapping into the daily_health_metrics table.
 * Every field nullable - devices and account settings vary.
 */

export interface GarminDailySnapshot {
  /** ISO date 'YYYY-MM-DD' (local) */
  date: string;
  rhrBpm: number | null;
  /** Overnight avg HRV (rMSSD), ms */
  hrvMs: number | null;
  sleepDurationS: number | null;
  /** Garmin sleep score 0-100 */
  sleepScore: number | null;
  /** Garmin avg daily stress 0-100 (-1/-2 sentinel = no data) */
  stressScore: number | null;
  /** Most recent body battery 0-100 */
  bodyBattery: number | null;
  /** Device VO2 max estimate, ml/kg/min */
  vo2maxDevice: number | null;
  weightKg: number | null;
  /** Raw vendor payloads kept for fields we don't model yet */
  raw: Record<string, unknown>;
}

/**
 * Auth flow result - the two-flow state machine.
 *
 * Flow 1 (no MFA): connect() -> { status: 'connected' }
 * Flow 2 (MFA):    connect() -> { status: 'mfa-required', mfaSessionId }
 *                  then submitMfa(mfaSessionId, code) -> { status: 'connected' }
 */
export type GarminConnectResult =
  | { status: 'connected'; displayName: string | null }
  | { status: 'mfa-required'; mfaSessionId: string }
  | { status: 'error'; error: string };
