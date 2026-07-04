import type { Dojo, WeekTemplate } from '@/lib/plans/types';
import type { WeekStats } from './week-queries';
import type { WeekCompliance } from './compliance';
import type { IntensityDistribution } from './intensity-distribution';
import type { ProgramPhase } from '@/lib/plans/program-phase';
import type { NsGuardReport } from './ns-guardrails';
import type { Activity } from '@/lib/db/schema';

export interface FrameworkStat {
  label: string;
  value: string;
  unit?: string;
  status?: 'ok' | 'warn' | 'miss' | 'neutral';
  subline?: string;
}

export interface FrameworkStatsInput {
  dojo: Dojo;
  stats: WeekStats;
  template: WeekTemplate;
  activities: Activity[];
  compliance: WeekCompliance;
  intensityDist: IntensityDistribution | null;
  programPhase: ProgramPhase;
  nsReport: NsGuardReport | null;
  vdot: number | null;
}

/* ============================================================================
 * Helpers
 * ============================================================================
 */

const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);
const QUALITY_TYPES = new Set(['tempo', 'interval', 'repetition']);

function formatPaceSpk(spk: number | null): string {
  if (spk == null || spk <= 0) return '—:—';
  const mins = Math.floor(spk / 60);
  const secs = Math.round(spk % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function volumeStatus(actual: number, target: number): 'ok' | 'warn' | 'neutral' {
  if (target <= 0) return 'neutral';
  const ratio = actual / target;
  if (ratio >= 0.8) return 'ok';
  if (ratio >= 0.5) return 'warn';
  return 'neutral';
}

function dowOf(startDateLocal: string): number {
  return (new Date(startDateLocal).getDay() + 6) % 7;
}

/* ============================================================================
 * Generic (custom / fallback) — 4 universal stats
 * ============================================================================
 */

function genericStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template } = input;

  const stat0: FrameworkStat = {
    label: 'this week',
    value: stats.totalKm.toFixed(1),
    unit: 'km',
    status: volumeStatus(stats.totalKm, template.totalKmTarget),
  };

  const stat1: FrameworkStat = {
    label: 'long run',
    value: stats.longRunKm.toFixed(1),
    unit: 'km',
  };

  const stat2: FrameworkStat = {
    label: 'avg pace',
    value: formatPaceSpk(stats.avgPaceSpk),
    subline: `${stats.totalSessions} sessions`,
  };

  const stat3: FrameworkStat =
    stats.avgHr != null
      ? { label: 'avg HR', value: Math.round(stats.avgHr).toString(), unit: 'bpm' }
      : { label: 'avg HR', value: '—', status: 'neutral', subline: 'no HR data' };

  return [stat0, stat1, stat2, stat3];
}

/* ============================================================================
 * Norwegian Singles
 * ============================================================================
 */

function nsEasyHrStat(activities: Activity[], template: WeekTemplate): FrameworkStat {
  const easyDows = new Set<number>();
  for (const day of template.days) {
    if (!day.sessions.some((s) => QUALITY_TYPES.has(s.type ?? ''))) {
      easyDows.add(day.dow);
    }
  }

  const easyRuns = activities.filter(
    (a) => RUN_TYPES.has(a.type) && easyDows.has(dowOf(a.startDateLocal)) && a.avgHr != null
  );

  if (easyRuns.length === 0) {
    return { label: 'easy avg HR', value: '—', unit: 'no HR', status: 'neutral' };
  }

  const num = easyRuns.reduce((s, a) => s + (a.avgHr ?? 0) * (a.movingTimeS ?? 1), 0);
  const den = easyRuns.reduce((s, a) => s + (a.movingTimeS ?? 1), 0);
  const hr = Math.round(num / den);
  const status = hr <= 130 ? 'ok' : hr <= 135 ? 'warn' : 'miss';
  return { label: 'easy avg HR', value: hr.toString(), unit: 'bpm', status };
}

function norwegianSinglesStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, activities, nsReport } = input;

  if (!nsReport) return genericStats(input);

  const { qualityCap, disciplineScore } = nsReport;
  const capPct = Math.round(qualityCap.fraction * 100);

  const stat0: FrameworkStat = {
    label: 'sub-T volume',
    value: `${capPct}%`,
    status: qualityCap.severity,
    subline: `target ≤ ${Math.round(qualityCap.targetFraction * 100)}%`,
  };

  const stat1 = nsEasyHrStat(activities, template);

  const stat2: FrameworkStat = {
    label: 'discipline',
    value: disciplineScore.toString(),
    unit: '/100',
    status: disciplineScore >= 80 ? 'ok' : disciplineScore >= 50 ? 'warn' : 'miss',
  };

  const stat3: FrameworkStat = {
    label: 'long run',
    value: stats.longRunKm.toFixed(1),
    unit: 'km',
  };

  return [stat0, stat1, stat2, stat3];
}

/* ============================================================================
 * Polarised
 * ============================================================================
 */

function polarisedStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, intensityDist } = input;

  if (!intensityDist) return genericStats(input);

  const { easyPct, hardPct, greyPct } = intensityDist;

  const easyStatus = easyPct >= 80 ? 'ok' : easyPct >= 70 ? 'warn' : 'miss';
  const hardStatus = hardPct >= 15 && hardPct <= 25 ? 'ok' : 'warn';
  const greyStatus = greyPct <= 5 ? 'ok' : greyPct <= 15 ? 'warn' : 'miss';

  return [
    { label: 'easy %', value: `${easyPct}%`, status: easyStatus },
    { label: 'hard %', value: `${hardPct}%`, status: hardStatus },
    { label: 'grey zone', value: `${greyPct}%`, status: greyStatus },
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km' },
  ];
}

/* ============================================================================
 * Ultra
 * ============================================================================
 */

function ultraStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats } = input;

  const hrs = stats.totalMovingTimeS / 3600;

  const stat0: FrameworkStat = {
    label: 'time on feet',
    value: hrs.toFixed(1),
    unit: 'hrs',
    status: stats.totalMovingTimeS === 0 ? 'neutral' : hrs >= 6 ? 'ok' : 'warn',
  };

  const stat1: FrameworkStat = {
    label: 'vertical gain',
    value: Math.round(stats.totalElevationGainM).toString(),
    unit: 'm',
  };

  const stat2: FrameworkStat = {
    label: 'back-to-back',
    value: stats.backToBackKm.toFixed(1),
    unit: 'km',
  };

  const stat3: FrameworkStat = {
    label: 'this week',
    value: stats.totalKm.toFixed(1),
    unit: 'km',
  };

  return [stat0, stat1, stat2, stat3];
}

/* ============================================================================
 * Hansons
 * ============================================================================
 */

function hansonsTempoPace(activities: Activity[], template: WeekTemplate): FrameworkStat {
  const qualityDows = new Set<number>();
  for (const day of template.days) {
    if (day.sessions.some((s) => s.type === 'tempo')) {
      qualityDows.add(day.dow);
    }
  }

  const tempoRuns = activities.filter(
    (a) => RUN_TYPES.has(a.type) && qualityDows.has(dowOf(a.startDateLocal)) && a.avgSpeedMs != null && (a.avgSpeedMs ?? 0) > 0
  );

  if (tempoRuns.length === 0) {
    return { label: 'MP-tempo pace', value: '—', subline: 'no tempo yet' };
  }

  const totalDist = tempoRuns.reduce((s, a) => s + (a.distanceM ?? 0), 0);
  const totalTime = tempoRuns.reduce((s, a) => s + (a.movingTimeS ?? 0), 0);
  const avgSpeedMs = totalDist > 0 && totalTime > 0 ? totalDist / totalTime : null;
  const pace = avgSpeedMs ? 1000 / avgSpeedMs : null;

  return { label: 'MP-tempo pace', value: formatPaceSpk(pace), unit: '/km' };
}

function hansonsStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, activities } = input;

  return [
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km', status: volumeStatus(stats.totalKm, template.totalKmTarget) },
    hansonsTempoPace(activities, template),
    { label: 'long run', value: stats.longRunKm.toFixed(1), unit: 'km' },
    { label: 'sessions', value: stats.totalSessions.toString() },
  ];
}

/* ============================================================================
 * Daniels
 * ============================================================================
 */

