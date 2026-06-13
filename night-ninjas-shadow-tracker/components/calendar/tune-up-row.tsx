'use client';

import { useState } from 'react';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { updateRace, deleteRace } from '@/lib/actions/races';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/plans/derive';

/**
 * TuneUpRow — editable row for tune-up races. Two states:
 *
 *  Default: tight row showing name | date | distance | target | edit/delete
 *  Editing: expands to a 2-row inline form with the same fields editable
 *
 * Save calls updateRace and revalidates; row collapses back to read-only
 * on success.
 *
 * Mirrors the read-only row's column grid so the layout doesn't shift
 * when the row collapses again.
 */

interface Race {
  id: number;
  name: string;
  raceDate: string;
  distanceKm: number;
  targetTimeS: number | null;
  notes: string | null;
}

export function TuneUpRow({ race }: { race: Race }) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isEditing) {
    return (
      <form
        action={async (fd) => {
          await updateRace(fd);
          setIsEditing(false);
        }}
        className="py-3 space-y-2 border-l-2 border-accent pl-3"
      >
        <input type="hidden" name="id" value={race.id} />
        <input type="hidden" name="isGoal" value="false" />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Input
            name="name"
            defaultValue={race.name}
            required
            className="md:col-span-2"
          />
          <Input
            name="raceDate"
            type="date"
            defaultValue={race.raceDate}
            required
          />
          <Input
            name="distanceKm"
            type="number"
            step="0.1"
            defaultValue={race.distanceKm}
            required
          />
          <Input
            name="targetTime"
            type="text"
            placeholder="time (opt)"
            defaultValue={race.targetTimeS ? formatDuration(race.targetTimeS) : ''}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="critical" size="sm">
            <Check size={11} strokeWidth={1.5} />
            Save
          </Button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors flex items-center gap-1"
          >
            <X size={11} strokeWidth={1.5} />
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="py-3 grid grid-cols-[1fr_90px_70px_70px_60px] gap-4 items-center">
      <div className="text-bone truncate">{race.name}</div>
      <span className="font-mono text-xs text-bone-dim tabular-nums">
        {race.raceDate}
      </span>
      <span className="font-mono text-xs text-bone-dim tabular-nums">
        {race.distanceKm} km
      </span>
      <span className="font-mono text-xs text-bone-dim tabular-nums">
        {race.targetTimeS ? formatDuration(race.targetTimeS) : '—'}
      </span>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5">
        {confirmDelete ? (
          <form action={deleteRace} className="flex items-center gap-1">
            <input type="hidden" name="id" value={race.id} />
            <button
              type="submit"
              className="font-display tracking-wide-display uppercase text-[10px] text-signal-miss hover:underline"
              title="Confirm delete"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone"
              title="Cancel"
            >
              No
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-bone-mute hover:text-accent transition-colors"
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-bone-mute hover:text-signal-miss transition-colors"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
