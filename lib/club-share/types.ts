/**
 * Club schedule share - JSON contract.
 *
 * This is the data shape that VELOCITY writes to disk for the athlete to
 * upload manually to their club app. The shape is deliberately minimal
 * and consumer-friendly: flat structure, ISO dates, no nested complexity.
 *
 * Per the design decisions locked in earlier turns:
 *   - No pace targets (leaks current fitness)
 *   - No HR zones
 *   - No athlete state (CTL/ATL/TSB)
 *   - No personal records
 *   - Completed sessions stripped before output
 *   - Window includes "current week + next week" by default
 *   - Athlete can override window per generation
 *
 * Versioning: the `version` field exists so future schema changes can be
 * detected by consumers. Bump it when fields are added or removed in
 * non-backward-compatible ways.
 */

export const SCHEDULE_SCHEMA_VERSION = '1.0';

export type ClubWindowOption = '1w' | '2w' | '4w' | 'next-race' | 'program-end';

/**
 * Session-type taxonomy exposed in the JSON. This is a subset of the
 * internal SessionType enum, mapped to plain-language values consumers
 * can show without needing to translate.
 *
 * "interval" and "repetition" are both surfaced as "intervals" externally
 * since the distinction (VO2max vs neuromuscular) is internal coaching
 * detail not useful to a general audience.
 */
export type SharedSessionType =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'intervals'
  | 'recovery'
  | 'cross'
  | 'strength'
  | 'rest';

/**
 * One published session. Distances are km; durations are minutes.
 * Notes are generic descriptions only - no pace targets, no HR zones,
 * no fitness-revealing content.
 */
export interface SharedSession {
  /** ISO date 'YYYY-MM-DD' */
  date: string;
  /** Three-letter day-of-week, capitalised. Mon, Tue, ..., Sun. */
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  type: SharedSessionType;
  /** Target distance in km. Undefined for cross/strength/rest. */
  distance_km?: number;
  /** Target duration in minutes. Used for cross/strength. */
  duration_min?: number;
  /** Generic descriptive label. Stripped of pace targets. */
  notes?: string;
}

/**
 * Window metadata. The consumer can show 'stale_after_iso' to indicate
 * when the schedule should be refreshed.
 */
export interface SharedWindow {
  /** Window start (Mon of first week, ISO date) */
  start_iso: string;
  /** Window end (Sun of last week, ISO date) */
  end_iso: string;
  /** Window length category, matches the athlete's selection */
  option: ClubWindowOption;
  /** Number of weeks in the window */
  weeks: number;
  /** ISO date after which this share is considered stale */
  stale_after_iso: string;
  /** Optional reason the athlete extended beyond default */
  extension_reason?: string;
}

/**
 * The complete share payload written to disk.
 */
export interface ClubSchedulePayload {
  /** Schema version - bump on breaking changes */
  version: typeof SCHEDULE_SCHEMA_VERSION;
  /** parkrun ID that identifies this athlete in the club app */
  parkrun_id: string;
  /** ISO timestamp this file was generated */
  generated_at: string;
  /** Window metadata */
  window: SharedWindow;
  /** Pending sessions in date order. Completed sessions are stripped. */
  schedule: SharedSession[];
  // SHA-256 hex of user's schedule password. Verified client-side by the club site.
  password_hash?: string;
}
