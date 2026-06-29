import type { WeekTemplate, SessionTarget } from '@/lib/plans/types';
import type { Activity } from '@/lib/db/schema';

export type ComplianceFlag = 'ok' | 'warn' | 'miss' | 'fast' | 'slow' | 'short' | 'none';

export interface SessionCompliance {
  target: SessionTarget;
  flag: ComplianceFlag;
  actualPaceSpk?: number;
  actualKm?: number;
  actualMins?: number;
  message: string;
}

export interface DayCompliance {
  dow: number;
  sessions: SessionCompliance[];
}

export interface WeekCompliance {
  weekTemplate: WeekTemplate;
  totalKmActual: number;
  longRunKmActual: number;
  daysWithSessions: number;
  days: DayCompliance[];
}

function paceSpkFromSpeed(avgSpeedMs: number | null): number | null {
  if (!avgSpeedMs || avgSpeedMs <= 0) return null;
  return 1000 / avgSpeedMs;
}

function dowOf(isoLocal: string): number {
  const d = new Date(isoLocal);
  const js = d.getDay();
  return (js + 6) % 7;
}

export function evaluateWeek(
  template: WeekTemplate,
  activities: Activity[]
): WeekCompliance {
  const byDow = new Map<number, Activity[]>();
  for (const a of activities) {
    const d = dowOf(a.startDateLocal);
    const arr = byDow.get(d) ?? [];
    arr.push(a);
    byDow.set(d, arr);
  }

  const totalKm = activities
    .filter((a) => a.type === 'Run' || a.type === 'VirtualRun')
    .reduce((sum, a) => sum + (a.distanceM ?? 0) / 1000, 0);
  const longRun = Math.max(
    0,
    ...activities
      .filter((a) => a.type === 'Run' || a.type === 'VirtualRun')
      .map((a) => (a.distanceM ?? 0) / 1000)
  );

  const days: DayCompliance[] = template.days.map((day) => ({
    dow: day.dow,
    sessions: day.sessions.map((target) =>
      evaluateSession(target, byDow.get(day.dow) ?? [])
    ),
  }));

  return {
    weekTemplate: template,
    totalKmActual: totalKm,
    longRunKmActual: longRun,
    daysWithSessions: byDow.size,
    days,
  };
}

function evaluateSession(target: SessionTarget, dayActivities: Activity[]): SessionCompliance {
  if (target.type === 'rest') {
    return { target, flag: 'ok', message: 'Rest day' };
  }

  if (target.type === 'cross' || target.type === 'strength') {
    const matching = dayActivities.filter((a) =>
      target.type === 'cross'
        ? ['Ride', 'VirtualRide', 'Swim', 'Workout'].includes(a.type)
        : a.type === 'WeightTraining'
    );
    const totalMins = matching.reduce((s, a) => s + (a.movingTimeS ?? 0) / 60, 0);
    if (totalMins === 0) return { target, flag: 'none', message: 'No session recorded' };
    const tgtMin = target.durationMinMin ?? 0;
    if (totalMins < tgtMin) {
      return {
        target,
        flag: 'short',
        actualMins: totalMins,
        message: `Short — ${totalMins.toFixed(0)} min vs target ${tgtMin}+`,
      };
    }
    return { target, flag: 'ok', actualMins: totalMins, message: `${totalMins.toFixed(0)} min` };
  }

  const runs = dayActivities.filter((a) => a.type === 'Run' || a.type === 'VirtualRun');
  if (runs.length === 0) {
    return { target, flag: 'none', message: 'No session recorded' };
  }

  let best = runs[0];
  if (target.paceZone) {
    const centre = (target.paceZone.minSpk + target.paceZone.maxSpk) / 2;
    best = runs.reduce((acc, r) => {
      const accPace = paceSpkFromSpeed(acc.avgSpeedMs);
      const rPace = paceSpkFromSpeed(r.avgSpeedMs);
      if (rPace == null) return acc;
      if (accPace == null) return r;
      return Math.abs(rPace - centre) < Math.abs(accPace - centre) ? r : acc;
    });
  }

  const pace = paceSpkFromSpeed(best.avgSpeedMs);
  const km = (best.distanceM ?? 0) / 1000;

  if (target.paceZone && pace != null) {
    if (pace < target.paceZone.minSpk) {
      return { target, flag: 'fast', actualPaceSpk: pace, actualKm: km, message: 'Faster than band' };
    }
    if (pace > target.paceZone.maxSpk) {
      return { target, flag: 'slow', actualPaceSpk: pace, actualKm: km, message: 'Slower than band' };
    }
  }

  return {
    target,
    flag: 'ok',
    actualPaceSpk: pace ?? undefined,
    actualKm: km,
    message: 'On target',
  };
}
