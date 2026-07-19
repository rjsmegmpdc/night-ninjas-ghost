import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';

// ---------------------------------------------------------------------------
// Version check + auto-refresh. The previous setup only *registered* the
// service worker: after a deploy the new sw installed and took control in
// the background, but the open page was never reloaded, so users kept
// seeing the previous build until their next visit. registerSW in
// autoUpdate mode reloads the page as soon as an updated sw takes control
// (that IS the version check — the browser byte-compares sw.js). On top,
// re-check on a timer and whenever the app returns to the foreground —
// the path that matters for the iOS home-screen PWA, which can sit in
// memory for days.
// ---------------------------------------------------------------------------
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => {});
    setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

// ---------------------------------------------------------------------------
// Apply stored display preferences before React mounts to avoid a flash of
// wrong theme or font size on load.
// ---------------------------------------------------------------------------
function applyDisplayPrefs() {
  const root = document.documentElement;

  const scale = localStorage.getItem('ghost.font_scale');
  if (scale) root.style.setProperty('--font-scale', scale);

  const preset = localStorage.getItem('ghost.color_preset');
  if (preset && preset !== 'ink') root.setAttribute('data-theme', preset);
  if (preset === 'dawn') root.style.colorScheme = 'light';
}
applyDisplayPrefs();

// ---------------------------------------------------------------------------
// Deploy-skew self-heal. With the PWA's autoUpdate service worker, a tab
// running an old build loses its old hashed chunks after a new deploy
// (skipWaiting + clientsClaim purge the old precache; Pages only serves the
// current build). The next lazy route import then rejects and — without a
// guard — React unmounts to a blank page. Vite fires `vite:preloadError`
// for exactly this case: reload once to pick up the fresh build. The
// sessionStorage latch stops a reload loop if the failure is anything
// other than skew.
// ---------------------------------------------------------------------------
window.addEventListener('vite:preloadError', (event) => {
  // Timestamp latch: at most one automatic reload per minute. If the reload
  // didn't fix it (failure is not deploy skew), the error propagates to the
  // ErrorBoundary instead of reload-looping; after the window expires the
  // guard re-arms for the next genuine deploy.
  const KEY = 'ghost.preload_reload_at';
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

// Request persistent storage so the browser won't evict our SQLite data.
if (navigator.storage?.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
