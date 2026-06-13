import 'server-only';
import type { WeekEvaluation } from './recent-weeks';
import type { ComplianceFlag } from './compliance';

/**
 * Observation patterns — derived signals from 12 weeks of compliance data.
 *
 * Each pattern is a heuristic that scans the dataset for a specific
 * signal. Returns null if the pattern doesn't apply, or an observation
 * string if it does.
 *
 * The whole panel is capped at 3 observations so we don't overwhelm.
 * Patterns are ordered by importance — first-out is most-important.
 *
 * Voice rules:
 *   - Terse, factual, plain English
 *   - Name the signal, name the magnitude
 *   - One actionable suggestion, no motivational fluff
 */

export interface Observation {
  /** The pattern that fired. */
  kind: string;
  /** Display text shown to the user. */
  text: string;
  /** Severity hint for UI styling. */
  severity: 'info' | 'warn' | 'alert';
}

const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function deriveObservations(weeks: WeekEvaluation[]): Observation[] {
  // Filter to weeks that have a real plan template — observations only
  // make sense against a known plan-of-record.
  const evaluable = weeks.filter((w) => w.compliance && w.template);
  if (evaluable.length < 4) return [];

  const observations: Observation[] = [];

  // Run each pattern and collect non-null results
  const patterns = [
    detectDowMissPattern,
    detectLongRunUndershoot,
    detectEasyPaceCreep,
    detectComplianceCrash,
    detectVolumeUndershoot,
    detectExcessiveAdaptation,
  ];

  for (const pattern of patterns) {
    const obs = pattern(evaluable);
    if (obs) observations.push(obs);
    if (observations.length >= 3) break;
  }

  return observations;
}

/* ----------------------------------------------------------------------------
 * Pattern 1 — repeated misses on a specific day-of-week.
 *
 * If the same DoW gets missed/short ≥ 40% of weeks, that's a scheduling
 * pattern, not bad luck.
 * -------------------------------------------------------------------------- */
function detectDowMissPattern(weeks: WeekEvaluation[]): Observation | null {
  const missCounts: Record<number, { miss: number; total: number }> = {};

  for (const week of weeks) {
    if (!week.compliance) continue;
    for (const day of week.compliance.days) {
      const hasPrescribed = day.sessions.some((s) => s.target.type !== 'rest');
      if (!hasPrescribed) continue;
      if (!missCounts[day.dow]) missCounts[day.dow] = { miss: 0, total: 0 };
      missCounts[day.dow].total++;
      if (day.sessions.some((s) => s.flag === 'miss' || s.flag === 'short' || s.flag === 'none')) {
        missCounts[day.dow].miss++;
      }
    }
  }

  let worstDow: number | null = null;
  let worstRate = 0;
  for (const [dowStr, counts] of Object.entries(missCounts)) {
    if (counts.total < 4) continue;
    const rate = counts.miss / counts.total;
    if (rate > worstRate && rate >= 0.4) {
      worstRate = rate;
      worstDow = parseInt(dowStr, 10);
    }
  }

  if (worstDow === null) return null;
  const counts = missCounts[worstDow];
  const dowName = DOW_NAMES[worstDow];

  return {
    kind: 'dow-miss-pattern',
    severity: worstRate >= 0.6 ? 'alert' : 'warn',
    text: `${dowName} sessions missed ${counts.miss}/${counts.total} weeks — pattern, not bad luck. Consider moving that day's session to one that fits your week better.`,
  };
}

/* ----------------------------------------------------------------------------
 * Pattern 2 — long run undershoot.
 *
 * If you've been averaging more than 10% below long-run target for 4+
 * weeks, the long run is the bellwether and it's not happening.
 * -------------------------------------------------------------------------- */
function detectLongRunUndershoot(weeks: WeekEvaluation[]): Observation | null {
  const undershoots: number[] = [];
  for (const week of weeks) {
    if (!week.template) continue;
    const target = week.template.longRunKmTarget;
    if (target === 0) continue;
    const actual = week.stats.longRunKm;
    if (actual < target * 0.9) {
      undershoots.push(target - actual);
    }
  }

  if (undershoots.length < 4) return null;

  const avgUndershoot = undershoots.reduce((s, x) => s + x, 0) / undershoots.length;
  const undershoot = avgUndershoot.toFixed(1);

  return {
    kind: 'long-run-undershoot',
    severity: undershoots.length >= 8 ? 'alert' : 'warn',
    text: `Long run undershoot averaging ${undershoot} km across ${undershoots.length} of ${weeks.length} weeks. Either reduce mid-week volume so you have legs for it, or lower the target.`,
  };
}

/* ----------------------------------------------------------------------------
 * Pattern 3 — easy run pace creep.
 *
 * If easy runs are getting faster while volume isn't improving, that's
 * the classic over-training signal. Easy days too hard means you're not
 * recovering, which means the hard days won't be hard enough.
 *
 * Compare avg easy pace from first 4 weeks vs last 4 weeks.
 * -------------------------------------------------------------------------- */
