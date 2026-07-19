import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';

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
