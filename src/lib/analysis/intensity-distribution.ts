/** Intensity zone distribution for a training week. */
export interface IntensityDistribution {
  /** Total running minutes in the week */
  totalRunMin: number;
  /** Percentage of time in easy/aerobic zones (0-100) */
  easyPct: number;
  /** Percentage of time in the grey/moderate zone (0-100) */
  greyPct: number;
  /** Percentage of time in hard/quality zones (0-100) */
  hardPct: number;
  /** True when the distribution meets the polarised 80/20 definition */
  isPolarised: boolean;
}
