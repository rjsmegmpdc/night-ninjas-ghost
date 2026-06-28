/**
 * Patrol loading skeleton — shows instantly on navigation while
 * PatrolDashboard (a large async RSC waterfall) resolves.
 *
 * Mirrors the real Patrol layout section-by-section so the page
 * feels like it is materialising in place rather than blanking then
 * popping in. Greyed placeholder blocks use bg-ink-line fills so
 * they read against both the page background (bg-ink) and card
 * surfaces (bg-ink-shadow).
 */
export default function PatrolLoading() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto space-y-10 animate-pulse-subtle">

      {/* ── Header strip ──────────────────────────────────────────────── */}
      <header className="space-y-3 border-b border-ink-line pb-5">

        {/* Row 1: phase label / h1 / StreakCounter + SyncButton */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {/* nn-caps label "dashboard · this week" */}
            <div className="h-2.5 w-36 rounded-sm bg-ink-line" />
            {/* h1 phase heading */}
            <div className="h-9 w-64 rounded-sm bg-ink-line" />
            {/* date range / sub-line */}
            <div className="h-2.5 w-48 rounded-sm bg-ink-line" />
          </div>
          {/* icon buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            <div className="h-8 w-8 rounded-full bg-ink-line" />
            <div className="h-8 w-8 rounded-sm bg-ink-line" />
          </div>
        </div>

        {/* Row 2: RaceCountdown + Calendar / Race plan links */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="h-6 w-48 rounded-sm bg-ink-line" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-24 rounded-sm bg-ink-line" />
            <div className="h-6 w-24 rounded-sm bg-ink-line" />
          </div>
        </div>

      </header>

      {/* ── Compliance block ──────────────────────────────────────────── */}
      {/* Mirrors: flex items-center gap-6 px-5 py-4 border border-ink-line */}
      <div className="flex items-center gap-6 px-5 py-4 border border-ink-line">
        {/* Icon + large % */}
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded-sm bg-ink-line" />
          <div className="h-9 w-14 rounded-sm bg-ink-line" />
        </div>
        {/* Status label + subline */}
        <div className="border-l border-ink-line pl-6 space-y-1.5">
          <div className="h-3 w-16 rounded-sm bg-ink-line" />
          <div className="h-2.5 w-44 rounded-sm bg-ink-line" />
        </div>
        {/* Hit / partial / miss counters */}
        <div className="ml-auto flex items-center gap-6">
          {[1, 2, 3].map((k) => (
            <div key={k} className="flex flex-col items-center gap-1.5">
              <div className="h-5 w-5 rounded-sm bg-ink-line" />
              <div className="h-2 w-8 rounded-sm bg-ink-line" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Program matrix ────────────────────────────────────────────── */}
      {/* Mirrors: <section className="space-y-4"> with a section header,
          then lg:grid-cols-[1fr_220px] — matrix left, legend right.
          MatrixHeader grid: grid-cols-[80px_repeat(7,1fr)_70px] */}
      <section className="space-y-4">

        {/* Section header bar */}
        <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
          <div className="h-2.5 w-28 rounded-sm bg-ink-line" />
          <div className="h-2 w-48 rounded-sm bg-ink-line" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-start">

          {/* Left — matrix grid */}
          <div className="space-y-1.5">

            {/* Column headers */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px bg-ink-line">
              <div className="bg-ink px-2 py-1.5">
                <div className="h-2 w-8 rounded-sm bg-ink-line" />
              </div>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-ink px-2 py-1.5 flex justify-center">
                  <div className="h-2 w-6 rounded-sm bg-ink-line" />
                </div>
              ))}
              <div className="bg-ink px-2 py-1.5 flex justify-end">
                <div className="h-2 w-8 rounded-sm bg-ink-line" />
              </div>
            </div>

            {/* Three week rows: last / current / next */}
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px bg-ink-line">
                <div className="bg-ink px-2 py-3 flex flex-col gap-1.5">
                  <div className="h-2.5 w-12 rounded-sm bg-ink-line" />
                  <div className="h-2 w-8 rounded-sm bg-ink-line" />
                </div>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="bg-ink px-2 py-3 flex flex-col gap-1.5">
                    <div className="h-2.5 w-10 rounded-sm bg-ink-line" />
                    <div className="h-2 w-7 rounded-sm bg-ink-line" />
                  </div>
                ))}
                <div className="bg-ink px-2 py-3 flex flex-col items-end gap-1.5">
                  <div className="h-2.5 w-10 rounded-sm bg-ink-line" />
                  <div className="h-2 w-6 rounded-sm bg-ink-line" />
                </div>
              </div>
            ))}

          </div>

          {/* Right — legend sidebar (220px on lg) */}
          <div className="hidden lg:flex flex-col gap-3 p-4 border border-ink-line">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-ink-line flex-shrink-0" />
                <div className="h-2.5 flex-1 rounded-sm bg-ink-line" />
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── Tonight's mission card ────────────────────────────────────── */}
      {/* Mirrors: <Card className="border-accent/40 space-y-4"> */}
      <div className="nn-card p-6 border-accent/20 space-y-4">
        {/* CardLabel "tonight's mission" */}
        <div className="h-2.5 w-28 rounded-sm bg-ink-line" />
        <div className="space-y-2">
          {/* Session title (font-display text-2xl) */}
          <div className="h-7 w-56 rounded-sm bg-ink-line" />
          {/* Prescription sub-line */}
          <div className="h-3 w-40 rounded-sm bg-ink-line" />
        </div>
      </div>

      {/* ── Framework stat row ───────────────────────────────────────── */}
      {/* Mirrors: grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-ink p-6 space-y-2">
            {/* nn-caps stat label */}
            <div className="h-2.5 w-20 rounded-sm bg-ink-line" />
            {/* nn-stat (text-5xl) value */}
            <div className="h-10 w-16 rounded-sm bg-ink-line" />
            {/* subline */}
            <div className="h-2 w-24 rounded-sm bg-ink-line" />
          </div>
        ))}
      </div>

    </div>
  );
}
