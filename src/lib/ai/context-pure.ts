import type { FormClass } from '@/lib/analysis/athlete-state-pure';

export interface RecentActivitySnapshot {
  date: string;
  type: string;
  name: string | null;
  distanceKm: number | null;
  avgPaceSpk: number | null;
  avgHr: number | null;
}

export interface ActiveInjurySnapshot {
  type: string;
  bodyRegion: string | null;
  severity: string;
  since: string;
}

export interface BiometricsSnapshot {
  rhrBpm: number | null;
  hrvMs: number | null;
  sleepDurationS: number | null;
  sleepScore: number | null;
  stressScore: number | null;
  bodyBattery: number | null;
}

export interface AthleteSnapshot {
  asOfIso: string;
  dojo: string;
  weekNumber: number | null;
  programWeeks: number | null;
  phaseKind: string;
  daysToRace: number | null;
  todaySession: { label: string; type: string; prescription: string } | null;
  week: {
    totalKm: number;
    longRunKm: number;
    avgPaceSpk: number | null;
    avgHr: number | null;
    sessions: number;
    targetKm: number;
  };
  state: {
    ctl: number;
    atl: number;
    tsb: number;
    formClass: FormClass;
    confidence: string;
  } | null;
  biometrics: BiometricsSnapshot | null;
  recentActivities: RecentActivitySnapshot[];
  activeInjuries: ActiveInjurySnapshot[];
  /** Coaching session history — injected for continuity across coach interactions. */
  coachingHistory?: {
    /** Summaries of the last 8 sessions (most recent first). */
    recentSessions: { type: string; date: string; summary: string }[];
    /** Distinct training methods used, most recent first. */
    dojoHistory: string[];
    /** Human-readable compliance pattern summary (e.g. "7/8 weeks compliant, 2 consecutive missed"). */
    compliancePattern: string;
  };
}

function fmtPace(spk: number | null): string {
  if (spk == null) return '—';
  const m = Math.floor(spk / 60);
  const s = Math.round(spk % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

export function snapshotToText(s: AthleteSnapshot): string {
  const lines: string[] = [];
  lines.push(`As of: ${s.asOfIso}`);
  lines.push(`Training method: ${s.dojo}`);
  if (s.weekNumber != null && s.programWeeks != null) {
    lines.push(`Program: week ${s.weekNumber} of ${s.programWeeks} (${s.phaseKind})`);
  } else {
    lines.push(`Program phase: ${s.phaseKind}`);
  }
  if (s.daysToRace != null) lines.push(`Days to goal race: ${s.daysToRace}`);
  if (s.todaySession) {
    lines.push(
      `Today's planned session: ${s.todaySession.label} — ${s.todaySession.prescription} (${s.todaySession.type})`
    );
  } else {
    lines.push(`Today: rest day`);
  }
  lines.push(
    `This week so far: ${s.week.totalKm.toFixed(1)}km of ${s.week.targetKm}km target, ` +
      `${s.week.sessions} session${s.week.sessions === 1 ? '' : 's'}, ` +
      `long run ${s.week.longRunKm.toFixed(1)}km, ` +
      `avg pace ${fmtPace(s.week.avgPaceSpk)}, ` +
      `avg HR ${s.week.avgHr ? Math.round(s.week.avgHr) + 'bpm' : '—'}`
  );
  if (s.state) {
    lines.push(
      `Freshness (PMC): CTL ${s.state.ctl.toFixed(0)}, ATL ${s.state.atl.toFixed(0)}, TSB ${s.state.tsb.toFixed(0)} ` +
        `(${s.state.formClass}; data confidence: ${s.state.confidence})`
    );
  }
  if (s.biometrics) {
    const b = s.biometrics;
    const parts: string[] = [];
    if (b.rhrBpm != null) parts.push(`RHR ${b.rhrBpm}bpm`);
    if (b.hrvMs != null) parts.push(`HRV ${b.hrvMs.toFixed(1)}ms`);
    if (b.sleepScore != null) parts.push(`sleep score ${b.sleepScore}/100`);
    if (b.sleepDurationS != null) parts.push(`sleep ${(b.sleepDurationS / 3600).toFixed(1)}h`);
    if (b.stressScore != null) parts.push(`stress ${b.stressScore}/100`);
    if (b.bodyBattery != null) parts.push(`body battery ${b.bodyBattery}/100`);
    if (parts.length > 0) lines.push(`Today's biometrics: ${parts.join(', ')}`);
  }
  if (s.recentActivities.length) {
    lines.push(`Last ${s.recentActivities.length} activities:`);
    for (const a of s.recentActivities) {
      lines.push(
        `  - ${a.date} ${a.type}${a.name ? ` "${a.name}"` : ''}: ` +
          `${a.distanceKm != null ? a.distanceKm.toFixed(1) + 'km' : '—'} @ ${fmtPace(a.avgPaceSpk)}` +
          `${a.avgHr ? `, ${Math.round(a.avgHr)}bpm` : ''}`
      );
    }
  }
  if (s.activeInjuries.length) {
    lines.push(`Active injuries/illness:`);
    for (const i of s.activeInjuries) {
      lines.push(
        `  - ${i.type} (${i.severity})${i.bodyRegion ? ` ${i.bodyRegion}` : ''}, since ${i.since}`
      );
    }
  } else {
    lines.push(`Active injuries/illness: none logged`);
  }
  const historySection = historyToText(s.coachingHistory);
  if (historySection) lines.push(historySection);
  return lines.join('\n');
}

/**
 * Serialise the optional coaching history block into prompt text.
 * Returns an empty string when there is no history to include.
 */
export function historyToText(h: AthleteSnapshot['coachingHistory']): string {
  if (!h) return '';
  const lines: string[] = ['--- Coaching history ---'];
  lines.push(
    `Training method history: ${h.dojoHistory.length ? h.dojoHistory.join(' → ') : 'none recorded'}`
  );
  lines.push(`Compliance pattern (last 8 weeks): ${h.compliancePattern}`);
  if (h.recentSessions.length > 0) {
    lines.push('Recent coaching sessions:');
    for (const s of h.recentSessions) {
      lines.push(`  [${s.date} ${s.type}] ${s.summary}`);
    }
  }
  return lines.join('\n');
}
