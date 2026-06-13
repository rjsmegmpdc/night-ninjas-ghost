'use client';

import { useState } from 'react';
import { Pencil, Camera, DollarSign } from 'lucide-react';
import {
  setUserTargetKm,
  uploadShoePhoto,
  logPriceWatch,
} from '@/lib/actions/shoes';

/* ----------------------------------------------------------------------------
 * EditTargetForm — "Set target" button → expands to inline number input
 * -------------------------------------------------------------------------- */
export function EditTargetForm({
  shoeId,
  currentTarget,
}: {
  shoeId: number;
  currentTarget: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTarget?.toString() ?? '');

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
      >
        <Pencil size={10} strokeWidth={1.5} />
        Set target
      </button>
    );
  }

  return (
    <form action={setUserTargetKm} className="flex items-center gap-2">
      <input type="hidden" name="id" value={shoeId} />
      <input
        type="number"
        name="targetKm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="km"
        min="50"
        max="5000"
        className="w-20 bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      />
      <button
        type="submit"
        className="font-display tracking-wide-display uppercase text-[10px] text-accent hover:text-accent-hover transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setValue(currentTarget?.toString() ?? '');
        }}
        className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}

/* ----------------------------------------------------------------------------
 * PhotoUploadForm — file input that auto-submits on change
 * -------------------------------------------------------------------------- */
export function PhotoUploadForm({ shoeId }: { shoeId: number }) {
  return (
    <form action={uploadShoePhoto} className="inline-block">
      <input type="hidden" name="id" value={shoeId} />
      <label
        htmlFor={`photo-${shoeId}`}
        className="inline-flex items-center gap-1 cursor-pointer font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
      >
        <Camera size={10} strokeWidth={1.5} />
        Photo
      </label>
      <input
        id={`photo-${shoeId}`}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.currentTarget.files && e.currentTarget.files.length > 0) {
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
      />
    </form>
  );
}

/* ----------------------------------------------------------------------------
 * PriceWatchForm — "Note current price" expanding input row
 * -------------------------------------------------------------------------- */
export function PriceWatchForm({
  shoeId,
  retailers,
}: {
  shoeId: number;
  retailers: string[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
      >
        <DollarSign size={10} strokeWidth={1.5} />
        Note current price
      </button>
    );
  }

  return (
    <form
      action={logPriceWatch}
      className="grid grid-cols-1 md:grid-cols-[140px_70px_60px_1fr_auto] gap-2 items-center"
    >
      <input type="hidden" name="shoeId" value={shoeId} />
      <select
        name="retailer"
        required
        defaultValue={retailers[0]}
        className="bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      >
        {retailers.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <input
        type="number"
        name="price"
        step="0.01"
        min="0"
        placeholder="price"
        required
        className="bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      />
      <input
        type="text"
        name="currency"
        defaultValue="NZD"
        maxLength={3}
        className="bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone uppercase focus-visible:outline-none focus-visible:border-accent"
      />
      <input
        type="url"
        name="url"
        placeholder="optional URL"
        className="bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="font-display tracking-wide-display uppercase text-[10px] text-accent hover:text-accent-hover transition-colors"
        >
          Log
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
