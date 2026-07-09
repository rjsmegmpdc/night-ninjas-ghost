/**
 * _coaching-stubs.ts
 *
 * Temporary type stubs for teammate-owned exports that are being built in
 * parallel on feat/coaching-notes-backend and will land on main before this
 * branch merges.
 *
 * PatrolPage imports from the REAL module paths:
 *   '@/lib/ai/coaching-memory'
 *   '@/lib/ai/coach-triggers'
 *
 * These stubs are re-exported here only so that `npx tsc -b` passes before
 * the real implementations exist on this branch.  They are NOT imported by
 * PatrolPage itself.
 */

// ---------------------------------------------------------------------------
// coaching-memory stubs
// ---------------------------------------------------------------------------

export interface DayNote {
  sessionType: string;
  referenceDate: string; // ISO date YYYY-MM-DD
  response: string;      // the stored coach text
}

export async function loadWeekNotes(
  _weekStart: string,
  _weekEnd: string,
): Promise<DayNote[]> {
  // Real implementation lives in coaching-memory.ts (teammate branch)
  return [];
}

// ---------------------------------------------------------------------------
// coach-triggers stubs
// ---------------------------------------------------------------------------

export function buildWeekTldrPrompt(
  _weekStart: string,
  _notes: DayNote[],
): { context: string; question: string } {
  // Real implementation lives in coach-triggers.ts (teammate branch)
  return { context: '', question: '' };
}

export function getWeekBounds(
  _fromDate: Date,
): { weekStart: string; weekEnd: string } {
  // Real implementation lives in coach-triggers.ts (teammate branch)
  const d = new Date(_fromDate);
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  const weekStart = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const weekEnd = d.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}