function detectEasyPaceCreep(weeks: WeekEvaluation[]): Observation | null {
  // weeks[0] is newest → first 4 = recent, last 4 = oldest in the window
  const recent = weeks.slice(0, 4);
  const old = weeks.slice(-4);
  if (old.length < 4 || recent.length < 4) return null;

  const recentAvg = avgEasyPace(recent);
  const oldAvg = avgEasyPace(old);
  if (recentAvg === null || oldAvg === null) return null;

  // Speed creep = recent pace is FASTER than old pace (lower s/km)
  const diffSec = oldAvg - recentAvg;

  // Need a meaningful diff: at least 6 sec/km faster to flag
  if (diffSec < 6) return null;

  return {
    kind: 'easy-pace-creep',
    severity: diffSec >= 12 ? 'alert' : 'warn',
    text: `Easy run pace creeping faster by ${Math.round(diffSec)}s/km over ${weeks.length} weeks. Classic over-training signal — slow down on easy days, or hard days will start suffering too.`,
  };
}

function avgEasyPace(weeks: WeekEvaluation[]): number | null {
  let totalDist = 0;
  let totalTime = 0;
  for (const week of weeks) {
    for (const a of week.activities) {
      if (a.type !== 'Run' && a.type !== 'TrailRun') continue;
      // Heuristic: "easy" = ≥ 5min/km pace and ≤ 12km. Excludes long runs and quality.
      if (!a.distanceM || !a.movingTimeS) continue;
      const km = a.distanceM / 1000;
      if (km > 12) continue;
      const paceSec = a.movingTimeS / km;
      if (paceSec < 240) continue; // faster than 4:00/km — quality session, skip
      totalDist += km;
      totalTime += a.movingTimeS;
    }
  }
  if (totalDist === 0) return null;
  return totalTime / totalDist;
}

/* ----------------------------------------------------------------------------
 * Pattern 4 — compliance % drop.
 *
 * If the last 4 weeks' compliance is at least 15 percentage points below
 * the prior 4 weeks, something has shifted recently.
 * -------------------------------------------------------------------------- */
function detectComplianceCrash(weeks: WeekEvaluation[]): Observation | null {
  if (weeks.length < 8) return null;
  const recent = weeks.slice(0, 4);
  const previous = weeks.slice(4, 8);

  const recentPct = compliancePct(recent);
  const previousPct = compliancePct(previous);
  if (recentPct === null || previousPct === null) return null;

  const drop = previousPct - recentPct;
  if (drop < 15) return null;

  return {
    kind: 'compliance-crash',
    severity: drop >= 25 ? 'alert' : 'warn',
    text: `Compliance dropped ${drop.toFixed(0)} points in the last month (${recentPct.toFixed(0)}% vs ${previousPct.toFixed(0)}%). Check what's changed — work, sleep, life, motivation.`,
  };
}

function compliancePct(weeks: WeekEvaluation[]): number | null {
  let total = 0;
  let ok = 0;
  for (const week of weeks) {
    if (!week.compliance) continue;
    for (const day of week.compliance.days) {
      for (const session of day.sessions) {
        if (session.target.type === 'rest') continue;
        total++;
        if (session.flag === 'ok' || session.flag === 'warn') ok++;
      }
    }
  }
  return total > 0 ? (ok / total) * 100 : null;
}

/* ----------------------------------------------------------------------------
 * Pattern 5 — chronic volume undershoot.
 *
 * If actual weekly km is consistently 15-30% below target across most
 * weeks, your real training capacity may be lower than the plan thinks.
 * -------------------------------------------------------------------------- */
function detectVolumeUndershoot(weeks: WeekEvaluation[]): Observation | null {
  const ratios: number[] = [];
  for (const week of weeks) {
    if (!week.template || week.template.totalKmTarget === 0) continue;
    ratios.push(week.stats.totalKm / week.template.totalKmTarget);
  }
  if (ratios.length < 6) return null;

  const avg = ratios.reduce((s, x) => s + x, 0) / ratios.length;
  if (avg >= 0.85) return null; // close enough to target — not undershooting

  const pct = Math.round((1 - avg) * 100);
  if (pct < 10) return null;

  return {
    kind: 'volume-undershoot',
    severity: pct >= 25 ? 'alert' : 'warn',
    text: `Weekly km running ${pct}% under target on average. Consider lowering the weekly cap so the plan reflects what you're actually capable of right now.`,
  };
}

/* ----------------------------------------------------------------------------
 * Pattern 6 — excessive calendar adaptation.
 *
 * If most weeks are getting adapted (sickness, travel, reduced), the plan
 * is fighting the calendar. Either life is genuinely chaotic or the plan
 * is over-ambitious for your current life shape.
 * -------------------------------------------------------------------------- */
function detectExcessiveAdaptation(weeks: WeekEvaluation[]): Observation | null {
  const adaptedWeeks = weeks.filter(
    (w) =>
      w.template?.adaptations?.some((a) =>
        ['reduced', 'no-training', 'travel-only'].includes(a.kind)
      )
  ).length;

  if (adaptedWeeks < weeks.length * 0.4) return null;

  return {
    kind: 'excessive-adaptation',
    severity: 'info',
    text: `${adaptedWeeks} of ${weeks.length} weeks adapted for life events. Consider whether the plan's volume target matches your actual life-shape, or whether you need a less demanding dojo for this season.`,
  };
}
