import { Card, CardLabel } from '@/components/ui/card';

/**
 * PageStub — branded placeholder for pages not yet wired up.
 * Used for Recon, Strike, Dojo, Journal, Settings until they're built out.
 * Looks intentional, not unfinished.
 */
export function PageStub({
  pageLabel,
  pageTitle,
  description,
  pendingItems,
}: {
  pageLabel: string;
  pageTitle: string;
  description: string;
  pendingItems: string[];
}) {
  return (
    <div className="px-12 py-10 max-w-7xl mx-auto space-y-10">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">{pageLabel}</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          {pageTitle}
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          {description}
        </div>
      </header>

      <Card className="max-w-2xl space-y-4">
        <CardLabel>build status</CardLabel>
        <div className="space-y-2">
          <div className="font-display tracking-wide-display text-2xl uppercase text-accent">
            Phase 1 · Pending
          </div>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            This screen is wired up to the navigation but not yet implemented.
            Below is the build queue for this view — order may change.
          </p>
        </div>
        <ol className="space-y-2 pt-3 border-t border-ink-line">
          {pendingItems.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="font-mono text-accent w-6 flex-shrink-0">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <span className="text-bone-dim">{item}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
