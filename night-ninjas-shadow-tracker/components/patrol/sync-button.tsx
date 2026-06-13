'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2 } from 'lucide-react';
import { startIncrementalSync } from '@/lib/actions/sync';

/**
 * SyncButton — compact "Sync now" control on Patrol header.
 *
 * Click → starts incremental Strava sync via existing action. Component
 * then polls /api/strava/sync/status every 1s until job state flips to
 * 'complete' or 'error' or 'paused', at which point router.refresh()
 * is called to re-render the page with fresh data.
 *
 * Self-correcting: if the page reloads (or component re-mounts) while
 * a sync is already running (e.g. from another tab or the wizard),
 * the polling picks up automatically via the initial /status check.
 */
export function SyncButton() {
  const router = useRouter();
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // On mount, check whether a sync is already running and start polling
  // if so. Single shot — useEffect with empty deps.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/strava/sync/status')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.job?.status === 'running') {
          startPolling();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (intervalRef.current !== null) return;
    setIsPolling(true);
    intervalRef.current = window.setInterval(async () => {
      try {
        const r = await fetch('/api/strava/sync/status');
        const data = await r.json();
        const status = data.job?.status;
        if (status !== 'running') {
          // Done (complete | error | paused | rate_limited) — stop polling
          // and refresh the page so the matrix + stats pick up new data
          stopPolling();
          if (status === 'complete') {
            router.refresh();
          }
        }
      } catch {
        // Network error — keep polling, transient
      }
    }, 1000);
  }

  function stopPolling() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }

  async function handleClick() {
    if (isPolling) return; // Already syncing, don't queue another
    try {
      await startIncrementalSync();
      startPolling();
    } catch (e) {
      console.error('Failed to start sync', e);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPolling}
      className={
        'inline-flex items-center gap-1.5 px-3 py-1.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
        (isPolling
          ? 'border-accent/60 text-accent cursor-wait'
          : 'border-ink-line text-bone-dim hover:border-accent hover:text-accent')
      }
      title={isPolling ? 'Syncing — page will refresh on completion' : 'Pull latest activities from Strava'}
    >
      {isPolling ? (
        <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <RefreshCw size={11} strokeWidth={1.5} />
      )}
      {isPolling ? 'Syncing...' : 'Sync'}
    </button>
  );
}
