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
  recentActivities: RecentActivitySnapshot[];
  activeInjuries: ActiveInjurySnapshot[];
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
  return lines.join('\n');
}
