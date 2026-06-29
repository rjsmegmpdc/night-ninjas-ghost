/**
 * Phase 6 part 2 - race-debrief parsing helpers (PURE).
 * No DB, no I/O - so the finish-time parser can be unit-tested directly.
 */

/** Parse "H:MM:SS" or "MM:SS" into total seconds; null when malformed. */
export function parseHmsToSeconds(raw: string): number | null {
  const parts = raw.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => (p === '' ? NaN : Number(p)));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n))) return null;
  const [h, m, s] = parts.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}
