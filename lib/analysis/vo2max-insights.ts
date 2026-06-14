/**
 * R2.6 VO2 max insights - PURE three-tier analysis.
 *
 * No DB, no server-only. Consumes the resolved VO2 series plus optional
 * biometric context, emits human-readable insights at three tiers:
 *
 *   Tier 1 - TRENDS: direction and rate of change over the series.
 *            Factual, high confidence.
 *   Tier 2 - CONTEXTUAL HEURISTICS: correlate VO2 movement with training
 *            load / sleep / RHR context. Deliberately hedged - emits
 *            "possible factor" wording, never causal claims. A VO2 dip
 *            alongside poor sleep is a *possible* explanation, not a proven
 *            one - a single noisy device reading could equally be the cause.
 *   Tier 3 - OUTLIERS: flag observations more than 2.5 standard deviations
 *            from the series mean. These are usually measurement artefacts
 *            (a bad device estimate, a mis-paced Cooper test) rather than
 *            real physiological jumps, so they're surfaced for review.
 *
 * Each insight carries a tier, a severity tone, and a body. The UI groups
 * by tier. Confidence language is baked into the copy at tiers 2/3.
 */

import type { Vo2Observation, Vo2Source } from './vo2max-pure';

export type InsightTier = 'trend' | 'context' | 'outlier';
export type InsightTone = 'positive' | 'neutral' | 'caution';

export interface Vo2Insight {
  tier: InsightTier;
  tone: InsightTone;
  title: string;
  body: string;
}

