import type { Vo2Observation, Vo2Source } from './vo2max-pure';

export type InsightTier = 'trend' | 'context' | 'outlier';
export type InsightTone = 'positive' | 'neutral' | 'caution';

export interface Vo2Insight {
  tier: InsightTier;
  tone: InsightTone;
  title: string;
  body: string;
}

export interface InsightContext {
  recentWeeklyKm?: number | null;
  priorWeeklyKm?: number | null;
  recentSleepHours?: number | null;
  recentRestingHr?: number | null;
  priorRestingHr?: number | null;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function round1(n: number): number { return Math.round(n * 10) / 10; }

const SOURCE_LABEL: Record<Vo2Source, string> = {
  'manual-lab': 'lab', cooper: 'Cooper', rockport: 'Rockport', device: 'device',
};

function trendInsights(series: Vo2Observation[]): Vo2Insight[] {
  if (series.length < 2) return [];
  const first = series[0];
  const last = series[series.length - 1];
  const delta = round1(last.value - first.value);
  const out: Vo2Insight[] = [];

  if (Math.abs(delta) < 0.5) {
    out.push({ tier: 'trend', tone: 'neutral', title: 'Holding steady', body: `VO2 max has stayed within half a point (${first.value} → ${last.value}) across ${series.length} readings.` });
  } else if (delta > 0) {
    out.push({ tier: 'trend', tone: 'positive', title: `Up ${delta} points`, body: `VO2 max has risen from ${first.value} to ${last.value} over ${series.length} readings.` });
  } else {
    out.push({ tier: 'trend', tone: 'caution', title: `Down ${Math.abs(delta)} points`, body: `VO2 max has fallen from ${first.value} to ${last.value} across ${series.length} readings.` });
  }

  if (series.length >= 4) {
    const recent = series.slice(-3).map((o) => o.value);
    const slope = round1(recent[recent.length - 1] - recent[0]);
    if (Math.abs(slope) >= 1) {
      out.push({ tier: 'trend', tone: slope > 0 ? 'positive' : 'caution', title: slope > 0 ? 'Recent acceleration' : 'Recent dip', body: `The last three readings moved ${slope > 0 ? '+' : ''}${slope} points.` });
    }
  }

  return out;
}

function contextInsights(series: Vo2Observation[], ctx: InsightContext): Vo2Insight[] {
  if (series.length < 2) return [];
  const delta = series[series.length - 1].value - series[0].value;
  const out: Vo2Insight[] = [];

  if (ctx.recentWeeklyKm != null && ctx.priorWeeklyKm != null && ctx.priorWeeklyKm > 0) {
    const loadChange = (ctx.recentWeeklyKm - ctx.priorWeeklyKm) / ctx.priorWeeklyKm;
    if (delta > 0.5 && loadChange > 0.1) {
      out.push({ tier: 'context', tone: 'neutral', title: 'Rising volume is a possible factor', body: `Your weekly volume is up ~${Math.round(loadChange * 100)}% over the same period — a possible contributing factor in the VO2 max rise.` });
    } else if (delta < -0.5 && loadChange < -0.1) {
      out.push({ tier: 'context', tone: 'neutral', title: 'Reduced volume is a possible factor', body: `Volume is down ~${Math.round(Math.abs(loadChange) * 100)}% over the window — a possible factor in the VO2 max dip.` });
    }
  }

  if (ctx.recentSleepHours != null && delta < -0.5 && ctx.recentSleepHours < 7) {
    out.push({ tier: 'context', tone: 'caution', title: 'Short sleep is a possible factor', body: `Recent sleep has averaged ${round1(ctx.recentSleepHours)}h — a possible factor, below the typical 7-8h target.` });
  }

  if (ctx.recentRestingHr != null && ctx.priorRestingHr != null) {
    const rhrRise = ctx.recentRestingHr - ctx.priorRestingHr;
    if (rhrRise >= 3 && delta < -0.5) {
      out.push({ tier: 'context', tone: 'caution', title: 'Elevated resting HR is a possible factor', body: `Resting HR is up ~${Math.round(rhrRise)} bpm versus the earlier period — a possible sign of accumulated fatigue.` });
    }
  }

  return out;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function outlierInsights(series: Vo2Observation[]): Vo2Insight[] {
  if (series.length < 4) return [];
  const values = series.map((o) => o.value);
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const robustSigma = (mad * 1.4826) || 0.1;
  const out: Vo2Insight[] = [];
  for (const o of series) {
    const z = (o.value - med) / robustSigma;
    if (Math.abs(z) >= 2.5) {
      out.push({ tier: 'outlier', tone: 'caution', title: `Outlier reading: ${o.value} (${SOURCE_LABEL[o.source]}, ${o.dateIso})`, body: `This reading sits ${round1(Math.abs(z))} standard deviations from your typical ${round1(med)} — check the source; it may be an artefact.` });
    }
  }
  return out;
}

// suppress unused import warning for `mean` (kept for parity with VELOCITY source)
void mean;

export interface Vo2InsightReport {
  insights: Vo2Insight[];
  byTier: Record<InsightTier, Vo2Insight[]>;
  hasInsights: boolean;
}

export function buildVo2Insights(series: Vo2Observation[], ctx: InsightContext = {}): Vo2InsightReport {
  const insights = [...trendInsights(series), ...contextInsights(series, ctx), ...outlierInsights(series)];
  const byTier: Record<InsightTier, Vo2Insight[]> = {
    trend: insights.filter((i) => i.tier === 'trend'),
    context: insights.filter((i) => i.tier === 'context'),
    outlier: insights.filter((i) => i.tier === 'outlier'),
  };
  return { insights, byTier, hasInsights: insights.length > 0 };
}
