/**
 * Smoke test for PatrolPage — runs in jsdom environment (see vitest.config.ts
 * environmentMatchGlobs).
 *
 * PatrolPage depends on:
 *  - useDb() from @/db/DbContext (calls new Worker() — not available in jsdom)
 *  - react-router Link / useNavigate
 *  - @/db/client (exec/query — hits the wa-sqlite worker bridge)
 *  - @/lib/analysis/week-queries (wraps @/db/client)
 *
 * All these are mocked at module level. JSX in mock factories is avoided where
 * possible (factories run before full transform context is guaranteed) — plain
 * React.createElement is used instead.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/db/DbContext', () => ({
  useDb: vi.fn(),
  DbProvider: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

// react-router: mock Link as a plain <a> (createElement avoids JSX-in-factory issues)
vi.mock('react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router')>();
  return {
    ...original,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
      React.createElement('a', { href: to }, children),
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/patrol', search: '', hash: '', state: null }),
  };
});

vi.mock('@/db/client', () => ({
  exec:      vi.fn().mockResolvedValue(undefined),
  query:     vi.fn().mockResolvedValue([]),
  queryRows: vi.fn().mockResolvedValue([]),
  getWorker: vi.fn(),
}));

vi.mock('@/lib/analysis/week-queries', () => ({
  getActivitiesInRange:   vi.fn().mockResolvedValue([]),
  getTotalActivityCount:  vi.fn().mockResolvedValue(0),
  getNextRace:            vi.fn().mockResolvedValue(null),
  getActivePlanPeriod:    vi.fn().mockResolvedValue(null),
  aggregateWeekStats:     vi.fn().mockReturnValue({
    totalKm: 0, totalSessions: 0, longRunKm: 0, avgPaceSpk: null, avgHr: null,
  }),
}));

vi.mock('@/lib/analysis/framework-stats', () => ({
  getFrameworkStats: vi.fn().mockReturnValue([]),
}));

// PageSkeleton — createElement avoids JSX transform dependency in factory
vi.mock('@/components/ui/PageSkeleton', () => ({
  PageSkeleton: () => React.createElement('div', { 'data-testid': 'page-skeleton' }),
}));

import { useDb } from '@/db/DbContext';
import PatrolPage from './PatrolPage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('PatrolPage — smoke tests', () => {
  it('renders without throwing when db is not ready', () => {
    vi.mocked(useDb).mockReturnValue({ ready: false, error: null, storage: null });

    expect(() => render(<PatrolPage />)).not.toThrow();
  });

  it('renders the PageSkeleton when db is not ready', () => {
    vi.mocked(useDb).mockReturnValue({ ready: false, error: null, storage: null });

    render(<PatrolPage />);

    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument();
  });

  it('renders error message when db has an error', () => {
    vi.mocked(useDb).mockReturnValue({
      ready: false,
      error: 'Worker failed to load',
      storage: null,
    });

    render(<PatrolPage />);

    expect(screen.getByText(/DB error.*Worker failed to load/i)).toBeInTheDocument();
  });

  it('renders "No activities synced" state when ready=true and data loads with count=0', async () => {
    vi.mocked(useDb).mockReturnValue({ ready: true, error: null, storage: 'opfs' });

    const { findByText } = render(<PatrolPage />);

    // After async data load resolves (getTotalActivityCount returns 0)
    await findByText(/No activities synced/i);
  });

  it('does not render PageSkeleton when db reports an error', () => {
    vi.mocked(useDb).mockReturnValue({
      ready: false,
      error: 'init failed',
      storage: null,
    });

    render(<PatrolPage />);

    expect(screen.queryByTestId('page-skeleton')).not.toBeInTheDocument();
  });
});
