import { Pause, Loader2, AlertTriangle } from 'lucide-react';
import {
  detectInterruptedJobs,
  getActiveJob,
} from '@/lib/sources/sync-runner';
import { resumeJob, cancelJob } from '@/lib/actions/sync';

/**
 * Sync status banner — shown at the top of Patrol/Calendar when:
 *   - A sync job is currently running (informational)
 *   - A sync job is paused (offer Resume button)
 *   - A sync job is rate-limited (show countdown)
 *
 * If no active/paused/rate_limited job exists, this renders nothing.
 *
 * Side effect: calls detectInterruptedJobs() which marks any "running"
 * jobs without a recent heartbeat as "paused". Cheap, idempotent.
 */
export async function SyncStatusBanner() {
  // Self-heal interrupted jobs first
  await detectInterruptedJobs();
  const job = await getActiveJob();
  if (!job) return null;

  if (job.status === 'running') {
    return (
      <div className="border border-accent/40 bg-ink-shadow px-4 py-3 flex items-center gap-3 mb-6">
        <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-accent" />
        <div className="flex-1">
          <div className="font-display tracking-wide-display uppercase text-sm">
            Syncing {jobLabel(job.jobType)}
          </div>
          <div className="font-mono text-xs text-bone-dim mt-0.5">
            {job.added + job.updated} activities · {job.pagesFetched} pages
          </div>
        </div>
      </div>
    );
  }

  if (job.status === 'paused') {
    return (
      <div className="border border-signal-warn/40 bg-ink-shadow px-4 py-3 flex items-center gap-3 mb-6">
        <Pause size={16} strokeWidth={1.5} className="text-signal-warn" />
        <div className="flex-1">
          <div className="font-display tracking-wide-display uppercase text-sm text-signal-warn">
            Sync paused
          </div>
          <div className="font-mono text-xs text-bone-dim mt-0.5">
            {jobLabel(job.jobType)} · {job.added + job.updated} synced ·
            {job.oldestFetched ? ` oldest ${job.oldestFetched}` : ''}
          </div>
        </div>
        <form action={resumeJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            className="font-display tracking-wide-display uppercase text-xs px-3 py-1 border border-bone hover:bg-bone hover:text-ink transition-colors"
          >
            Resume
          </button>
        </form>
        <form action={cancelJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-accent transition-colors"
            title="Cancel"
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (job.status === 'rate_limited') {
    const resumesAt = job.rateLimitResetsAt
      ? new Date(job.rateLimitResetsAt).toLocaleTimeString()
      : 'soon';
    return (
      <div className="border border-signal-warn/40 bg-ink-shadow px-4 py-3 flex items-center gap-3 mb-6">
        <AlertTriangle size={16} strokeWidth={1.5} className="text-signal-warn" />
        <div className="flex-1">
          <div className="font-display tracking-wide-display uppercase text-sm text-signal-warn">
            Strava rate limit hit
          </div>
          <div className="font-mono text-xs text-bone-dim mt-0.5">
            Resumes at {resumesAt} · {job.added + job.updated} synced so far
          </div>
        </div>
        <form action={resumeJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            className="font-display tracking-wide-display uppercase text-xs px-3 py-1 border border-bone-dim text-bone-dim hover:bg-bone hover:text-ink hover:border-bone transition-colors"
          >
            Try resume
          </button>
        </form>
      </div>
    );
  }

  return null;
}

function jobLabel(jobType: string): string {
  switch (jobType) {
    case 'initial_90d':
      return 'last 90 days';
    case 'extended_history':
      return 'full history';
    case 'incremental':
      return 'recent activities';
    default:
      return jobType;
  }
}