/** Optional context the heuristics tier correlates against. */
export interface InsightContext {
  /** Mean weekly km over the recent block, if known */
  recentWeeklyKm?: number | null;
  /** Mean weekly km over the prior block, for comparison */
  priorWeeklyKm?: number | null;
  /** Recent mean sleep hours, if known */
  recentSleepHours?: number | null;
  /** Recent mean resting HR, if known */
  recentRestingHr?: number | null;
  /** Prior mean resting HR, for comparison */
  priorRestingHr?: number | null;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function round1(n: number): number { return Math.round(n * 10) / 10; }

const SOURCE_LABEL: Record<Vo2Source, string> = {
  'manual-lab': 'lab', cooper: 'Cooper', rockport: 'Rockport', device: 'device',
};

/* ---- Tier 1: trends ------------------------------------------------------ */

function trendInsights(series: Vo2Observation[]): Vo2Insight[] {
  if (series.length < 2) return [];
  const first = series[0];
  const last = series[series.length - 1];
  const delta = round1(last.value - first.value);
  const out: Vo2Insight[] = [];

  if (Math.abs(delta) < 0.5) {
    out.push({
      tier: 'trend', tone: 'neutral',
      title: 'Holding steady',
      body: `VO2 max has stayed within half a point (${first.value} → ${last.value}) across ${series.length} readings. A stable aerobic ceiling during consistent training is a reasonable baseline.`,
    });
  } else if (delta > 0) {
    out.push({
      tier: 'trend', tone: 'positive',
      title: `Up ${delta} points`,
      body: `VO2 max has risen from ${first.value} to ${last.value} over ${series.length} readings. Trending upward is what you want to see through a build.`,
    });
  } else {
    out.push({
      tier: 'trend', tone: 'caution',
      title: `Down ${Math.abs(delta)} points`,
      body: `VO2 max has fallen from ${first.value} to ${last.value} across ${series.length} readings. Worth watching - though see the caveats below before reading too much into it.`,
    });
  }

  // Recent 3-reading micro-trend, if enough data
  if (series.length >= 4) {
    const recent = series.slice(-3).map((o) => o.value);
    const slope = round1(recent[recent.length - 1] - recent[0]);
    if (Math.abs(slope) >= 1) {
      out.push({
        tier: 'trend', tone: slope > 0 ? 'positive' : 'caution',
        title: slope > 0 ? 'Recent acceleration' : 'Recent dip',
        body: `The last three readings moved ${slope > 0 ? '+' : ''}${slope} points, a sharper move than the longer trend. Recent readings carry more weight if your training has changed lately.`,
      });
    }
  }

  return out;
}

/* ---- Tier 2: contextual heuristics (hedged) ------------------------------ */

function contextInsights(series: Vo2Observation[], ctx: InsightContext): Vo2Insight[] {
  if (series.length < 2) return [];
  const delta = series[series.length - 1].value - series[0].value;
  const out: Vo2Insight[] = [];

  // Load context
  if (ctx.recentWeeklyKm != null && ctx.priorWeeklyKm != null && ctx.priorWeeklyKm > 0) {
    const loadChange = (ctx.recentWeeklyKm - ctx.priorWeeklyKm) / ctx.priorWeeklyKm;
    if (delta > 0.5 && loadChange > 0.1) {
      out.push({
        tier: 'context', tone: 'neutral',
        title: 'Rising volume is a possible factor',
        body: `Your weekly volume is up ~${Math.round(loadChange * 100)}% over the same period VO2 max rose. Increased aerobic volume is one possible contributor - though a single test's noise could also explain part of the change.`,
      });
    } else if (delta < -0.5 && loadChange < -0.1) {
      out.push({
        tier: 'context', tone: 'neutral',
        title: 'Reduced volume is a possible factor',
        body: `Volume is down ~${Math.round(Math.abs(loadChange) * 100)}% over the window where VO2 max dipped. A training reduction is one possible explanation - detraining, a taper, or simply measurement variation could all be at play.`,
      });
    }
  }

  // Sleep context
  if (ctx.recentSleepHours != null && delta < -0.5 && ctx.recentSleepHours < 7) {
    out.push({
      tier: 'context', tone: 'caution',
      title: 'Short sleep is a possible factor',
      body: `Recent sleep has averaged ${round1(ctx.recentSleepHours)}h, below a typical 7-8h target, over a period where VO2 max dipped. Under-recovery is one possible influence on both your readings and your test performance - not a confirmed cause.`,
    });
  }

  // Resting HR context (rising RHR often tracks fatigue/illness)
  if (ctx.recentRestingHr != null && ctx.priorRestingHr != null) {
    const rhrRise = ctx.recentRestingHr - ctx.priorRestingHr;
    if (rhrRise >= 3 && delta < -0.5) {
      out.push({
        tier: 'context', tone: 'caution',
        title: 'Elevated resting HR is a possible factor',
        body: `Resting HR is up ~${Math.round(rhrRise)} bpm versus the earlier period, alongside the VO2 dip. A rising resting HR can accompany accumulated fatigue or illness, which is one possible influence here - worth noting, not diagnosing.`,
      });
    }
  }

  return out;
}

/* ---- Tier 3: outliers (robust, MAD-based) -------------------------------- */

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function outlierInsights(series: Vo2Observation[]): Vo2Insight[] {
  if (series.length < 4) return []; // need a meaningful distribution
  const values = series.map((o) => o.value);

  // Robust outlier detection via median + MAD (median absolute deviation).
  // Unlike mean/stdev, the median and MAD aren't inflated by the very
  // outlier we're trying to catch (the "masking" problem), so a single
  // wild reading is still flagged. 1.4826 scales MAD to be consistent
  // with the standard deviation for normal data; we keep the 2.5 "sigma"
  // threshold expressed in those robust units.
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  // Fall back to a tiny epsilon if MAD is zero (all-identical center) so
  // a lone different value still divides sensibly.
  const robustSigma = (mad * 1.4826) || 0.1;

  const out: Vo2Insight[] = [];
  for (const o of series) {
    const z = (o.value - med) / robustSigma;
    if (Math.abs(z) >= 2.5) {
      out.push({
        tier: 'outlier', tone: 'caution',
        title: `Outlier reading: ${o.value} (${SOURCE_LABEL[o.source]}, ${o.dateIso})`,
        body: `This reading sits ${round1(Math.abs(z))} standard deviations from your typical ${round1(med)}. Values this far out are more often measurement artefacts - a noisy device estimate or a mis-paced field test - than real physiological change. Consider re-testing before trusting it.`,
      });
    }
  }
  return out;
}

export interface Vo2InsightReport {
  insights: Vo2Insight[];
  byTier: Record<InsightTier, Vo2Insight[]>;
  hasInsights: boolean;
}

export function buildVo2Insights(series: Vo2Observation[], ctx: InsightContext = {}): Vo2InsightReport {
  const insights = [
    ...trendInsights(series),
    ...contextInsights(series, ctx),
    ...outlierInsights(series),
  ];
  const byTier: Record<InsightTier, Vo2Insight[]> = {
    trend: insights.filter((i) => i.tier === 'trend'),
    context: insights.filter((i) => i.tier === 'context'),
    outlier: insights.filter((i) => i.tier === 'outlier'),
  };
  return { insights, byTier, hasInsights: insights.length > 0 };
}
