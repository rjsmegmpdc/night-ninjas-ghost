'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { disconnectStrava, wipeEverything } from '@/lib/actions/settings-admin';

/**
 * Disconnect Strava — two-click confirmation:
 *   click 1: shows the warning + "I'm sure" button
 *   click 2: submits the form with confirm=disconnect
 */
export function DisconnectStravaForm() {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="font-display tracking-wide-display uppercase text-sm text-bone-mute hover:text-accent transition-colors"
      >
        Disconnect
      </button>
    );
  }

  return (
    <form action={disconnectStrava} className="flex items-center gap-3">
      <input type="hidden" name="confirm" value="disconnect" />
      <span className="font-mono text-xs text-bone-dim">
        ↳ clears tokens. activity data stays.
      </span>
      <Button variant="critical" size="sm" type="submit">
        Yes, disconnect
      </Button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}

/**
 * Wipe everything — three-stage confirmation:
 *   stage 1: "Wipe everything" button visible, armed=false
 *   stage 2: warning + textarea, user types WIPE
 *   stage 3: submission to wipeEverything action
 */
export function WipeEverythingForm() {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-accent hover:text-accent-hover transition-colors border border-accent/40 hover:border-accent px-4 py-2"
      >
        <Trash2 size={14} strokeWidth={1.5} />
        Wipe everything
      </button>
    );
  }

  const ready = typed.trim().toUpperCase() === 'WIPE';

  return (
    <form action={wipeEverything} className="space-y-3 border border-accent bg-ink-shadow p-4">
      <input type="hidden" name="confirm" value="wipe" />

      <div className="flex items-start gap-3">
        <AlertTriangle size={18} strokeWidth={1.5} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="text-bone-dim text-sm leading-relaxed">
          <strong className="text-bone">This is permanent.</strong> All
          activities, races, plans, sync history, settings, and Strava
          credentials will be deleted. Type <code className="font-mono text-accent">WIPE</code> exactly
          to confirm.
        </div>
      </div>

      <input
        type="text"
        name="typed"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="type WIPE"
        autoComplete="off"
        className="w-full bg-ink border border-accent/40 px-3 py-2 font-mono text-sm text-bone uppercase tracking-widest focus-visible:outline-none focus-visible:border-accent"
      />

      <div className="flex items-center gap-3 pt-1">
        <Button variant="critical" size="sm" type="submit" disabled={!ready}>
          Wipe and start over
        </Button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setTyped('');
          }}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
