'use client';

import { useState } from 'react';
import { Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startGearBackfill } from '@/lib/actions/shoes';

/**
 * Backfill button — kicks off a `gear_backfill` sync_jobs run that calls
 * Strava per-activity to populate gear_id on historical activities.
 *
 * Shows a count of activities still needing backfill so the user knows
 * the size of the work upfront. After triggering, the standard sync
 * banner in Patrol/Calendar shows progress.
 */
export function GearBackfillButton({
  pendingCount,
}: {
  pendingCount: number;
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'started' | 'failed'>('idle');

  const trigger = async () => {
    setState('starting');
    try {
      await startGearBackfill();
      setState('started');
    } catch {
      setState('failed');
    }
  };

  if (pendingCount === 0) {
    return (
      <div className="font-mono text-sm text-bone-dim flex items-center gap-2">
        <Footprints size={14} strokeWidth={1.5} className="text-signal-ok" />
        ↳ all activities have gear data
      </div>
    );
  }

  if (state === 'started') {
    return (
      <div className="font-mono text-sm text-signal-ok">
        ↳ backfill started — watch progress on Patrol or Calendar
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="space-y-2">
        <span className="font-mono text-sm text-accent">backfill failed to start</span>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={trigger}
        disabled={state === 'starting'}
        className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-bone-dim hover:text-bone transition-colors border border-bone-dim hover:border-bone px-4 py-2 disabled:opacity-50"
      >
        <Footprints size={14} strokeWidth={1.5} />
        {state === 'starting' ? 'Starting…' : 'Backfill shoe data'}
      </button>
      <p className="font-mono text-xs text-bone-mute leading-relaxed">
        ↳ {pendingCount} activities need gear data fetched from Strava (1 API call each).
        Pauses automatically if rate-limited.
      </p>
    </div>
  );
}
