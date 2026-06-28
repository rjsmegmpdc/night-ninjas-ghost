/**
 * Framework-specific stat rows — pure, no DB, no server-only.
 *
 * Each training dojo surfaces the 4 metrics that matter for its method.
 * The generic fallback (custom / unknown) mirrors the existing 4-stat block.
 *
 * HR missing: any metric that needs HR but has no data shows '— no HR'
 * with a 'neutral' status so the grid never crashes.
 */

import type { Dojo, WeekTemplate } from '@/lib/plans/types';
import type { Activity } from '@/lib/db/schema';
import type { WeekStats } from '@/lib/analysis/week-queries';
import type { WeekCompliance } from '@/lib/analysis/compliance';
import type { IntensityDistribution } from '@/lib/analysis/intensity-distribution';
import type { ProgramPhase } from '@/lib/plans/program-phase';
import type { NsGuardReport } from '@/lib/analysis/ns-guardrails';

/* -------------------------------------------------------------------------- */

export type StatStatus = 'ok' | 'warn' | 'miss' | 'neutral';

export interface FrameworkStat {
  label: string;
  value: string;
  unit?: string;
  subline?: string;
  status?: StatStatus;
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
  /** VO2max / VDOT estimate from observations table. Daniels uses this. */
  vdot: number | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmtSpk(spk: number): string {
  const m = Math.floor(spk / 60);
  const s = Math.round(spk % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Mon=0..Sun=6, component-based to avoid UTC midnight shift.
function dowOf(isoLocal: string): number {
  const [y, m, d] = isoLocal.slice(0, 10).split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

function volStatus(pct: number | null): StatStatus {
  if (pct == null) return 'neutral';
  return pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'neutral';
}

function paceStatus(spk: number, zone: { minSpk: number; maxSpk: number }): StatStatus {
  if (spk <= zone.maxSpk * 1.05 && spk >= zone.minSpk * 0.97) return 'ok';
  if (spk < zone.minSpk * 0.97) return 'warn'; // ran faster than band
  return 'miss'; // ran slower than band
}

/** Find tempo/threshold sessions that completed with an actual pace. */
function qualitySessions(
  compliance: WeekCompliance,
  type: 'tempo' | 'interval' | 'repetition'
) {
  return compliance.days
    .flatMap((d) => d.sessions)
    .filter((s) => s.target.type === type && s.actualPaceSpk != null);
}

/* -------------------------------------------------------------------------- */
/* Per-framework implementations                                               */
/* -------------------------------------------------------------------------- */

function getNsStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { nsReport, activities, template, stats, compliance } = input;
  if (!nsReport) return getGenericStats(input);

  // Stat 1: Sub-T % of weekly volume
  const qualityPct = Math.round(nsReport.qualityCap.fraction * 100);
  const capStatus: StatStatus = nsReport.qualityCap.severity;

  // Identify quality days from the template (Set<number> to accept dowOf result)
  const qualityDows = new Set<number>(
    template.days
      .filter((d) =>
        d.sessions.some(
          (s) =>
            s.type === 'tempo' ||
            s.type === 'interval' ||
            s.type === 'repetition'
        )
      )
      .map((d) => d.dow)
  );

  // Stat 2: Easy avg HR (activities on non-quality days)
  const easyRuns = activities.filter((a) => {
    if (!a.avgHr) return false;
    const dow = dowOf(a.startDateLocal);
    return (
      !qualityDows.has(dow) &&
      (a.type === 'Run' || a.type === 'VirtualRun' || a.type === 'TrailRun')
    );
  });
  const easyHr =
    easyRuns.length > 0
      ? Math.round(
          easyRuns.reduce((sum, a) => sum + (a.avgHr ?? 0), 0) / easyRuns.length
        )
      : null;

  // Stat 3: Rep avg HR (activities on quality days)
  const repRuns = activities.filter((a) => {
    if (!a.avgHr) return false;
    const dow = dowOf(a.startDateLocal);
    return (
      qualityDows.has(dow) &&
      (a.type === 'Run' || a.type === 'VirtualRun' || a.type === 'TrailRun')
    );
  });
  const repHr =
    repRuns.length > 0
      ? Math.round(
          repRuns.reduce((sum, a) => sum + (a.avgHr ?? 0), 0) / repRuns.length
        )
      : null;

  // Stat 4: Long run
  const longPct =
    template.longRunKmTarget > 0
      ? Math.round((stats.longRunKm / template.longRunKmTarget) * 100)
      : null;

  return [
    {
      label: 'sub-T volume',
      value: `${qualityPct}%`,
      subline: `cap 22% · ${
        capStatus === 'ok'
          ? 'in band'
          : capStatus === 'warn'
          ? 'watch'
          : 'over cap'
      }`,
      status: capStatus,
    },
    {
      label: 'easy avg HR',
      value: easyHr != null ? String(easyHr) : '—',
      unit: easyHr != null ? 'bpm' : 'no HR',
      subline: 'cap ≤130',
      status:
        easyHr != null
          ? easyHr <= 130
            ? 'ok'
            : easyHr <= 135
            ? 'warn'
            : 'miss'
          : 'neutral',
    },
    {
      label: 'rep avg HR',
      value: repHr != null ? String(repHr) : '—',
      unit: repHr != null ? 'bpm' : 'no HR',
      subline: 'cap ≤147',
      status:
        repHr != null
          ? repHr <= 147
            ? 'ok'
            : repHr <= 152
            ? 'warn'
            : 'miss'
          : 'neutral',
    },
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget}`,
      status: volStatus(longPct),
    },
  ];
}

function getHansonsStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, compliance } = input;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  // MP-tempo pace: Hansons tempo is run at marathon pace
  const tempo = qualitySessions(compliance, 'tempo');
  let mpPaceVal = '—';
  let mpUnit: string | undefined;
  let mpSubline = 'no tempo yet';
  let mpStatus: StatStatus = 'neutral';

  if (tempo.length > 0) {
    const avg =
      tempo.reduce((s, x) => s + (x.actualPaceSpk ?? 0), 0) / tempo.length;
    mpPaceVal = fmtSpk(avg);
    mpUnit = '/km';
    const zone = tempo[0].target.paceZone;
    if (zone) {
      mpSubline = `band ${fmtSpk(zone.minSpk)}–${fmtSpk(zone.maxSpk)}`;
      mpStatus = paceStatus(avg, zone);
    } else {
      mpSubline = 'tempo completed';
      mpStatus = 'ok';
    }
  }

  const longPct =
    template.longRunKmTarget > 0
      ? Math.round((stats.longRunKm / template.longRunKmTarget) * 100)
      : null;

  return [
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
    {
      label: 'MP-tempo pace',
      value: mpPaceVal,
      unit: mpUnit,
      subline: mpSubline,
      status: mpStatus,
    },
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget} · ${longPct ?? 0}%`,
      status: volStatus(longPct),
    },
    {
      label: 'sessions',
      value: String(stats.totalSessions),
      subline: 'logged this week',
      status: stats.totalSessions > 0 ? 'ok' : 'neutral',
    },
  ];
}

function getPfitzStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, compliance, activities } = input;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  // LT-tempo pace: Pfitzinger tempo is at lactate threshold (faster than MP)
  const tempo = qualitySessions(compliance, 'tempo');
  let ltPaceVal = '—';
  let ltUnit: string | undefined;
  let ltSubline = 'no LT yet';
  let ltStatus: StatStatus = 'neutral';

  if (tempo.length > 0) {
    const avg =
      tempo.reduce((s, x) => s + (x.actualPaceSpk ?? 0), 0) / tempo.length;
    ltPaceVal = fmtSpk(avg);
    ltUnit = '/km';
    const zone = tempo[0].target.paceZone;
    if (zone) {
      ltSubline = `LT band ${fmtSpk(zone.minSpk)}–${fmtSpk(zone.maxSpk)}`;
      ltStatus = paceStatus(avg, zone);
    } else {
      ltSubline = 'LT completed';
      ltStatus = 'ok';
    }
  }

  // Medium-long runs: 16+ km that aren't the long run itself
  const runs = activities.filter(
    (a) => a.type === 'Run' || a.type === 'VirtualRun' || a.type === 'TrailRun'
  );
  const medLongs = runs.filter((a) => {
    const km = (a.distanceM ?? 0) / 1000;
    return km >= 16 && km < stats.longRunKm - 0.5;
  });

  return [
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
    {
      label: 'LT pace',
      value: ltPaceVal,
      unit: ltUnit,
      subline: ltSubline,
      status: ltStatus,
    },
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget}`,
      status:
        stats.longRunKm >= template.longRunKmTarget * 0.9 ? 'ok' : 'neutral',
    },
    {
      label: 'medium-long',
      value: String(medLongs.length),
      subline: '16+ km runs (not long run)',
      status: medLongs.length > 0 ? 'ok' : 'neutral',
    },
  ];
}

function getDanielsStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, compliance, template, vdot } = input;

  // T-pace (threshold) sessions
  const tSessions = qualitySessions(compliance, 'tempo');
  let tVal = '—';
  let tUnit: string | undefined;
  let tSubline = 'no T-pace yet';
  let tStatus: StatStatus = 'neutral';

  if (tSessions.length > 0) {
    const avg =
      tSessions.reduce((s, x) => s + (x.actualPaceSpk ?? 0), 0) / tSessions.length;
    tVal = fmtSpk(avg);
    tUnit = '/km';
    const zone = tSessions[0].target.paceZone;
    if (zone) {
      tSubline = `T-band ${fmtSpk(zone.minSpk)}–${fmtSpk(zone.maxSpk)}`;
      tStatus = paceStatus(avg, zone);
    } else {
      tSubline = 'T-pace completed';
      tStatus = 'ok';
    }
  }

  // I-pace (interval) sessions
  const iSessions = qualitySessions(compliance, 'interval');
  let iVal = '—';
  let iUnit: string | undefined;
  let iSubline = 'no I-pace yet';
  let iStatus: StatStatus = 'neutral';

  if (iSessions.length > 0) {
    const avg =
      iSessions.reduce((s, x) => s + (x.actualPaceSpk ?? 0), 0) / iSessions.length;
    iVal = fmtSpk(avg);
    iUnit = '/km';
    const zone = iSessions[0].target.paceZone;
    if (zone) {
      iSubline = `I-band ${fmtSpk(zone.minSpk)}–${fmtSpk(zone.maxSpk)}`;
      iStatus = paceStatus(avg, zone);
    } else {
      iSubline = 'I-pace completed';
      iStatus = 'ok';
    }
  }

  return [
    {
      label: 'T-pace',
      value: tVal,
      unit: tUnit,
      subline: tSubline,
      status: tStatus,
    },
    {
      label: 'I-pace',
      value: iVal,
      unit: iUnit,
      subline: iSubline,
      status: iStatus,
    },
    {
      label: 'VDOT',
      value: vdot != null ? String(Math.round(vdot)) : '—',
      subline: vdot != null ? 'current fitness' : 'no estimate yet',
      status: vdot != null ? 'ok' : 'neutral',
    },
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget}`,
      status: 'neutral',
    },
  ];
}

function getLydiardStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, programPhase, intensityDist } = input;

  const weeksLeft =
    programPhase.daysToRace != null
      ? Math.ceil(programPhase.daysToRace / 7)
      : null;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  const aerobicPct = intensityDist?.easyPct ?? null;

  return [
    {
      label: 'phase',
      value: template.phaseName,
      subline:
        weeksLeft != null
          ? `${weeksLeft} wk${weeksLeft === 1 ? '' : 's'} to race`
          : programPhase.label,
      status: 'neutral',
    },
    {
      label: 'aerobic volume',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget}`,
      status:
        stats.longRunKm >= template.longRunKmTarget * 0.9 ? 'ok' : 'neutral',
    },
    {
      label: 'aerobic %',
      value: aerobicPct != null ? `${aerobicPct}%` : '—',
      subline: 'time at easy intensity',
      status:
        aerobicPct != null
          ? aerobicPct >= 80
            ? 'ok'
            : aerobicPct >= 65
            ? 'warn'
            : 'miss'
          : 'neutral',
    },
  ];
}

function getHigdonStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template, programPhase } = input;

  const weekNum =
    programPhase.programWeekNumber ?? template.weekNumber;
  // Higdon uses a down week every 4th week (weeks 4, 8, 12, ...)
  const isDownWeek = weekNum > 0 && weekNum % 4 === 0;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  return [
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget}`,
      status:
        stats.longRunKm >= template.longRunKmTarget * 0.85 ? 'ok' : 'neutral',
    },
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
    {
      label: 'week type',
      value: isDownWeek ? 'down' : 'build',
      subline: `week ${weekNum}`,
      status: 'neutral',
    },
    {
      label: 'sessions',
      value: String(stats.totalSessions),
      subline: 'completed',
      status: stats.totalSessions > 0 ? 'ok' : 'neutral',
    },
  ];
}

function getPolarisedStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { intensityDist, stats, template } = input;
  if (!intensityDist || intensityDist.totalRunMin === 0)
    return getGenericStats(input);

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  return [
    {
      label: 'easy %',
      value: `${intensityDist.easyPct}%`,
      subline: 'target ≥80%',
      status:
        intensityDist.easyPct >= 80
          ? 'ok'
          : intensityDist.easyPct >= 70
          ? 'warn'
          : 'miss',
    },
    {
      label: 'hard %',
      value: `${intensityDist.hardPct}%`,
      subline: 'target ~20%',
      status:
        intensityDist.hardPct >= 15 && intensityDist.hardPct <= 25
          ? 'ok'
          : intensityDist.hardPct > 0 && intensityDist.hardPct < 15
          ? 'warn'
          : 'neutral',
    },
    {
      label: 'grey zone',
      value: `${intensityDist.greyPct}%`,
      subline: 'target ≈0%',
      status:
        intensityDist.greyPct <= 5
          ? 'ok'
          : intensityDist.greyPct <= 15
          ? 'warn'
          : 'miss',
    },
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
  ];
}

function getUltraStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template } = input;

  const timeOnFeetHrs = stats.totalMovingTimeS / 3600;
  const elevGainM = stats.totalElevationGainM;
  const b2bKm = stats.backToBackKm;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;

  return [
    {
      label: 'time on feet',
      value: timeOnFeetHrs > 0 ? timeOnFeetHrs.toFixed(1) : '0.0',
      unit: 'hrs',
      subline: 'moving time this week',
      status: timeOnFeetHrs > 0 ? 'ok' : 'neutral',
    },
    {
      label: 'vertical gain',
      value: elevGainM > 0 ? Math.round(elevGainM).toString() : '0',
      unit: 'm',
      subline: 'elevation this week',
      status: 'neutral',
    },
    {
      label: 'back-to-back',
      value: b2bKm > 0 ? b2bKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: 'Sat + Sun combined',
      status: b2bKm > 0 ? 'ok' : 'neutral',
    },
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
  ];
}

