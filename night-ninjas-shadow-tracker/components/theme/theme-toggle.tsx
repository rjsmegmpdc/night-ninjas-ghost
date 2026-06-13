'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme-provider';
import { useState, useEffect } from 'react';

/**
 * ThemeToggle — cycles through System → Light → Dark → System.
 *
 * Sits at the bottom of the sidebar next to the Feedback button.
 * Shows the icon for the *currently selected preference* (not the
 * applied theme), so the user can see what they've chosen even when
 * 'system' resolves to dark on a dark-mode OS.
 *
 * Tooltip shows the current preference and what it cycles to.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — render a neutral placeholder until mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  const cycle = () => {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(preference);
    const next = order[(idx + 1) % order.length];
    setPreference(next);
  };

  const Icon =
    preference === 'system' ? Monitor :
    preference === 'light' ? Sun :
    Moon;

  const label =
    preference === 'system' ? 'System' :
    preference === 'light' ? 'Light' :
    'Dark';

  const nextLabel =
    preference === 'system' ? 'Light' :
    preference === 'light' ? 'Dark' :
    'System';

  if (!mounted) {
    // Pre-hydration placeholder — same dimensions, no icon to avoid flash
    return (
      <button
        className="p-2 text-bone-mute"
        aria-label="Theme toggle"
        type="button"
        disabled
      >
        <Monitor size={16} strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="p-2 text-bone-mute hover:text-bone transition-colors"
      title={`Theme: ${label} (click for ${nextLabel})`}
      aria-label={`Theme: ${label}`}
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  );
}
