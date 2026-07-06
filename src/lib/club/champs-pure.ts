/**
 * Ninja Champs — pure scoring logic.
 *
 * Annual event at the Millwater Half Marathon. Each athlete's baseline is a
 * Riegel-predicted half time from the BEST of their 5k/10k/21.1k PBs over
 * the rolling 12 months before race day. Improvement = baseline / actual —
 * greater than 1.0 means they beat their own predicted best. Rank descending.
 *
 * No browser APIs — safe for Vitest node env.
 */

export const HALF_MARATHON_KM = 21.0975;

/** Riegel fatigue exponent — the standard 1.06. */
const RIEGEL_EXPONENT = 1.06;

export interface ChampsEntry {
  id: number;
  name: string;
  sex: 'M' | 'F';
  /** Year of birth — age group derived against the event year. */
  yob: number | null;
  /** Rolling-12-month PBs, seconds. At least one required for a baseline. */
  pb5kS: number | null;
  pb10kS: number | null;
  pb21kS: number | null;
  /** Millwater finish time, seconds. Null until the athlete finishes. */
  actualS: number | null;
}

export interface ChampsRanked extends ChampsEntry {
  /** Riegel-predicted half time from the best PB, seconds. Null if no PBs. */
  baselineS: number | null;
  /** Which PB produced the baseline: '5k' | '10k' | '21.1k' */
  baselineSource: string | null;
  /** baseline / actual. Null until both exist. */
  improvement: number | null;
  /** 1-based rank among entries with an improvement; null otherwise. */
  rank: number | null;
}

/** Predict a half-marathon time from a PB at another distance (Riegel). */
export function riegelPredictHalfS(pbS: number, distanceKm: number): number {
  return pbS * Math.pow(HALF_MARATHON_KM / distanceKm, RIEGEL_EXPONENT);
}

/**
 * Baseline = the FASTEST Riegel-predicted half across the provided PBs —
 * the athlete's best demonstrated fitness sets the target.
 */
export function computeBaseline(entry: {
  pb5kS: number | null;
  pb10kS: number | null;
  pb21kS: number | null;
}): { baselineS: number; source: string } | null {
  const candidates: { predicted: number; source: string }[] = [];
  if (entry.pb5kS)  candidates.push({ predicted: riegelPredictHalfS(entry.pb5kS, 5),   source: '5k' });
  if (entry.pb10kS) candidates.push({ predicted: riegelPredictHalfS(entry.pb10kS, 10), source: '10k' });
  if (entry.pb21kS) candidates.push({ predicted: entry.pb21kS,                          source: '21.1k' });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.predicted - b.predicted);
  return { baselineS: Math.round(candidates[0].predicted), source: candidates[0].source };
}

/**
 * Rank all entries by improvement, descending. Entries without a baseline or
 * an actual time are carried through unranked (rank/improvement null) so the
 * live table can still show who is registered and who has finished.
 */
export function rankChamps(entries: ChampsEntry[]): ChampsRanked[] {
  const enriched = entries.map((e): ChampsRanked => {
    const baseline = computeBaseline(e);
    const improvement =
      baseline && e.actualS && e.actualS > 0 ? baseline.baselineS / e.actualS : null;
    return {
      ...e,
      baselineS: baseline?.baselineS ?? null,
      baselineSource: baseline?.source ?? null,
      improvement,
      rank: null,
    };
  });

  const ranked = enriched
    .filter((e) => e.improvement !== null)
    .sort((a, b) => b.improvement! - a.improvement!);
  ranked.forEach((e, i) => { e.rank = i + 1; });

  // Ranked first (by rank), then finished-but-unrankable, then registered
  return [
    ...ranked,
    ...enriched.filter((e) => e.improvement === null && e.actualS !== null),
    ...enriched.filter((e) => e.improvement === null && e.actualS === null),
  ];
}

// ---------------------------------------------------------------------------
// Age groups
// ---------------------------------------------------------------------------

export const AGE_GROUPS = ['U20', '20-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60+'] as const;
export type AgeGroup = typeof AGE_GROUPS[number];

export function ageGroupFor(yob: number | null, eventYear: number): AgeGroup | null {
  if (!yob) return null;
  const age = eventYear - yob;
  if (age < 0 || age > 120) return null;
  if (age < 20) return 'U20';
  if (age <= 34) return '20-34';
  if (age <= 39) return '35-39';
  if (age <= 44) return '40-44';
  if (age <= 49) return '45-49';
  if (age <= 54) return '50-54';
  if (age <= 59) return '55-59';
  return '60+';
}

// ---------------------------------------------------------------------------
// Time parsing / formatting (h:mm:ss or mm:ss)
// ---------------------------------------------------------------------------

export function parseTimeS(input: string): number | null {
  const parts = input.trim().split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const total = parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
  if (parts.length === 3 && (nums[1] > 59 || nums[2] > 59)) return null;
  if (parts.length === 2 && nums[1] > 59) return null;
  return total > 0 ? total : null;
}

export function formatTimeS(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = Math.round(totalS % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
