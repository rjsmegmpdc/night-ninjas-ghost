'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Dojo, Level } from '@/lib/plans/types';
import { LevelToggle } from './level-toggle';
import { DojoCard } from './dojo-card';
import { PRIMARY_DOJOS, SECONDARY_DOJOS } from '@/lib/plans/dojo-card-meta';

/**
 * DojoPicker - the full dojo-selection surface.
 *
 * Used by both /setup/dojo (during wizard) and /dojo (post-setup).
 *
 * Layout:
 *   - Level toggle at top (drives hero stats across all cards)
 *   - Primary 4-card row (Hansons, Pfitzinger, Daniels, Lydiard)
 *   - Expandable "More dojos" group (Higdon, Polarised, Ultra, Custom)
 *
 * Selected state: a single card in either row may be "selected" -
 * passed in via selectedDojo prop. The CTA on that card renders as
 * filled accent. Other CTAs are ghost buttons.
 *
 * Selection: each card's CTA submits a hidden form with the dojo value
 * to the provided server action. The parent route action handles
 * persistence and navigation.
 */
export function DojoPicker({
  selectedDojo,
  defaultLevel = 'intermediate',
  onSelectFormAction,
}: {
  selectedDojo: Dojo | null;
  defaultLevel?: Level;
  /** Server action that processes the dojo selection form. */
  onSelectFormAction: (formData: FormData) => void | Promise<void>;
}) {
  const [level, setLevel] = useState<Level>(defaultLevel);
  // If selectedDojo is in the secondary group, default the expand to open
  const initialExpand = selectedDojo !== null && SECONDARY_DOJOS.includes(selectedDojo);
  const [secondaryOpen, setSecondaryOpen] = useState(initialExpand);

  return (
    <div className="space-y-6">
      {/* Level toggle - drives the hero stat in every card */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-ink-line">
        <div className="space-y-0.5">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            athlete level
          </div>
          <p className="font-mono text-[11px] text-bone-dim leading-relaxed">
            Pick the level that matches your current running. Cards show
            the entry weekly load each dojo expects.
          </p>
        </div>
        <LevelToggle value={level} onChange={setLevel} />
      </div>

      {/* Primary cards - 4 across on lg, 2 across on md, stacked on small */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-line">
        {PRIMARY_DOJOS.map((dojo) => (
          <DojoCard
            key={dojo}
            dojo={dojo}
            level={level}
            selected={dojo === selectedDojo}
            onSelectFormAction={onSelectFormAction}
          />
        ))}
      </div>

      {/* Secondary expand */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSecondaryOpen((v) => !v)}
          className="flex items-center gap-2 font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
          aria-expanded={secondaryOpen}
        >
          {secondaryOpen ? <ChevronUp size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
          More dojos - {SECONDARY_DOJOS.length} more
        </button>

        {secondaryOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-ink-line">
            {SECONDARY_DOJOS.map((dojo) => (
              <DojoCard
                key={dojo}
                dojo={dojo}
                level={level}
                selected={dojo === selectedDojo}
                onSelectFormAction={onSelectFormAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
