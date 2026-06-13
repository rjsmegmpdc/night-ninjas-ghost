import type { SyncJob } from '@/lib/db/schema';
import { resumeJob, cancelJob } from '@/lib/actions/sync';
import { CheckCircle2, AlertTriangle, Pause, Loader2, XCircle, Clock } from 'lucide-react';

/**
 * Sync jobs table — server component, takes the rows from listRecentJobs()
 * and renders them with appropriate icons + actions.
 *
 * For paused/rate_limited jobs, shows a Resume button.
 * For running jobs, shows live indicator (no client polling here — Patrol
 *   and Calendar already have the SyncStatusBanner for live progress).
 */
export function SyncJobsTable({ jobs }: { jobs: SyncJob[] }) {
  return (
    <div className="divide-y divide-ink-line border-y border-ink-line">
      {jobs.map((job) => (
        <Row key={job.id} job={job} />
      ))}
    </div>
  );
}

function Row({ job }: { job: SyncJob }) {
  const startedAt = job.startedAt instanceof Date
    ? job.startedAt.toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'unknown';

  return (
    <div className="py-3 grid grid-cols-[24px_120px_140px_100px_1fr_auto] gap-3 items-center">
      <StatusIcon status={job.status} />

      <span className="font-display tracking-wide-display uppercase text-xs text-bone">
        {jobLabel(job.jobType)}
      </span>

      <span className="font-mono text-xs text-bone-dim">
        {startedAt}
      </span>

      <span className={'font-mono text-xs ' + statusColor(job.status)}>
        {job.status}
      </span>

      <span className="font-mono text-xs text-bone-dim">
        {job.added + job.updated} synced · {job.pagesFetched} pages
        {job.oldestFetched && (
          <span className="ml-2 text-bone-mute">
            · oldest {job.oldestFetched}
          </span>
        )}
      </span>

      <div className="flex items-center gap-2 justify-end">
        {(job.status === 'paused' || job.status === 'rate_limited') && (
          <>
            <form action={resumeJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <button
                type="submit"
                className="font-display tracking-wide-display uppercase text-xs px-2 py-1 border border-bone-dim text-bone-dim hover:bg-bone hover:text-ink hover:border-bone transition-colors"
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
          </>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: SyncJob['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} strokeWidth={1.5} className="text-signal-ok" />;
    case 'running':
      return <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-accent" />;
    case 'paused':
      return <Pause size={14} strokeWidth={1.5} className="text-signal-warn" />;
    case 'rate_limited':
      return <Clock size={14} strokeWidth={1.5} className="text-signal-warn" />;
    case 'failed':
      return <XCircle size={14} strokeWidth={1.5} className="text-accent" />;
    case 'pending':
      return <Clock size={14} strokeWidth={1.5} className="text-bone-mute" />;
    default:
      return <AlertTriangle size={14} strokeWidth={1.5} className="text-bone-mute" />;
  }
}

function statusColor(status: SyncJob['status']): string {
  switch (status) {
    case 'completed':
      return 'text-signal-ok';
    case 'running':
      return 'text-accent';
    case 'paused':
    case 'rate_limited':
      return 'text-signal-warn';
    case 'failed':
      return 'text-accent';
    default:
      return 'text-bone-mute';
  }
}

function jobLabel(jobType: SyncJob['jobType']): string {
  switch (jobType) {
    case 'initial_90d':
      return 'last 90 days';
    case 'extended_history':
      return 'full history';
    case 'incremental':
      return 'incremental';
    default:
      return jobType;
  }
}
