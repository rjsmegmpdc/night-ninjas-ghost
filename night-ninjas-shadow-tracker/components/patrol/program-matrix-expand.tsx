'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { loadMatrixRows, type SerializedMatrixRow } from './matrix-load-action';
import { MatrixRow, type MatrixRowData } from './matrix-cells';
import type { FirstDayOfWeek } from '@/lib/store/settings';

/**
 * ProgramMatrixExpand — two collapsible sections below the always-visible
 * 3-week strip:
 *
 *   ▾ Past 8 weeks (compliance) — newest first when expanded
 *   ▾ Forward — to race day, paged at 8 weeks at a time
 *
 * Both load lazily via the `loadMatrixRows` server action. Nothing is
 * fetched on initial Patrol render — only when the user opens an expand.
 *
 * Subsequent "Load more" clicks fetch the next page (8 weeks older or
 * 8 weeks further out), no server round-trip after that until cleared.
 *
 * Props:
 *   anchorIso — Monday ISO of the current week. Used as the pivot for
 *               offset arithmetic in the server action.
 */
export function ProgramMatrixExpand({
  anchorIso,
  todayIso,
  todayDow,
  firstDayOfWeek,
}: {
  anchorIso: string;
  todayIso: string;
  todayDow: number;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  return (
    <div className="space-y-4 pt-4 border-t border-ink-line">
      <ExpandSection
        direction="past"
        anchorIso={anchorIso}
        todayIso={todayIso}
        todayDow={todayDow}
        label="Past 8 weeks · compliance"
        firstDayOfWeek={firstDayOfWeek}
      />
      <ExpandSection
        direction="forward"
        anchorIso={anchorIso}
        todayIso={todayIso}
        todayDow={todayDow}
        label="Forward · to race day"
        firstDayOfWeek={firstDayOfWeek}
      />
    </div>
  );
}

export function ExpandSection({
  direction,
  anchorIso,
  todayIso,
  todayDow,
  label,
  firstDayOfWeek,
}: {
  direction: 'past' | 'forward';
  anchorIso: string;
  todayIso: string;
  todayDow: number;
  label: string;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SerializedMatrixRow[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (rows.length === 0) {
      // First open — fetch page 0
      startTransition(async () => {
        const result = await loadMatrixRows(direction, anchorIso, 0);
        setRows(result.rows);
        setHasMore(result.hasMore);
        setPageOffset(0);
      });
    }
  };

  const handleLoadMore = () => {
    if (!hasMore || isPending) return;
    startTransition(async () => {
      const nextPage = pageOffset + 1;
      const result = await loadMatrixRows(direction, anchorIso, nextPage);
      setRows((prev) =>
        direction === 'past'
          ? [...prev, ...result.rows] // older after newer-already-shown
          : [...prev, ...result.rows] // chronological append
      );
      setHasMore(result.hasMore);
      setPageOffset(nextPage);
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOpen}
        className="font-display tracking-wide-display uppercase text-[11px] text-bone-mute hover:text-bone transition-colors flex items-center gap-1.5"
      >
        {open ? (
          <ChevronUp size={11} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={11} strokeWidth={1.5} />
        )}
        {open ? `Collapse ${direction}` : label}
      </button>

      {open && (
        <div className="space-y-1.5">
          {/* Render rows with dojo-boundary markers */}
          {rows.map((row, i) => {
            const prev = i > 0 ? rows[i - 1] : null;
            // Boundary marker: when the dojo changes between adjacent rows
            const showBoundary =
              prev !== null && prev.dojo !== row.dojo && row.dojo !== null;

            return (
              <div key={row.weekStartIso}>
                {showBoundary && (
                  <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest py-1.5 px-2 border-l-2 border-accent/40">
                    ↓ {row.dojo} begins · {row.weekStartIso}
                  </div>
                )}
                <MatrixRow
                  row={row as MatrixRowData}
                  todayDow={todayDow}
                  todayIso={todayIso}
                  firstDayOfWeek={firstDayOfWeek}
                />
              </div>
            );
          })}

          {/* Load more / end-of-data */}
          {isPending ? (
            <div className="flex items-center justify-center gap-2 py-3 text-bone-mute font-mono text-xs">
              <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
              Loading...
            </div>
          ) : hasMore ? (
            <button
              type="button"
              onClick={handleLoadMore}
              className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors py-2"
            >
              ↓ Load 8 more {direction === 'past' ? 'older' : 'further'} weeks
            </button>
          ) : (
            <div className="font-mono text-[10px] text-bone-mute py-2">
              ↳ end of {direction === 'past' ? 'history' : 'horizon'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
