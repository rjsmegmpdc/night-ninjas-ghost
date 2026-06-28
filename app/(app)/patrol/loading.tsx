/**
 * Patrol loading skeleton — shows instantly on navigation while
 * PatrolDashboard (a large async RSC waterfall) resolves.
 *
 * Uses bg-ink-line-bold (#3A3A3A) fills and animate-pulse for a clearly
 * visible rhythm against the bg-ink (#0A0A0A) page background.
 * Cell backgrounds use bg-ink-shadow so the bars have contrast inside cards.
 */
export default function PatrolLoading() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-10 animate-pulse">

      {/* ── Header strip ──────────────────────────────────────────────── */}
      <header className="space-y-3 border-b border-ink-line pb-5">

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            {/* nn-caps "dashboard · this week" */}
            <div className="h-3 w-36 rounded-sm bg-ink-line-bold" />
            {/* h1 phase heading — tall to match Bebas at text-4xl */}
            <div className="h-10 w-72 rounded-sm bg-ink-line-bold" />
            {/* date range sub-line */}
            <div className="h-3 w-52 rounded-sm bg-ink-line-bold" />
          </div>
          {/* StreakCounter + SyncButton */}
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            <div className="h-8 w-8 rounded-full bg-ink-line-bold" />
            <div className="h-8 w-8 rounded-sm bg-ink-line-bold" />
          </div>
        </div>

        {/* RaceCountdown + nav links */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="h-7 w-52 rounded-sm bg-ink-line-bold" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-24 rounded-sm bg-ink-line-bold" />
            <div className="h-7 w-24 rounded-sm bg-ink-line-bold" />
          </div>
        </div>

      </header>

      {/* ── Quick-log strip ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="h-3 w-6 rounded-sm bg-ink-line-bold" />
        <div className="h-7 w-20 rounded-sm bg-ink-line-bold" />
        <div className="h-7 w-16 rounded-sm bg-ink-line-bold" />
        <div className="h-7 w-16 rounded-sm bg-ink-line-bold" />
      </div>

      {/* ── Compliance block ──────────────────────────────────────────── */}
      <div className="flex items-center gap-6 px-5 py-4 border border-ink-line bg-ink-shadow">
        {/* Icon + large percentage */}
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-sm bg-ink-line-bold" />
          <div className="h-10 w-16 rounded-sm bg-ink-line-bold" />
        </div>
        {/* Status label + subline */}
        <div className="border-l border-ink-line pl-6 space-y-2">
          <div className="h-3.5 w-16 rounded-sm bg-ink-line-bold" />
          <div className="h-3 w-44 rounded-sm bg-ink-line-bold" />
        </div>
        {/* Hit / partial / miss counters */}
        <div className="ml-auto flex items-center gap-6">
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex flex-col items-center gap-1.5">
              <div className="h-6 w-6 rounded-sm bg-ink-line-bold" />
              <div className="h-2.5 w-10 rounded-sm bg-ink-line-bold" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Program matrix ────────────────────────────────────────────── */}
      <section className="space-y-4">

        {/* Section header */}
        <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
          <div className="h-3 w-28 rounded-sm bg-ink-line-bold" />
          <div className="h-2.5 w-52 rounded-sm bg-ink-line-bold" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-start">

          {/* Matrix grid — grid-cols-[80px_repeat(7,1fr)_70px] */}
          <div className="space-y-1.5">

            {/* Column headers */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px bg-ink-line-bold">
              <div className="bg-ink-shadow px-2 py-2">
                <div className="h-2.5 w-8 rounded-sm bg-ink-line-bold" />
              </div>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-ink-shadow px-2 py-2 flex justify-center">
                  <div className="h-2.5 w-6 rounded-sm bg-ink-line-bold" />
                </div>
              ))}
              <div className="bg-ink-shadow px-2 py-2 flex justify-end">
                <div className="h-2.5 w-8 rounded-sm bg-ink-line-bold" />
              </div>
            </div>

            {/* Three week rows: last / current / next */}
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px bg-ink-line-bold">
                {/* Date label column (single bar — week number removed) */}
                <div className="bg-ink-shadow px-2 py-3 flex flex-col gap-1.5">
                  <div className="h-3 w-14 rounded-sm bg-ink-line-bold" />
                </div>
                {/* Day cells */}
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="bg-ink-shadow px-2 py-3 flex flex-col gap-1.5">
                    <div className="h-3 w-10 rounded-sm bg-ink-line-bold" />
                    <div className="h-2.5 w-7 rounded-sm bg-ink-line-bold" />
                  </div>
                ))}
                {/* Total column */}
                <div className="bg-ink-shadow px-2 py-3 flex flex-col items-end gap-1.5">
                  <div className="h-3 w-10 rounded-sm bg-ink-line-bold" />
                  <div className="h-2.5 w-6 rounded-sm bg-ink-line-bold" />
                </div>
              </div>
            ))}

          </div>

          {/* Legend sidebar */}
          <div className="hidden lg:flex flex-col gap-3 p-4 border border-ink-line bg-ink-shadow">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-ink-line-bold flex-shrink-0" />
                <div className="h-3 flex-1 rounded-sm bg-ink-line-bold" />
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── Tonight's mission card ────────────────────────────────────── */}
      <div className="nn-card p-6 border-accent/20 space-y-4">
        <div className="h-3 w-28 rounded-sm bg-ink-line-bold" />
        <div className="space-y-2.5">
          <div className="h-8 w-64 rounded-sm bg-ink-line-bold" />
          <div className="h-3 w-44 rounded-sm bg-ink-line-bold" />
        </div>
      </div>

      {/* ── Framework stat row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line-bold border border-ink-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-ink-shadow p-6 space-y-2.5">
            <div className="h-3 w-20 rounded-sm bg-ink-line-bold" />
            <div className="h-12 w-20 rounded-sm bg-ink-line-bold" />
            <div className="h-2.5 w-24 rounded-sm bg-ink-line-bold" />
          </div>
        ))}
      </div>

    </div>
  );
}
