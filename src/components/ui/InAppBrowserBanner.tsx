import { useState } from 'react';

/**
 * In-app browser advisory (COMPAT audit mitigation #1). Instagram/Facebook/
 * TikTok etc. open links in a WKWebView (iOS) or custom tab shell where
 * service workers never activate — no offline cache, no auto-update — and
 * storage quotas are tighter, so training data is at higher eviction risk.
 * The app still runs (SQLite worker + OPFS are not entitlement-gated), so
 * this is a banner, not a wall.
 *
 * Detection is deliberately a conservative UA allowlist of known in-app
 * shells — false negatives are fine (app still works), false positives
 * would nag real browsers.
 */

const IN_APP_MARKERS = [
  'Instagram',
  'FBAN', // Facebook app (iOS)
  'FBAV', // Facebook app
  'FB_IAB', // Facebook in-app browser (Android)
  'Messenger',
  'TikTok',
  'musical_ly',
  'Line/',
  'MicroMessenger', // WeChat
];

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return IN_APP_MARKERS.some((m) => ua.includes(m));
}

const DISMISS_KEY = 'ghost.inapp_banner_dismissed';

export function InAppBrowserBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return true; }
  });

  if (dismissed || !isInAppBrowser()) return null;

  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);

  return (
    <div
      role="status"
      className="bg-signal-warn/10 border-b border-signal-warn/40 px-4 py-2.5 flex items-start gap-3"
    >
      <p className="flex-1 font-mono text-xs text-bone-dim leading-relaxed">
        <span className="text-signal-warn font-semibold">In-app browser detected. </span>
        GHOST works best in {isIos ? 'Safari' : 'your full browser'} — open the menu
        ({isIos ? '⋯ or share icon' : '⋮'}) and choose “Open in {isIos ? 'Safari' : 'browser'}”
        for updates, offline use, and safer data storage.
      </p>
      <button
        type="button"
        aria-label="Dismiss in-app browser notice"
        onClick={() => {
          try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
          setDismissed(true);
        }}
        className="shrink-0 font-mono text-xs text-bone-mute hover:text-bone px-1.5 py-0.5"
      >
        ✕
      </button>
    </div>
  );
}
