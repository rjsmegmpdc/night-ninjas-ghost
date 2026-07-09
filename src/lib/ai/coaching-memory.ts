/**
 * coaching-memory.ts
 *
 * Persistent per-athlete coaching memory layer.
 * Reads/writes coach_sessions and builds the history context bundle
 * that is injected into every coach prompt.
 */

import { query, execBatch } from '@/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoachSession {
  id: number;
  sessionType: string;
  referenceDate: string;
  response: string;
  adjustmentJson: string | null;
  applied: boolean;
  createdAt: string;
}

export interface CoachingHistory {
  /** Last 8 sessions, most recent first */
  recentSessions: CoachSession[];
  /** Distinct dojos used, most recent first (up to 5) */
  dojoHistory: string[];
  /** Last 12 weeks of activity-based compliance */
  complianceRecord: { weekStart: string; score: number; missed: number }[];
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/** Save a completed coach interaction to persistent memory. */
export async function saveCoachSession(params: {
  sessionType: string;
  referenceDate: string;
  contextSnapshot?: string;
  response: string;
  adjustmentJson?: string | null;
}): Promise<void> {
  await execBatch([
    {
      sql: `INSERT INTO coach_sessions
              (session_type, reference_date, context_snapshot, response, adjustment_json)
            VALUES (?, ?, ?, ?, ?)`,
      params: [
        params.sessionType,
        params.referenceDate,
        params.contextSnapshot ?? null,
        params.response,
        params.adjustmentJson ?? null,
      ],
    },
  ]);
}

/** Mark a session's suggested adjustment as accepted and applied. */
export async function markAdjustmentApplied(sessionId: number): Promise<void> {
  await execBatch([
    {
      sql: `UPDATE coach_sessions SET applied = 1 WHERE id = ?`,
      params: [sessionId],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/** Load coaching history for context injection into the next coach prompt. */
export async function loadCoachingHistory(): Promise<CoachingHistory> {
  const [sessionRows, dojoRows] = await Promise.all([
    query(
      `SELECT id, session_type, reference_date, response, adjustment_json, applied, created_at
       FROM coach_sessions
       ORDER BY created_at DESC
       LIMIT 8`,
      []
    ),
    query(
      `SELECT DISTINCT p.dojo
       FROM plans p
       JOIN plan_periods pp ON pp.plan_id = p.id
       ORDER BY pp.start_date DESC
       LIMIT 5`,
      []
    ),
  ]);

  const recentSessions: CoachSession[] = sessionRows.map((r) => ({
    id:             r[0] as number,
    sessionType:    r[1] as string,
    referenceDate:  r[2] as string,
    response:       r[3] as string,
    adjustmentJson: r[4] as string | null,
    applied:        Boolean(r[5]),
    createdAt:      r[6] as string,
  }));

  const dojoHistory = dojoRows.map((r) => r[0] as string);

  const complianceRecord = await buildComplianceRecord();

  return { recentSessions, dojoHistory, complianceRecord };
}

// ---------------------------------------------------------------------------
// Per-day note types and loader
// (Stub implementations — real versions land from feat/coaching-notes-backend)
// ---------------------------------------------------------------------------

export interface DayNote {
  sessionType: string;
  referenceDate: string; // ISO date YYYY-MM-DD
  response: string;      // the stored coach text
}

/**
 * Load all coach notes for a given week (Mon–Sun).
 * Excludes weekly_tldr entries so dots only reflect per-day coaching.
 * Returns empty array if none stored.
 *
 * Stub: returns [] until coach_sessions table rows exist.
 * The real implementation on feat/coaching-notes-backend queries the DB.
 */
export async function loadWeekNotes(
  weekStart: string,
  weekEnd: string,
): Promise<DayNote[]> {
  const rows = await query(
    `SELECT session_type, reference_date, response
     FROM coach_sessions
     WHERE reference_date >= ? AND reference_date <= ?
       AND session_type != 'weekly_tldr'
     ORDER BY reference_date ASC`,
    [weekStart, weekEnd],
  ).catch(() => [] as unknown[][]);
  return rows.map((r) => ({
    sessionType: r[0] as string,
    referenceDate: r[1] as string,
    response: r[2] as string,
  }));
}

/** Check if a weekly TLDR has already been generated for this week. */
export async function hasWeekTldr(weekStart: string): Promise<boolean> {
  const rows = await query(
    `SELECT id FROM coach_sessions
     WHERE reference_date = ? AND session_type = 'weekly_tldr' LIMIT 1`,
    [weekStart]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Compliance record builder
// ---------------------------------------------------------------------------

/**
 * Builds a 12-week activity-based compliance record.
 *
 * Uses a simple heuristic: ≥4 running sessions/week = fully compliant,
 * 3 = mostly compliant, 2 = partial, <2 = poor.  The target of 5 sessions
 * per week drives the `missed` count.
 */
async function buildComplianceRecord(): Promise<
  { weekStart: string; score: number; missed: number }[]
> {
  const rows = await query(
    `SELECT strftime('%Y-%W', start_date) AS week, COUNT(*) AS count
     FROM activities
     WHERE start_date >= date('now', '-84 days')
       AND type IN ('Run', 'VirtualRun', 'TrailRun', 'Walk')
     GROUP BY week
     ORDER BY week DESC
     LIMIT 12`,
    []
  );

  return rows.map((r) => {
    const count = r[1] as number;
    const score =
      count >= 4 ? 1.0 :
      count >= 3 ? 0.75 :
      count >= 2 ? 0.5 :
                   0.25;
    const missed = Math.max(0, 5 - count);
    return { weekStart: r[0] as string, score, missed };
  });
}
