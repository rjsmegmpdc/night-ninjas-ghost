export default function Loading() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-7xl mx-auto animate-pulse">
      <div className="space-y-3 border-b border-ink-line pb-6 mb-8">
        <div className="h-2.5 w-20 bg-ink-line rounded" />
        <div className="h-8 w-56 bg-ink-line-bold rounded" />
      </div>
      <div className="space-y-6">
        <div className="h-28 bg-ink-shadow border border-ink-line rounded-xl" />
        <div className="h-40 bg-ink-shadow border border-ink-line rounded-xl" />
        <div className="h-28 bg-ink-shadow border border-ink-line rounded-xl" />
      </div>
    </div>
  );
}
