import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { SyncProgress } from '@/components/sync/sync-progress';

const STEPS = ['Welcome', 'Strava App', 'Connect', 'Dojo', 'Races', 'Weekly', 'Sync'];

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const jobId = sp.jobId ? parseInt(sp.jobId, 10) : null;
  const error = sp.error;

  return (
    <div className="space-y-10">
      <Stepper steps={STEPS} current={7} />

      <div className="space-y-3">
        <span className="nn-caps">step 07 — initial sync</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Pull your<br />history
        </h1>
        <p className="text-bone-dim max-w-2xl">
          Shadow Tracker pulls your last 90 days from Strava as a meaningful
          starting point. Once that completes, you can pull the full archive
          from the Settings page when you're ready.
        </p>
      </div>

      {!jobId && !error && (
        <Card className="space-y-6 max-w-xl">
          <div>
            <CardLabel>about the initial sync</CardLabel>
          </div>
          <ul className="space-y-3 text-bone-dim text-sm">
            <li className="flex gap-3">
              <span className="text-accent font-mono">▸</span>
              <span>Pulls the last 90 days of activities — meaningful start position.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent font-mono">▸</span>
              <span>Captures all activity types (runs, rides, swims, workouts, etc).</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent font-mono">▸</span>
              <span>Resumable — if interrupted by network drop or rate limit, pick up where you left off.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent font-mono">▸</span>
              <span>Takes ~30 seconds for most users.</span>
            </li>
          </ul>

          <form action="/api/strava/sync" method="POST" className="pt-2">
            <input type="hidden" name="full" value="true" />
            <Button variant="critical" size="lg" type="submit" className="w-full">
              Begin Sync
            </Button>
          </form>
        </Card>
      )}

      {jobId && (
        <Card className="space-y-6 max-w-2xl">
          <CardLabel>live progress</CardLabel>
          <SyncProgress jobId={jobId} />

          <div className="pt-4 border-t border-ink-line space-y-3">
            <div className="font-mono text-xs text-bone-mute leading-relaxed">
              ↳ once complete, you can pull deeper history from the Settings page
            </div>
            <Link href="/patrol">
              <Button variant="primary" size="md">Continue to Patrol →</Button>
            </Link>
          </div>
        </Card>
      )}

      {error && (
        <Card className="space-y-4 max-w-xl border-accent/40">
          <CardLabel className="text-accent">sync failed</CardLabel>
          <div className="font-mono text-xs text-bone-dim">{error}</div>
          <form action="/api/strava/sync" method="POST">
            <input type="hidden" name="full" value="true" />
            <Button variant="outline" size="md" type="submit">Retry</Button>
          </form>
        </Card>
      )}

      <div className="flex items-center justify-start">
        <Link href="/setup/weekly">
          <Button variant="ghost">← Back</Button>
        </Link>
      </div>
    </div>
  );
}
