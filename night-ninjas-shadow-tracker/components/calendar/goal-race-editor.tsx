'use client';

import { useState } from 'react';
import { Pencil, X, AlertTriangle } from 'lucide-react';
import { updateRace, deleteRace } from '@/lib/actions/races';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { formatDuration } from '@/lib/plans/derive';

/**
 * GoalRaceEditor — toggleable view/edit for the goal race card.
 *
 * Default state: read-only field grid (Race, Date, Distance, Target, Level).
 * Click "Edit" → same card becomes a form pre-filled with current values,
 * with Save and Cancel.
 *
 * Cancel reverts to read-only without saving.
 * Save calls updateRace, the page revalidates, and the new values render
 * server-side (isEditing resets to false on the next render).
 *
 * Stays a single Card so the layout doesn't shift when toggling.
 *
 * Also surfaces a prominent "TARGET TIME REQUIRED" warning if missing —
 * the plan engine can't derive pace zones without it. Even with edit
 * available, the warning stays so the user doesn't quietly leave the
 * field blank.
 */

interface Props {
  race: {
    id: number;
    name: string;
    raceDate: string;
    distanceKm: number;
    targetTimeS: number | null;
    level: string | null;
    notes: string | null;
  };
}

export function GoalRaceEditor({ race }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-accent transition-colors flex items-center gap-1"
            title="Edit goal race"
          >
            <Pencil size={11} strokeWidth={1.5} />
            Edit
          </button>
          <DeleteInlineForm id={race.id} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ReadField label="Race" value={race.name} />
          <ReadField label="Date" value={race.raceDate} mono />
          <ReadField label="Distance" value={`${race.distanceKm} km`} mono />
          <ReadField
            label="Target"
            value={race.targetTimeS ? formatDuration(race.targetTimeS) : '—'}
            mono
            accent
          />
          {race.level && <ReadField label="Level" value={race.level} />}
        </div>

        {!race.targetTimeS && (
          <div className="border border-accent/60 bg-accent/10 px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} strokeWidth={1.5} className="text-accent flex-shrink-0" />
            <span className="font-display tracking-wide-display uppercase text-xs text-accent">
              Target time required — click Edit to set it
            </span>
            <span className="font-mono text-[10px] text-bone-mute ml-auto">
              ↳ pace zones derive from goal pace
            </span>
          </div>
        )}
      </div>
    );
  }

  // Editing state
  return (
    <form
      action={async (fd) => {
        await updateRace(fd);
        setIsEditing(false);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={race.id} />
      <input type="hidden" name="isGoal" value="true" />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors flex items-center gap-1"
        >
          <X size={11} strokeWidth={1.5} />
          Cancel
        </button>
        <Button type="submit" variant="critical" size="sm">
          Save
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="goal-name">Race name</Label>
          <Input
            id="goal-name"
            name="name"
            defaultValue={race.name}
            required
          />
        </div>
        <div>
          <Label htmlFor="goal-date">Race date</Label>
          <Input
            id="goal-date"
            name="raceDate"
            type="date"
            defaultValue={race.raceDate}
            required
          />
        </div>
        <div>
          <Label htmlFor="goal-distance">Distance (km)</Label>
          <Input
            id="goal-distance"
            name="distanceKm"
            type="number"
            step="0.001"
            defaultValue={race.distanceKm}
            required
          />
        </div>
        <div>
          <Label htmlFor="goal-time">Target time</Label>
          <Input
            id="goal-time"
            name="targetTime"
            type="text"
            placeholder="3:30:00"
            defaultValue={race.targetTimeS ? formatDuration(race.targetTimeS) : ''}
            required
          />
          <p className="font-mono text-[10px] text-bone-mute mt-1">
            ↳ required — pace zones derive from goal pace
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="goal-level">Experience level</Label>
          <select
            id="goal-level"
            name="level"
            defaultValue={race.level ?? 'intermediate'}
            className="w-full bg-ink border border-ink-line px-3 py-2 font-mono text-sm text-bone focus-visible:outline-none focus-visible:border-accent"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="goal-notes">Notes (optional)</Label>
          <Input
            id="goal-notes"
            name="notes"
            type="text"
            defaultValue={race.notes ?? ''}
            placeholder="course profile, weather plan, anything to remember"
          />
        </div>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------------
 * Read-only field — same look as the existing Field helper but local
 * to this file so we don't have to thread props through.
 * -------------------------------------------------------------------------- */
function ReadField({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
        {label}
      </span>
      <div
        className={
          (mono ? 'font-mono text-sm tabular-nums ' : 'text-sm ') +
          (accent ? 'text-accent' : 'text-bone')
        }
      >
        {value}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Inline delete confirm — small two-click pattern. Mirrors the existing
 * DeleteButton in race-section.tsx but lives here so we don't have to
 * jump files.
 * -------------------------------------------------------------------------- */
function DeleteInlineForm({ id }: { id: number }) {
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-signal-miss transition-colors"
        title="Delete goal race"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={deleteRace} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="font-mono text-[10px] text-bone-mute">delete?</span>
      <button
        type="submit"
        className="font-display tracking-wide-display uppercase text-xs text-signal-miss hover:underline"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone"
      >
        No
      </button>
    </form>
  );
}
