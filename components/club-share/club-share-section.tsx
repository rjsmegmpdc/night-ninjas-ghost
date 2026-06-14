'use client';

import { useState, useTransition } from 'react';
import { Share2, Clock, FileJson, AlertTriangle } from 'lucide-react';
import {
  generateClubShare,
  saveParkrunId,
  saveWindowDefault,
  type GenerateShareResult,
} from '@/lib/actions/generate-club-share';
import { ClubShareTermsModal } from './terms-modal';
import type { ClubWindowDefault } from '@/lib/store/settings';

interface Props {
  initialParkrunId: string | null;
  initialWindow: ClubWindowDefault;
  termsAcceptedAt: string | null;
  lastGeneratedAt: string | null;
}

const WINDOW_LABELS: Record<ClubWindowDefault, string> = {
  '1w': '1 week',
  '2w': '2 weeks (default)',
  '4w': '4 weeks',
  'next-race': 'Until next race',
  'program-end': 'Until program ends',
};

/**
 * Calculate whether the last-generated timestamp is stale.
 *
 * Per our locked design: stale when more than 5 days old.
 */
function isStale(lastIso: string | null): boolean {
  if (!lastIso) return false;
  const last = new Date(lastIso);
  const now = new Date();
  const days = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return days > 5;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toISOString().slice(0, 10);
}

export function ClubShareSection({
  initialParkrunId,
  initialWindow,
  termsAcceptedAt,
  lastGeneratedAt,
}: Props) {
  const [parkrunId, setParkrunId] = useState(initialParkrunId ?? '');
  const [windowDefault, setWindow] = useState<ClubWindowDefault>(initialWindow);
  const [showTerms, setShowTerms] = useState(false);
  const [generating, startGenerate] = useTransition();
  const [savingId, startSaveId] = useTransition();
  const [result, setResult] = useState<GenerateShareResult | null>(null);

  const termsAccepted = termsAcceptedAt !== null;
  const canGenerate = termsAccepted && parkrunId.trim().length > 0;
  const stale = isStale(lastGeneratedAt);

  const handleSaveId = () => {
    const fd = new FormData();
    fd.set('parkrun_id', parkrunId);
    startSaveId(() => {
      saveParkrunId(fd);
    });
  };

  const handleWindowChange = (v: ClubWindowDefault) => {
    setWindow(v);
    const fd = new FormData();
    fd.set('window_default', v);
    startSaveId(() => {
      saveWindowDefault(fd);
    });
  };

  const handleGenerate = () => {
    if (!canGenerate) {
      if (!termsAccepted) {
        setShowTerms(true);
      }
      return;
    }
    const fd = new FormData();
    fd.set('window', windowDefault);
    startGenerate(async () => {
      const r = await generateClubShare(fd);
      setResult(r);
    });
  };

  return (
    <>
      <div className="bg-ink-shadow border border-ink-line rounded-xl shadow-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Share2 size={20} strokeWidth={1.5} className="text-accent shrink-0 mt-1" />
          <div className="flex-1">
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
              external sharing
            </div>
            <h3 className="font-display tracking-wide-display uppercase text-xl text-bone mt-0.5">
              Club Schedule Share
            </h3>
          </div>
        </div>

        <p className="text-sm text-bone-dim leading-relaxed">
          Generate a JSON file containing your upcoming training schedule that you
          can upload to your club's app. The file lives on your machine until you
          choose to upload it - VELOCITY never sends data automatically.
        </p>

        {/* Stale-data warning */}
        {stale && (
          <div className="flex items-start gap-2 bg-signal-warn/10 border border-signal-warn/40 rounded-lg p-3">
            <AlertTriangle size={16} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />
            <div className="text-sm text-bone-dim">
              <span className="text-signal-warn font-medium">Stale</span> - last
              generated {formatRelative(lastGeneratedAt)}. Regenerate before uploading.
            </div>
          </div>
        )}

        {/* parkrun ID */}
        <div className="space-y-2">
          <label
            htmlFor="club-parkrun-id"
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute block"
          >
            parkrun ID
          </label>
          <div className="flex gap-2">
            <input
              id="club-parkrun-id"
              type="text"
              value={parkrunId}
              onChange={(e) => setParkrunId(e.target.value)}
              onBlur={handleSaveId}
              placeholder="e.g. A1234567"
              className="flex-1 bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveId}
              disabled={savingId}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              {savingId ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ identifies you to the club app on upload
          </p>
        </div>

        {/* Default window */}
        <div className="space-y-2">
          <label className="font-display tracking-wide-display uppercase text-xs text-bone-mute block">
            Window
          </label>
          <select
            value={windowDefault}
            onChange={(e) => handleWindowChange(e.target.value as ClubWindowDefault)}
            className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-sm text-bone focus:border-accent focus:outline-none"
          >
            {(Object.keys(WINDOW_LABELS) as ClubWindowDefault[]).map((k) => (
              <option key={k} value={k}>
                {WINDOW_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="font-mono text-[10px] text-bone-mute">
            ↳ how far forward to publish. Strips completed sessions automatically.
          </p>
        </div>

        {/* Terms status */}
        <div className="flex items-center gap-2 text-xs">
          {termsAccepted ? (
            <>
              <span className="text-signal-ok">●</span>
              <span className="text-bone-dim">
                Terms accepted on {termsAcceptedAt?.slice(0, 10)}.
              </span>
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
              >
                Review
              </button>
            </>
          ) : (
            <>
              <span className="text-signal-warn">●</span>
              <span className="text-bone-dim">Terms not yet accepted.</span>
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:text-accent-hover underline-offset-2 hover:underline"
              >
                Review and accept
              </button>
            </>
          )}
        </div>

        {/* Last generated + action */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-ink-line">
          <div className="font-mono text-xs text-bone-mute flex items-center gap-1.5">
            <Clock size={12} strokeWidth={1.5} />
            Last generated: <span className="text-bone-dim">{formatRelative(lastGeneratedAt)}</span>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileJson size={16} strokeWidth={1.5} />
            {generating ? 'Generating...' : 'Generate share file'}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            className={
              'rounded-lg p-3 text-sm space-y-2 ' +
              (result.ok
                ? 'bg-signal-ok/10 border border-signal-ok/40'
                : 'bg-signal-miss/10 border border-signal-miss/40')
            }
          >
            {result.ok ? (
              <>
                <div className="text-signal-ok font-medium">
                  Generated {result.sessionCount} pending session
                  {result.sessionCount === 1 ? '' : 's'}
                </div>
                <div className="font-mono text-[11px] text-bone-dim space-y-1">
                  <div>
                    <span className="text-bone-mute">latest:</span> {result.latestPath}
                  </div>
                  <div>
                    <span className="text-bone-mute">archived:</span> {result.archivedPath}
                  </div>
                </div>
                <p className="text-xs text-bone-dim leading-relaxed">
                  Upload <span className="font-mono text-bone">{result.filename}</span> to your
                  club app. The latest file is also available at
                  <span className="font-mono text-bone"> schedule-current.json</span> if your
                  club app prefers a stable filename.
                </p>
              </>
            ) : (
              <div className="text-signal-miss">{result.error ?? 'Unknown error'}</div>
            )}
          </div>
        )}
      </div>

      <ClubShareTermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        alreadyAcceptedAt={termsAcceptedAt}
      />
    </>
  );
}
