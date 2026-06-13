import { NextResponse, type NextRequest } from 'next/server';
import { startInitial90dSync, startIncrementalSync } from '@/lib/actions/sync';

/**
 * POST /api/strava/sync
 *
 * Form-submitted from the wizard's last step. Kicks off an initial_90d job
 * and redirects to the live progress page. The POST returns quickly because
 * `startInitial90dSync` doesn't await the runner (fire-and-forget).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const full = formData.get('full') === 'true';

  try {
    const { jobId } = full ? await startInitial90dSync() : await startIncrementalSync();
    return NextResponse.redirect(
      new URL(`/setup/sync?jobId=${jobId}`, req.url),
      { status: 303 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync_failed';
    return NextResponse.redirect(
      new URL(`/setup/sync?error=${encodeURIComponent(msg)}`, req.url),
      { status: 303 }
    );
  }
}

/** GET — returns JSON for client-triggered manual sync */
export async function GET() {
  try {
    const { jobId } = await startIncrementalSync();
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
