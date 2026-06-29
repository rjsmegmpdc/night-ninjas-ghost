/**
 * Phase 14 — capacity resolution (PURE).
 *
 * Resolves the effective weekly volume cap and long-run cap from a three-tier
 * priority chain:
 *   1. Per-block (plan_periods row) — explicitly set for this training cycle
 *   2. Global settings — athlete's cross-block default
 *   3. Engine default — dojo-specific fallback (handled by the engines themselves)
 *
 * No DB, no I/O. Pure function, unit-tested.
 */

export interface CapacityInputs {
  /** From plan_periods.weekly_volume_cap_km. null = not set for this block. */
  periodWeeklyCap: number | null;
  /** From settings table CAPACITY_WEEKLY. null = not set globally. */
  settingsWeeklyCap: number | null;
  /** From plan_periods.long_run_cap_km. null = not set for this block. */
  periodLongRunCap: number | null;
  /** From settings table CAPACITY_LONG. null = not set globally. */
  settingsLongRunCap: number | null;
}

export interface CapacityResult {
  /** Resolved weekly cap, or undefined to let the engine use its own default. */
  weeklyVolumeCapKm: number | undefined;
  /** Resolved long-run cap, or undefined to let the engine use its own default. */
  longRunCapKm: number | undefined;
  /** Which tier resolved each cap, for display in the UI. */
  weeklyCapSource: 'block' | 'global' | 'engine-default';
  longRunCapSource: 'block' | 'global' | 'engine-default';
}

export function resolveCapacity(i: CapacityInputs): CapacityResult {
  let weeklyVolumeCapKm: number | undefined;
  let weeklyCapSource: CapacityResult['weeklyCapSource'];

  if (i.periodWeeklyCap !== null) {
    weeklyVolumeCapKm = i.periodWeeklyCap;
    weeklyCapSource = 'block';
  } else if (i.settingsWeeklyCap !== null) {
    weeklyVolumeCapKm = i.settingsWeeklyCap;
    weeklyCapSource = 'global';
  } else {
    weeklyVolumeCapKm = undefined;
    weeklyCapSource = 'engine-default';
  }

  let longRunCapKm: number | undefined;
  let longRunCapSource: CapacityResult['longRunCapSource'];

  if (i.periodLongRunCap !== null) {
    longRunCapKm = i.periodLongRunCap;
    longRunCapSource = 'block';
  } else if (i.settingsLongRunCap !== null) {
    longRunCapKm = i.settingsLongRunCap;
    longRunCapSource = 'global';
  } else {
    longRunCapKm = undefined;
    longRunCapSource = 'engine-default';
  }

  return { weeklyVolumeCapKm, weeklyCapSource, longRunCapKm, longRunCapSource };
}
