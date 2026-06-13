'use client';

import { useState, useEffect } from 'react';
import { MessageSquarePlus, Bug, Lightbulb, Folder, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Feedback button — sits in the sidebar bottom. Opens a modal with two
 * tabs (New feature / Bug report), a textarea with structured-prompt
 * placeholder, and submit actions:
 *
 *   1. Compose draft  → opens user's default mail client via mailto:
 *                       with subject + body prefilled
 *   2. Reveal log     → opens File Explorer at the usage log so user
 *                       can drag-attach it into the email
 *
 * Why mailto: rather than auto-send: local-first means we don't have an
 * email server. The user's mail client does the actual send.
 *
 * The user is told upfront that the log file will need manual attachment.
 * Honest > magical.
 */

const FEEDBACK_RECIPIENT = 'matt.harkness@one.nz';

const FEATURE_PLACEHOLDER = `Describe the feature in three short sections:

WHAT
One line — what should the app do?

WHY
What problem does this solve? Or what would it unlock for you?

HOW (optional)
Any specific ideas about how it should work, look, or behave.

Example:
WHAT: Show a streak counter on the Patrol page.
WHY: Knowing my current streak motivates me to not skip days.
HOW: Count consecutive days where I ran 5km or 30 minutes.`;

const BUG_PLACEHOLDER = `Describe the bug:

WHAT HAPPENED
What you were doing when it went wrong.

WHAT YOU EXPECTED
What should have happened instead.

WHEN
Timestamp if you can — or roughly when (today 2pm, this morning, etc).

WHERE (which screen)
e.g. Calendar, Patrol, Wizard step 3.

Example:
WHAT HAPPENED: Tried to delete a tune-up race, got a 500 error.
WHAT EXPECTED: Race should disappear from the list.
WHEN: Just now, ~16:40.
WHERE: /calendar, Races section.`;

type FeedbackKind = 'feature' | 'bug';

interface LogSummary {
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  estimatedEvents: number;
  oldestEvent: string | null;
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-bone-dim hover:text-accent transition-colors w-full text-left border border-ink-line hover:border-accent"
        title="Send feedback or report a bug"
      >
        <MessageSquarePlus size={14} strokeWidth={1.5} />
        <span className="font-display tracking-wide-display uppercase text-xs">
          Feedback
        </span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('feature');
  const [message, setMessage] = useState('');
  const [logSummary, setLogSummary] = useState<LogSummary | null>(null);
  const [revealStatus, setRevealStatus] = useState<'idle' | 'opened' | 'failed'>('idle');

  useEffect(() => {
    fetch('/api/feedback/log-summary')
      .then((r) => r.json())
      .then(setLogSummary)
      .catch(() => setLogSummary(null));
  }, []);

  const placeholder = kind === 'feature' ? FEATURE_PLACEHOLDER : BUG_PLACEHOLDER;
  const subject =
    kind === 'feature'
      ? '[Shadow Tracker] Feature request'
      : '[Shadow Tracker] Bug report';

  const composeDraft = () => {
    const trimmed = message.trim();
    const noteAboutAttachment = logSummary?.exists
      ? `\n\n---\nUSAGE LOG ATTACHMENT\nA usage log is available at:\n  ${logSummary.filePath}\n(${(logSummary.sizeBytes / 1024).toFixed(1)} KB · ~${logSummary.estimatedEvents} events)\nClick "Reveal log file" in Shadow Tracker to find it, then drag it into this email before sending.`
      : '\n\n---\n(No usage log yet — first time using the app, or log file missing.)';

    const body = encodeURIComponent(trimmed + noteAboutAttachment);
    const subjectEnc = encodeURIComponent(subject);
    const url = `mailto:${FEEDBACK_RECIPIENT}?subject=${subjectEnc}&body=${body}`;

    // Fire usage event before the mail client steals focus
    fetch('/api/feedback/log-summary').catch(() => {});

    window.location.href = url;
  };

  const revealLog = async () => {
    try {
      const res = await fetch('/api/feedback/reveal-log', { method: 'POST' });
      const data = await res.json();
      if (data.ok) setRevealStatus('opened');
      else setRevealStatus('failed');
    } catch {
      setRevealStatus('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-ink border border-ink-line max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-line">
          <div>
            <span className="nn-caps">feedback · let's improve this thing</span>
            <h2 className="font-display tracking-wide-display text-2xl uppercase mt-1">
              Send feedback
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-bone-mute hover:text-accent transition-colors p-2"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Kind picker */}
          <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line">
            <button
              onClick={() => setKind('feature')}
              className={
                'flex items-center gap-3 p-4 transition-colors ' +
                (kind === 'feature'
                  ? 'bg-ink-shadow text-bone'
                  : 'bg-ink text-bone-dim hover:text-bone')
              }
            >
              <Lightbulb
                size={16}
                strokeWidth={1.5}
                className={kind === 'feature' ? 'text-accent' : ''}
              />
              <div className="text-left">
                <div className="font-display tracking-wide-display uppercase text-sm">
                  New feature
                </div>
                <div className="font-mono text-[10px] text-bone-mute mt-0.5">
                  something to add or improve
                </div>
              </div>
            </button>
            <button
              onClick={() => setKind('bug')}
              className={
                'flex items-center gap-3 p-4 transition-colors ' +
                (kind === 'bug'
                  ? 'bg-ink-shadow text-bone'
                  : 'bg-ink text-bone-dim hover:text-bone')
              }
            >
              <Bug
                size={16}
                strokeWidth={1.5}
                className={kind === 'bug' ? 'text-accent' : ''}
              />
              <div className="text-left">
                <div className="font-display tracking-wide-display uppercase text-sm">
                  Bug report
                </div>
                <div className="font-mono text-[10px] text-bone-mute mt-0.5">
                  something broke or behaved oddly
                </div>
              </div>
            </button>
          </div>

          {/* Message */}
          <div>
            <label className="nn-caps block mb-2" htmlFor="feedback-msg">
              describe it
            </label>
            <textarea
              id="feedback-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              rows={14}
              className="w-full bg-ink-panel border border-ink-line p-3 text-sm text-bone font-mono leading-relaxed focus-visible:outline-none focus-visible:border-accent"
            />
          </div>

          {/* Log attachment notice */}
          {logSummary?.exists ? (
            <div className="border border-ink-line bg-ink-shadow p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Folder
                  size={14}
                  strokeWidth={1.5}
                  className="text-accent flex-shrink-0 mt-0.5"
                />
                <div className="flex-1 space-y-1 text-sm">
                  <div className="font-display tracking-wide-display uppercase text-bone">
                    Usage log will be referenced
                  </div>
                  <div className="font-mono text-xs text-bone-dim leading-relaxed">
                    The email will include a path to your usage log file
                    ({(logSummary.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                    {logSummary.estimatedEvents} events). After your mail
                    client opens, click "Reveal log file" below and drag the
                    file into the email before sending.
                  </div>
                  <div className="font-mono text-[10px] text-bone-mute mt-2">
                    Captured: page views, action timings, error tags, durations.<br />
                    Never captured: form values, race times, names, free text, Strava data.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-ink-line">
                <button
                  onClick={revealLog}
                  className="font-display tracking-wide-display uppercase text-xs px-3 py-1 border border-bone-dim text-bone-dim hover:bg-bone hover:text-ink hover:border-bone transition-colors"
                >
                  Reveal log file
                </button>
                {revealStatus === 'opened' && (
                  <span className="font-mono text-xs text-signal-ok">
                    ✓ opened in file manager
                  </span>
                )}
                {revealStatus === 'failed' && (
                  <span className="font-mono text-xs text-accent">
                    couldn't open — path will still be in email
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-ink-line bg-ink-shadow p-4">
              <div className="font-mono text-xs text-bone-dim">
                No usage log yet — first feedback sent on this install.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-ink-line">
            <span className="font-mono text-xs text-bone-mute">
              recipient: {FEEDBACK_RECIPIENT}
            </span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={composeDraft}
                disabled={message.trim().length < 10}
              >
                Compose draft →
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
