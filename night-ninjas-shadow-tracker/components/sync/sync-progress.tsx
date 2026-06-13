'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Pause, Loader2 } from 'lucide-react';

interface SyncStatus {
  job: {
    id: number;
    jobType: 'initial_90d' | 'extended_history' | 'incremental';
    status: 'pending' | 'running' | 'paused' | 'rate_limited' | 'completed' | 'failed';
    pagesFetched: number;
    added: number;
    updated: number;
    oldestFetched: string | null;
    newestFetched: string | null;
    rateLimitResetsAt: string | null;
    errorMessage: string | null;
  } | null;
  totalActivities: number;
}

const TERMINAL = new Set(['completed', 'failed']);

/**
 * Live progress display for a sync job. Polls /api/strava/sync/status
 * every second until the job hits a terminal state.
 */
export function SyncProgress({ jobId }: { jobId: number }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/strava/sync/status?jobId=${jobId}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as SyncStatus;
        if (cancelled) return;
        setStatus(data);
        if (data.job && !TERMINAL.has(data.job.status)) {
          timer = setTimeout(poll, 1000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (!status?.job) {
    return (
      <div className="flex items-center gap-3 text-bone-dim">
        <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
        <span className="font-mono text-sm">Initialising…</span>
      </div>
    );
  }

  const job = status.job;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {job.status === 'running' && (
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-accent" />
        )}
        {job.status === 'completed' && (
          <CheckCircle2 size={18} strokeWidth={1.5} className="text-signal-ok" />
        )}
        {job.status === 'failed' && (
          <AlertTriangle size={18} strokeWidth={1.5} className="text-accent" />
        )}
        {(job.status === 'paused' || job.status === 'rate_limited') && (
          <Pause size={18} strokeWidth={1.5} className="text-signal-warn" />
        )}
        <span className="font-display tracking-wide-display uppercase text-base">
          {labelFor(job.status, job.jobType)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
        <Cell label="ADDED" value={job.added.toString()} />
        <Cell label="UPDATED" value={job.updated.toString()} />
        <Cell label="PAGES" value={job.pagesFetched.toString()} />
        <Cell label="TOTAL IN DB" value={status.totalActivities.toString()} accent />
      </div>

      {(job.oldestFetched || job.newestFetched) && (
        <div className="font-mono text-xs text-bone-dim leading-relaxed">
          range:{' '}
          <span className="text-bone tabular-nums">
            {job.oldestFetched ?? '—'}
          </span>
          {' → '}
          <span className="text-bone tabular-nums">
            {job.newestFetched ?? '—'}
          </span>
        </div>
      )}

      {job.status === 'rate_limited' && job.rateLimitResetsAt && (
        <div className="border border-signal-warn/40 bg-ink-shadow p-3 font-mono text-xs text-bone-dim">
          <div className="text-signal-warn mb-1">RATE LIMITED</div>
          Strava rate limit hit. Resumes at {new Date(job.rateLimitResetsAt).toLocaleTimeString()}.
        </div>
      )}

      {job.status === 'failed' && job.errorMessage && (
        <div className="border border-accent/40 bg-ink-shadow p-3 font-mono text-xs text-bone-dim">
          <div className="text-accent mb-1">FAILED</div>
          {job.errorMessage}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-ink p-4">
      <div className="nn-caps text-[10px]">{label}</div>
      <div
        className={
          'font-mono tabular-nums text-2xl mt-1 ' +
          (accent ? 'text-accent' : 'text-bone')
        }
      >
        {value}
      </div>
    </div>
  );
}

function labelFor(status: string, jobType: string): string {
  if (status === 'running' && jobType === 'initial_90d') return 'Pulling last 90 days';
  if (status === 'running' && jobType === 'extended_history') return 'Pulling full history';
  if (status === 'running' && jobType === 'incremental') return 'Syncing new activities';
  if (status === 'completed' && jobType === 'initial_90d') return '90-day sync complete';
  if (status === 'completed') return 'Sync complete';
  if (status === 'paused') return 'Paused';
  if (status === 'rate_limited') return 'Rate limited';
  if (status === 'failed') return 'Failed';
  return status;
}
