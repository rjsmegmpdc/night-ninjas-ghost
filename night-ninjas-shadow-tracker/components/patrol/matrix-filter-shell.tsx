'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { SessionType, PaceZones } from '@/lib/plans/types';

/**
 * Filter state shared between the legend swatches and the matrix cells.
 *
 * Rather than a heavy state-management approach, we expose two things
 * via a single React context:
 *   - the active filter Set<SessionType>
 *   - a toggle function for legend swatches to call on click
 *
 * The shell wraps everything inside the matrix and applies a CSS class
 * to the root that signals "filters active" + the active types as a
 * data attribute. CSS rules in globals.css use these to dim non-matching
 * cells via attribute selectors. No re-renders on filter toggle except
 * the wrapper itself.
 */

interface FilterContextValue {
  active: Set<SessionType>;
  toggle: (t: SessionType) => void;
  clear: () => void;
  paceZones?: PaceZones;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function useMatrixFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    // Defensive fallback — outside the shell, no filters
    return {
      active: new Set(),
      toggle: () => {},
      clear: () => {},
    };
  }
  return ctx;
}

export function MatrixFilterShell({
  paceZones,
  children,
}: {
  paceZones?: PaceZones;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<Set<SessionType>>(new Set());

  const toggle = useCallback((t: SessionType) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const clear = useCallback(() => setActive(new Set()), []);

  const value = useMemo(
    () => ({ active, toggle, clear, paceZones }),
    [active, toggle, clear, paceZones]
  );

  // Build space-separated list of active types for the data attribute.
  // CSS rules in globals.css read this to determine which cells to dim.
  const activeAttr = active.size > 0 ? Array.from(active).join(' ') : undefined;

  return (
    <FilterContext.Provider value={value}>
      <div data-matrix-filter-active={activeAttr}>{children}</div>
    </FilterContext.Provider>
  );
}
