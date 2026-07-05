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
