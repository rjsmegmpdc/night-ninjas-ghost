/**
 * Settings keys used across the app.
 * Lives outside any 'use server' file so server actions can stay strict
 * (only async functions exported) while components can still reference keys.
 */
export const SETTINGS_KEYS = {
  CAPACITY_WEEKLY: "capacity.weekly_cap_km",
  CAPACITY_LONG: "capacity.long_run_cap_km",
  /**
   * When true, only Run / TrailRun / VirtualRun count toward the streak.
   * When false (default), any sport_type counts — gym, cycling, swim,
   * walk, etc. The brief calls this "any exercise" mode.
   */
  STREAK_RUN_EVERYDAY: "streak.run_everyday",
} as const;
