/**
 * Club course leaderboards — pure filter + ranking logic.
 * Strava-style: window (rolling 12mo / calendar year / all time), age group,
 * sex, and a "legend" mode ranking by effort count instead of speed.
 *
 * No browser APIs — safe for Vitest node env.
 */

import { ageGroupFor, type AgeGroup } from './champs-pure';

export type WindowFilter = 'rolling-12mo' | 'calendar-year' | 'all-time';
export type SexFilter = 'all' | 'M' | 'F';

export interface CourseResult {
  id: number;
  memberId: number;
  name: string;
  sex: 'M' | 'F';
  yob: number | null;
  /** ISO date of the effort */
  date: string;
  timeS: number;
}

export interface LeaderboardFilters {
  window: WindowFilter;
  sex: SexFilter;
  ageGroup: AgeGroup | 'all';
  legend: boolean;
}

export interface LeaderboardRow {
  rank: number;
  memberId: number;
  name: string;
  sex: 'M' | 'F';
  ageGroup: AgeGroup | null;
  /** Best time in window (legend=false) or null (legend=true) */
  bestTimeS: number | null;
  /** Date of the best effort (legend=false) or most recent effort (legend=true) */
  date: string;
  /** Number of efforts in the window */
  efforts: number;
}

export function windowStartIso(window: WindowFilter, todayIso: string): string | null {
  if (window === 'all-time') return null;
  if (window === 'calendar-year') return `${todayIso.slice(0, 4)}-01-01`;
  const d = new Date(todayIso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildLeaderboard(
  results: CourseResult[],
  filters: LeaderboardFilters,
  todayIso: string,
): LeaderboardRow[] {
  const startIso = windowStartIso(filters.window, todayIso);
  const eventYear = Number(todayIso.slice(0, 4));

  const inWindow = results.filter((r) => {
    if (startIso && r.date < startIso) return false;
    if (filters.sex !== 'all' && r.sex !== filters.sex) return false;
    if (filters.ageGroup !== 'all' && ageGroupFor(r.yob, eventYear) !== filters.ageGroup) return false;
    return true;
  });

  // Group by member
  const byMember = new Map<number, CourseResult[]>();
  for (const r of inWindow) {
    if (!byMember.has(r.memberId)) byMember.set(r.memberId, []);
    byMember.get(r.memberId)!.push(r);
  }

  const rows: Omit<LeaderboardRow, 'rank'>[] = [];
  for (const efforts of byMember.values()) {
    const best = [...efforts].sort((a, b) => a.timeS - b.timeS || a.date.localeCompare(b.date))[0];
    const latest = [...efforts].sort((a, b) => b.date.localeCompare(a.date))[0];
    rows.push({
      memberId: best.memberId,
      name: best.name,
      sex: best.sex,
      ageGroup: ageGroupFor(best.yob, eventYear),
      bestTimeS: filters.legend ? null : best.timeS,
      date: filters.legend ? latest.date : best.date,
      efforts: efforts.length,
    });
  }

  rows.sort((a, b) =>
    filters.legend
      ? b.efforts - a.efforts || a.name.localeCompare(b.name)
      : (a.bestTimeS! - b.bestTimeS!) || a.name.localeCompare(b.name),
  );

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
