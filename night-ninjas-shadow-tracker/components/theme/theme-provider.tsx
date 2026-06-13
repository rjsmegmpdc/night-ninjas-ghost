'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * Theme system — tri-state: System / Light / Dark.
 *
 * The "applied" theme is what data-theme actually shows: derived from
 * preference + (if system) the OS prefers-color-scheme.
 *
 * No-flash strategy: a small inline script in the root layout reads
 * localStorage BEFORE React hydrates and sets data-theme on <html>. This
 * provider takes over after hydration to handle changes.
 *
 * localStorage key: 'nn-theme' = 'system' | 'light' | 'dark'
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type AppliedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  applied: AppliedTheme;
  setPreference: (p: ThemePreference) => void;
}

const STORAGE_KEY = 'nn-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveApplied(pref: ThemePreference): AppliedTheme {
  if (pref === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // On mount, hydrate from localStorage (the inline script has already
  // applied the right data-theme attribute, so we just sync state)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      setPreferenceState(stored);
    }
  }, []);

  // Watch system pref if user has 'system' selected
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const applied: AppliedTheme = media.matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', applied);
    };
    handler(); // apply on mount
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    localStorage.setItem(STORAGE_KEY, p);
    const applied = resolveApplied(p);
    document.documentElement.setAttribute('data-theme', applied);
  }, []);

  const applied = resolveApplied(preference);

  return (
    <ThemeContext.Provider value={{ preference, applied, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Defensive fallback if used outside provider — degrades to dark default
    return {
      preference: 'system' as ThemePreference,
      applied: 'dark' as AppliedTheme,
      setPreference: () => {},
    };
  }
  return ctx;
}

/**
 * Inline script string that runs before React hydration to apply the
 * stored theme. Prevents FOUC (flash of wrong theme) by setting the
 * data-theme attribute synchronously.
 *
 * Embed via dangerouslySetInnerHTML in the root layout's <head>.
 */
export const NO_FLASH_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var pref = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var applied = pref;
    if (pref === 'system') {
      applied = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', applied);
  } catch (e) { /* ignore — defaults to dark via CSS */ }
})();
`.trim();
