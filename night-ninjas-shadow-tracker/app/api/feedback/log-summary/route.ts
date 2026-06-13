import { NextResponse } from 'next/server';
import { summariseLog } from '@/lib/store/usage-log';

/**
 * GET /api/feedback/log-summary
 *
 * Returns metadata about the current usage log file for display in the
 * feedback modal. Tells the user what they're attaching.
 */
export async function GET() {
  const summary = summariseLog();
  return NextResponse.json(summary);
}