function getGenericStats(input: FrameworkStatsInput): FrameworkStat[] {
  const { stats, template } = input;

  const volPct =
    template.totalKmTarget > 0
      ? Math.round((stats.totalKm / template.totalKmTarget) * 100)
      : null;
  const longPct =
    template.longRunKmTarget > 0
      ? Math.round((stats.longRunKm / template.longRunKmTarget) * 100)
      : null;

  return [
    {
      label: 'this week',
      value: stats.totalKm > 0 ? stats.totalKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.totalKmTarget} · ${volPct ?? 0}%`,
      status: volStatus(volPct),
    },
    {
      label: 'long run',
      value: stats.longRunKm > 0 ? stats.longRunKm.toFixed(1) : '0.0',
      unit: 'km',
      subline: `target ${template.longRunKmTarget} · ${longPct != null ? longPct + '%' : '—'}`,
      status: 'neutral',
    },
    {
      label: 'avg pace',
      value: stats.avgPaceSpk ? fmtSpk(stats.avgPaceSpk) : '—:—',
      unit: stats.avgPaceSpk ? '/km' : undefined,
      subline: `${stats.totalSessions} session${stats.totalSessions === 1 ? '' : 's'} this week`,
      status: 'neutral',
    },
    {
      label: 'avg HR',
      value: stats.avgHr ? Math.round(stats.avgHr).toString() : '—',
      unit: stats.avgHr ? 'bpm' : undefined,
      subline: stats.avgHr ? 'weighted by time' : 'no HR data',
      status: 'neutral',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                    */
/* -------------------------------------------------------------------------- */

export function getFrameworkStats(input: FrameworkStatsInput): FrameworkStat[] {
  switch (input.dojo) {
    case 'norwegian-singles':
      return getNsStats(input);
    case 'hansons':
      return getHansonsStats(input);
    case 'pfitzinger':
      return getPfitzStats(input);
    case 'daniels':
      return getDanielsStats(input);
    case 'lydiard':
      return getLydiardStats(input);
    case 'higdon':
      return getHigdonStats(input);
    case 'polarised':
      return getPolarisedStats(input);
    case 'ultra':
      return getUltraStats(input);
    case 'custom':
    default:
      return getGenericStats(input);
  }
}
