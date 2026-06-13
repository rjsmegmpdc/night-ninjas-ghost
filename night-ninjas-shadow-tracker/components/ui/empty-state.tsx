import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';

/**
 * EmptyState — branded "no data yet" placeholder used across the app.
 * Always tells the user WHY there's nothing here and WHERE to go next.
 *
 * Lives outside PageStub because PageStub is for unimplemented pages;
 * EmptyState is for implemented pages with no data yet.
 */
export function EmptyState({
  label,
  title,
  reason,
  action,
}: {
  label: string;
  title: string;
  reason: string;
  action?: { href: string; label: string };
}) {
  return (
    <Card className="space-y-5 max-w-2xl">
      <CardLabel>{label}</CardLabel>
      <div className="space-y-2">
        <div className="font-display tracking-wide-display text-2xl uppercase text-bone">
          {title}
        </div>
        <p className="text-bone-dim text-sm leading-relaxed">{reason}</p>
      </div>
      {action && (
        <div className="pt-3 border-t border-ink-line">
          <Link
            href={action.href}
            className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-accent hover:text-accent-hover transition-colors"
          >
            {action.label}
            <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        </div>
      )}
    </Card>
  );
}
