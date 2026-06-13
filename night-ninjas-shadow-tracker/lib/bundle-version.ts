import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Bundle version metadata read from `bundle-version.json` at the project
 * root. The file is generated when the bundle is built — see how it's
 * created in the build pipeline (Python script in the development
 * environment).
 *
 * Format:
 *   {
 *     "builtAt": "2026-05-03T14:39:00Z",  // ISO 8601 UTC
 *     "hash": "a3f2b91",                   // first 7 chars of manifest SHA-256
 *     "fileCount": 170                     // number of files in the bundle
 *   }
 *
 * The hash is deterministic per bundle content — changes whenever any
 * file in the bundle changes. Two bundles with the same hash are
 * structurally identical even if their timestamps differ.
 *
 * Cached at module load — the file is static during the process's
 * lifetime, no need to re-read on every request.
 */

export interface BundleVersion {
  /** ISO 8601 UTC timestamp the bundle was built. */
  builtAt: string;
  /** First 7 characters of the manifest SHA-256. Identifies bundle content. */
  hash: string;
  /** Number of files in the bundle. */
  fileCount: number;
}

let cached: BundleVersion | null = null;

export function getBundleVersion(): BundleVersion {
  if (cached) return cached;

  try {
    const filePath = path.join(process.cwd(), 'bundle-version.json');
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as BundleVersion;
    cached = parsed;
    return parsed;
  } catch {
    // Fallback when bundle-version.json is missing — typically during
    // local dev when the project hasn't been bundled yet, or if the
    // file got deleted. Surface a clearly fake version so it's obvious.
    return { builtAt: '1970-01-01T00:00:00Z', hash: 'unknown', fileCount: 0 };
  }
}

/**
 * Format the bundle version for human display.
 *   "2026-05-03 14:39 - a3f2b91"
 *
 * Designed to fit in a small footer chip — short enough to read at a
 * glance, distinctive enough to identify which bundle is running.
 */
export function formatBundleVersion(v: BundleVersion): string {
  if (v.hash === 'unknown') return 'dev (no bundle metadata)';
  // Convert ISO timestamp to "YYYY-MM-DD HH:MM" UTC for compact display
  const d = new Date(v.builtAt);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}Z - ${v.hash}`;
}
