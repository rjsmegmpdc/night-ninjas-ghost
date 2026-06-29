/**
 * weekly-report-display-pure.ts — Display helpers for the WeeklyReport hero card.
 *
 * Pure module: no DB, no Next.js, no React. Safe to unit-test with Vitest.
 *
 * All date formatting uses UTC arithmetic (getUTCDate, getUTCMonth, etc.) to
 * avoid timezone-local midnight shifts — the same rule as the rest of the
 * analysis layer.
 */

import type { WeeklyReport } from '@/lib/analysis/weekly-report-pure';

/* -------------------------------------------------------------------------- */
/* Date formatting                                                             */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_NAMES_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * Format an ISO date to "23 Jun" style using UTC components.
 */
export function formatUtcShort(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/**
 * Format an ISO date to "Monday 30 Jun" style using UTC components.
 */
export function formatUtcLong(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const jsDow = d.getUTCDay();          // Sun=0..Sat=6
  const dow = (jsDow + 6) % 7;         // Mon=0..Sun=6
  return `${DAY_NAMES_LONG[dow]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/**
 * Format a "Week of 23 Jun – 29 Jun" range string from weekStart/weekEnd.
 */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `Week of ${formatUtcShort(weekStart)} – ${formatUtcShort(weekEnd)}`;
}

/**
 * Format the "Next report: Monday 30 Jun" footer line.
 */
export function formatNextReport(nextReportDate: string): string {
  return `Next report: ${formatUtcLong(nextReportDate)}`;
}

/**
 * Format a generatedAt ISO timestamp to a human-readable label.
 * Uses relative time for recent (< 7 days), then absolute date.
 *
 * @param generatedAt  - ISO timestamp string (from WeeklyReport.generatedAt)
 * @param now          - Reference Date (defaults to new Date() — override in tests)
 */
export function formatGeneratedAt(generatedAt: string, now: Date = new Date()): string {
  const genMs = new Date(generatedAt).getTime();
  const diffMs = now.getTime() - genMs;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  // Fall back to absolute
  const d = new Date(generatedAt);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* Day label helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns a 3-character day abbreviation (Mon..Sun) from an ISO date string,
 * using UTC day-of-week arithmetic.
 */
export function dayAbbrevFromIso(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const jsDow = d.getUTCDay();   // Sun=0..Sat=6
  const dow = (jsDow + 6) % 7;  // Mon=0..Sun=6
  return DAY_NAMES_SHORT[dow];
}

/* -------------------------------------------------------------------------- */
/* Compliance colour tokens                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns a Tailwind text colour class for the overall compliance verdict.
 *
 *   green  → #22C55E  (text-green-500 in Tailwind default palette)
 *   amber  → #F59E0B  (text-amber-500)
 *   red    → #EF4444  (text-red-500)
 */
export function complianceTextClass(
  compliance: WeeklyReport['overallCompliance'],
): string {
  switch (compliance) {
    case 'green': return 'text-green-500';
    case 'amber': return 'text-amber-500';
    case 'red':   return 'text-red-500';
  }
}

/**
 * Returns a Tailwind border colour class for the hero card border accent.
 */
export function complianceBorderClass(
  compliance: WeeklyReport['overallCompliance'],
): string {
  switch (compliance) {
    case 'green': return 'border-green-500/40';
    case 'amber': return 'border-amber-500/40';
    case 'red':   return 'border-red-500/40';
  }
}

/**
 * Returns a human-readable compliance label.
 */
export function complianceLabel(
  compliance: WeeklyReport['overallCompliance'],
): string {
  switch (compliance) {
    case 'green': return 'On track';
    case 'amber': return 'Partial';
    case 'red':   return 'Off track';
  }
}

/* -------------------------------------------------------------------------- */
/* Volume formatting                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Format volume as "42.0 km / 50.0 km target".
 * When volumeTargetKm is 0, omits the target portion.
 */
export function formatVolume(volumeKm: number, volumeTargetKm: number): string {
  const actual = `${volumeKm.toFixed(1)} km`;
  if (volumeTargetKm <= 0) return actual;
  return `${actual} / ${volumeTargetKm.toFixed(1)} km target`;
}

/* -------------------------------------------------------------------------- */
/* Day status display                                                          */
/* -------------------------------------------------------------------------- */

import type { DayReport } from '@/lib/analysis/weekly-report-pure';

/**
 * Returns a Tailwind text colour class for a day row status indicator.
 */
export function dayStatusClass(status: DayReport['status']): string {
  switch (status) {
    case 'compliant': return 'text-green-500';
    case 'partial':   return 'text-amber-500';
    case 'missed':    return 'text-red-500';
    case 'rest':      return 'text-bone-mute';
  }
}

/**
 * Returns a single Unicode character that represents the day status.
 * Kept minimal — a colour dot is redundant when we already have colour text;
 * these are used as aria-hidden status indicators alongside colour.
 */
export function dayStatusSymbol(status: DayReport['status']): string {
  switch (status) {
    case 'compliant': return '✓';
    case 'partial':   return '~';
    case 'missed':    return '✗';
    case 'rest':      return '—';
  }
}
