import type { ShoeWithStats } from '@/lib/shoes/queries';
import { ShoeRow } from './shoe-row';

/**
 * ShoeTable — table layout for /shoes. Header row + one ShoeRow per shoe.
 *
 * Each row is a client component that owns its own expanded/action state.
 * Row expand surfaces the retailer search, best-race stats, and photo —
 * the content lifted from the old card layout, kept off the default view
 * so the table stays scannable.
 */
export function ShoeTable({ shoes }: { shoes: ShoeWithStats[] }) {
  if (shoes.length === 0) return null;

  return (
    <div className="border border-ink-line">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_140px_120px_110px_70px] gap-3 px-4 py-2 bg-ink-shadow border-b border-ink-line font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
        <div>Shoe</div>
        <div className="text-right">Mileage</div>
        <div>% Used</div>
        <div>Expiry</div>
        <div className="text-right">Action</div>
      </div>

      {/* Body */}
      <div className="divide-y divide-ink-line">
        {shoes.map((shoe) => (
          <ShoeRow key={shoe.id} shoe={shoe} />
        ))}
      </div>
    </div>
  );
}
