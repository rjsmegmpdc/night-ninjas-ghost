'use client';

import { useState, useTransition } from 'react';
import { X, Shield, CheckCircle2 } from 'lucide-react';
import { acceptClubTerms } from '@/lib/actions/generate-club-share';

/**
 * Plain-language disclosure of what the club share file contains and what
 * it does NOT contain. The athlete must read and accept this before
 * generating any share file.
 *
 * Two columns: "what's shared" and "what's NOT shared", side-by-side.
 * The contrast is intentional - athletes should see what they're keeping
 * private as prominently as what they're publishing.
 */
export function ClubShareTermsModal({
  open,
  onClose,
  alreadyAcceptedAt,
}: {
  open: boolean;
  onClose: () => void;
  alreadyAcceptedAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  if (!open) return null;

  const handleAccept = () => {
    startTransition(async () => {
      await acceptClubTerms();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-ink-panel border border-ink-line rounded-xl shadow-card-elevated w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Shield size={24} strokeWidth={1.5} className="text-accent shrink-0 mt-1" />
              <div>
                <h2 className="font-display tracking-wide-display text-2xl uppercase text-bone">
                  Club share privacy
                </h2>
                <p className="font-mono text-xs text-bone-mute mt-1">
                  Review what's shared before you generate
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-bone-mute hover:text-bone p-1 rounded-md"
              aria-label="Close"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          {/* Two-column disclosure */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shared */}
            <div className="bg-ink-shadow border border-ink-line rounded-lg p-4 space-y-3">
              <div className="font-display tracking-wide-display text-xs uppercase text-signal-ok">
                ✓ Shared in the file
              </div>
              <ul className="space-y-2 text-sm text-bone">
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Your parkrun ID (so the club app routes the schedule to you)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Generation timestamp
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Date and day-of-week of upcoming sessions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Session type (easy, tempo, long, intervals, etc.)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Distance in km, or duration in minutes
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-ok shrink-0">·</span>
                  Generic session notes ("Tempo", "Long run")
                </li>
              </ul>
            </div>

            {/* Not shared */}
            <div className="bg-ink-shadow border border-ink-line rounded-lg p-4 space-y-3">
              <div className="font-display tracking-wide-display text-xs uppercase text-signal-miss">
                ✗ NOT shared
              </div>
              <ul className="space-y-2 text-sm text-bone-dim">
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Pace targets ("5:15/km", "MP", "T-pace")
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Heart rate zones or HR targets
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Athlete state (CTL, ATL, TSB, freshness)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Past activities or compliance results
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Personal records, race history
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Strava connection details, account info
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Rest-day sessions (not actionable to club viewers)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-signal-miss shrink-0">·</span>
                  Completed sessions (stripped before export)
                </li>
              </ul>
            </div>
          </div>

          {/* Responsibility */}
          <div className="bg-accent-faint border border-accent/30 rounded-lg p-4 text-sm text-bone-dim space-y-2">
            <div className="font-display tracking-wide-display text-xs uppercase text-accent">
              How this works
            </div>
            <p>
              VELOCITY generates the file. <strong className="text-bone">You</strong> upload it to
              your club app yourself - nothing leaves your machine automatically.
              The club app is responsible for storing, displaying, and eventually
              deleting the file.
            </p>
            <p>
              You can regenerate at any time. Old uploads on the club side are
              the club's responsibility to manage.
            </p>
          </div>

          {alreadyAcceptedAt ? (
            <div className="text-center font-mono text-xs text-bone-mute">
              Already accepted on {alreadyAcceptedAt.slice(0, 10)}.
              <button
                type="button"
                onClick={onClose}
                className="block mx-auto mt-3 px-4 py-2 bg-ink-shadow border border-ink-line rounded-lg text-bone hover:border-ink-line-bold"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Acknowledgement checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none p-3 bg-ink-shadow border border-ink-line rounded-lg hover:border-ink-line-bold">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 accent-accent"
                />
                <span className="text-sm text-bone">
                  I understand what's in this file and accept that I'm the one
                  uploading it to my club app.
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="px-4 py-2 text-bone-dim hover:text-bone rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!confirmed || isPending}
                  className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <CheckCircle2 size={16} strokeWidth={1.5} />
                  Accept and continue
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
