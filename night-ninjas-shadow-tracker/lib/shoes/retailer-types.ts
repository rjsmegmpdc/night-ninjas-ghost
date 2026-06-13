/**
 * Retailer types + pure helpers — safe for both server and client.
 *
 * Lives separately from retailers.ts (which is server-only because it
 * reads the CSV from disk via node:fs). This split lets client components
 * like shoe-nudge.tsx import the type and URL builder without dragging
 * the filesystem code into the browser bundle.
 *
 * Same pattern as lib/constants/settings-keys.ts — keep purely declarative
 * pieces in their own file so the boundary between server and client
 * stays clean.
 */

export interface Retailer {
  /** Display name shown in retailer search rows. */
  name: string;
  /** URL template with a `{query}` placeholder for brand+model. */
  urlTemplate: string;
  /** 'NZ' | 'AU' | 'International' — used for grouping in UI. */
  region: string;
}

/** Build a search URL for a retailer + brand+model query. Pure string substitution. */
export function buildSearchUrl(
  retailer: Retailer,
  brand: string | null,
  model: string | null
): string {
  const query = encodeURIComponent([brand, model].filter(Boolean).join(' '));
  return retailer.urlTemplate.replace('{query}', query);
}
