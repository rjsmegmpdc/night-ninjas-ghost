import { query } from '@/db/client';

export interface ActivityForReview {
  stravaId: number;
  name: string | null;
  type: string;
  date: string;
  distanceKm: number;
  movingTimeS: number;
  avgHr: number | null;
  avgSpeedMs: number | null;
}

/** Fetch the most recently synced activity for coach review */
export async function getLatestActivityForReview(): Promise<ActivityForReview | null> {
  const rows = await query(
    `SELECT strava_id, name, type, start_date, distance, moving_time, average_heartrate, average_speed
     FROM activities ORDER BY start_date DESC LIMIT 1`,
    []
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    stravaId: r[0] as number,
    name: r[1] as string | null,
    type: r[2] as string,
    date: (r[3] as string).slice(0, 10),
    distanceKm: ((r[4] as number) ?? 0) / 1000,
    movingTimeS: (r[5] as number) ?? 0,
    avgHr: r[6] as number | null,
    avgSpeedMs: r[7] as number | null,
  };
}

/** Build a text description of an activity for the coach */
export function activityToCoachContext(a: ActivityForReview): string {
  const pace = a.avgSpeedMs && a.avgSpeedMs > 0
    ? (() => {
        const spk = 1000 / a.avgSpeedMs!;
        return `${Math.floor(spk / 60)}:${Math.round(spk % 60).toString().padStart(2, '0')}/km`;
      })()
    : '—';
  const mins = Math.round(a.movingTimeS / 60);
  return [
    `Latest activity: ${a.date} ${a.type}${a.name ? ` "${a.name}"` : ''}`,
    `Distance: ${a.distanceKm.toFixed(2)}km | Time: ${mins}min | Avg pace: ${pace}${a.avgHr ? ` | Avg HR: ${Math.round(a.avgHr)}bpm` : ''}`,
  ].join('\n');
}

export interface ComplianceWeekResult {
  weekStart: string;
  sessionsCompleted: number;
  sessionsPlanned: number;
  missedCount: number;
  complianceScore: number; // 0-1
  needsCoaching: boolean;  // true if score < 0.6
}

/** Check last completed week's compliance */
export async function checkLastWeekCompliance(): Promise<ComplianceWeekResult | null> {
  // Get Monday of last week
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - dayOfWeek - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const weekStart = fmt(lastMonday);
  const weekEnd = fmt(lastSunday);

  const rows = await query(
    `SELECT COUNT(*) FROM activities
     WHERE start_date >= ? AND start_date <= ?
     AND type IN ('Run','VirtualRun','TrailRun','Walk')`,
    [weekStart, weekEnd + 'T99:99:99']
  );

  const completed = (rows[0]?.[0] as number) ?? 0;
  const planned = 5; // default; plan engine would give better number
  const score = Math.min(1, completed / planned);
  const missed = Math.max(0, planned - completed);

  return {
    weekStart,
    sessionsCompleted: completed,
    sessionsPlanned: planned,
    missedCount: missed,
    complianceScore: score,
    needsCoaching: score < 0.6,
  };
}

/** Parse [ADJUST] marker from coach response */
export interface CoachAdjustment {
  type: 'reduce_load' | 'extend_recovery' | 'change_dojo' | 'none';
  params: Record<string, string>;
  reason: string;
}

export function parseAdjustmentMarker(response: string): CoachAdjustment | null {
  const match = response.match(/\[ADJUST:\s*([^\]]+)\]/);
  if (!match) return null;

  const parts = match[1].split('|').map(s => s.trim());
  const type = parts[0] as CoachAdjustment['type'];
  const params: Record<string, string> = {};
  let reason = '';

  for (const part of parts.slice(1)) {
    const kv = part.match(/^(\w+)="?([^"]*)"?$/);
    if (kv) {
      if (kv[1] === 'reason') reason = kv[2];
      else params[kv[1]] = kv[2];
    }
  }

  return { type, params, reason };
}