function danielsTempoPace(activities: Activity[], template: WeekTemplate): FrameworkStat {
  const qualityDows = new Set<number>();
  for (const day of template.days) {
    if (day.sessions.some((s) => s.type === 'tempo' || s.type === 'interval')) {
      qualityDows.add(day.dow);
    }
  }

  const tempoRuns = activities.filter(
    (a) => RUN_TYPES.has(a.type) && qualityDows.has(dowOf(a.startDateLocal)) && (a.avgSpeedMs ?? 0) > 0
  );

  if (tempoRuns.length === 0) {
    return { label: 'T-pace', value: '—', subline: 'no T sessions yet' };
  }

  const totalDist = tempoRuns.reduce((s, a) => s + (a.distanceM ?? 0), 0);
  const totalTime = tempoRuns.reduce((s, a) => s + (a.movingTimeS ?? 0), 0);
  const avgSpeedMs = totalDist > 0 && totalTime > 0 ? totalDist / totalTime : null;
  const pace = avgSpeedMs ? 1000 / avgSpeedMs : null;

  return { label: 'T-pace', value: formatPaceSpk(pace), unit: '/km' };
}

function danielsStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, activities, vdot } = input;

  const vdotStat: FrameworkStat = vdot != null
    ? { label: 'VDOT', value: Math.round(vdot).toString(), status: 'ok' }
    : { label: 'VDOT', value: '—', status: 'neutral' };

  return [
    danielsTempoPace(activities, template),
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km', status: volumeStatus(stats.totalKm, template.totalKmTarget) },
    vdotStat,
    { label: 'long run', value: stats.longRunKm.toFixed(1), unit: 'km' },
  ];
}

/* ============================================================================
 * Higdon
 * ============================================================================
 */

function higdonStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, programPhase } = input;

  const weekType = programPhase.programWeekNumber % 4 === 0 ? 'down' : 'build';

  return [
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km', status: volumeStatus(stats.totalKm, template.totalKmTarget) },
    { label: 'long run', value: stats.longRunKm.toFixed(1), unit: 'km' },
    { label: 'week type', value: weekType },
    { label: 'sessions', value: stats.totalSessions.toString() },
  ];
}

/* ============================================================================
 * Lydiard
 * ============================================================================
 */

function lydiardStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, intensityDist, programPhase } = input;

  const weeksToRace = programPhase.daysToRace != null
    ? `${Math.ceil(programPhase.daysToRace / 7)} wks to race`
    : undefined;

  const aerobicStat: FrameworkStat = intensityDist != null
    ? { label: 'aerobic %', value: `${intensityDist.easyPct}%`, status: intensityDist.easyPct >= 80 ? 'ok' : 'warn' }
    : { label: 'aerobic %', value: '—', status: 'neutral' };

  return [
    { label: 'phase', value: template.phaseName, subline: weeksToRace },
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km', status: volumeStatus(stats.totalKm, template.totalKmTarget) },
    { label: 'long run', value: stats.longRunKm.toFixed(1), unit: 'km' },
    aerobicStat,
  ];
}

/* ============================================================================
 * Pfitzinger
 * ============================================================================
 */

function pfitzingerStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template } = input;

  return [
    { label: 'this week', value: stats.totalKm.toFixed(1), unit: 'km', status: volumeStatus(stats.totalKm, template.totalKmTarget) },
    { label: 'phase', value: template.phaseName },
    { label: 'long run', value: stats.longRunKm.toFixed(1), unit: 'km' },
    { label: 'sessions', value: stats.totalSessions.toString() },
  ];
}

/* ============================================================================
 * Dispatch
 * ============================================================================
 */

export function getFrameworkStats(input: FrameworkStatsInput): FrameworkStat[] {
  switch (input.dojo) {
    case 'hansons':          return hansonsStats(input);
    case 'norwegian-singles': return norwegianSinglesStats(input);
    case 'daniels':          return danielsStats(input);
    case 'pfitzinger':       return pfitzingerStats(input);
    case 'higdon':           return higdonStats(input);
    case 'lydiard':          return lydiardStats(input);
    case 'polarised':        return polarisedStats(input);
    case 'ultra':            return ultraStats(input);
    case 'custom':
    default:                 return genericStats(input);
  }
}
