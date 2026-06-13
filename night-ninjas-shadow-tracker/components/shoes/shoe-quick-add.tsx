'use client';

import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { createManualShoe } from '@/lib/actions/shoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * ShoeQuickAdd — single-line hero strip at the top of /shoes.
 *
 * Two visible inputs:
 *   - Brand+model (free text, autocomplete suggestions from the CSV)
 *   - Recommended km (auto-fills from CSV match, editable)
 *
 * On submit calls createManualShoe. The shoe appears in the Active table
 * after page revalidation. No photos, no purchase date, no notes — those
 * live on row-expand for shoes that grow into needing them.
 *
 * Autocomplete is a suggestion, not a constraint. Free text is allowed
 * for shoes not in the CSV (e.g. brand-new 2026 releases).
 */

export interface ShoeOption {
  brand: string;
  model: string;
  recommendedKm: number;
}

export function ShoeQuickAdd({ catalog }: { catalog: ShoeOption[] }) {
  const [name, setName] = useState('');
  const [recommendedKm, setRecommendedKm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // In-memory filter — 199 entries is fine to filter on every keystroke
  const suggestions =
    name.trim().length >= 2
      ? catalog
          .filter((s) =>
            (s.brand + ' ' + s.model).toLowerCase().includes(name.toLowerCase())
          )
          .slice(0, 8)
      : [];

  const pickSuggestion = (opt: ShoeOption) => {
    setName(`${opt.brand} ${opt.model}`);
    setRecommendedKm(String(opt.recommendedKm));
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <form
      action={async (fd) => {
        await createManualShoe(fd);
        setName('');
        setRecommendedKm('');
      }}
      className="border border-accent/40 bg-accent/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Plus size={14} strokeWidth={1.5} className="text-accent" />
        <span className="font-display tracking-wide-display uppercase text-sm text-accent">
          Quick add
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-start">
        {/* Brand + model with autocomplete */}
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            name="name"
            placeholder="Brand + model · e.g. Saucony Endorphin Pro 4"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay so click on suggestion can register
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            required
            autoComplete="off"
          />

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-ink border border-ink-line max-h-[280px] overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.brand}-${s.model}-${i}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep input focused
                    pickSuggestion(s);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-accent/10 border-b border-ink-line/40 last:border-b-0 flex items-center justify-between gap-3"
                >
                  <span className="text-sm text-bone truncate">
                    {s.brand} {s.model}
                  </span>
                  <span className="font-mono text-[10px] text-bone-mute tabular-nums whitespace-nowrap">
                    {s.recommendedKm} km
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User target km (overrides recommended) */}
        <Input
          type="number"
          name="userTargetKm"
          placeholder="km target"
          min="100"
          max="2000"
          step="50"
          value={recommendedKm}
          onChange={(e) => setRecommendedKm(e.target.value)}
        />

        <Button type="submit" variant="critical" size="md">
          Add
        </Button>
      </div>

      <p className="font-mono text-[10px] text-bone-mute">
        ↳ Strava-tracked shoes appear automatically · this is for off-Strava pairs or pre-Strava history
      </p>
    </form>
  );
}
