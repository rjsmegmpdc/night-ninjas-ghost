'use client';

import { useState } from 'react';
import { Plus, Star } from 'lucide-react';
import { createCalendarEvent } from '@/lib/actions/calendar-events';

/**
 * Add a personal day — birthday, anniversary, "remember Mum" etc.
 * Stored as a calendar event with eventType='birthday' so the plan
 * engine can ignore it (no impact on training) but the date shows up
 * in the holiday list.
 *
 * If the user wants the day to actually affect training (e.g. "no
 * training on my birthday"), they should use the Commitments section
 * instead — that's the one with impact levels.
 */
export function AddPersonalDayForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-accent transition-colors border border-bone-mute/40 hover:border-accent px-3 py-1"
      >
        <Plus size={11} strokeWidth={1.5} />
        Add personal day
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        // Force eventType + impact for personal days
        fd.set('eventType', 'birthday');
        fd.set('impact', 'none');
        await createCalendarEvent(fd);
        setOpen(false);
      }}
      className="flex flex-wrap items-center gap-2 border border-accent/40 bg-ink-shadow p-3"
    >
      <Star size={12} strokeWidth={1.5} className="text-accent flex-shrink-0" />
      <input
        type="date"
        name="startDate"
        required
        className="bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      />
      <input
        type="text"
        name="title"
        required
        placeholder="e.g. My birthday"
        maxLength={60}
        className="flex-1 min-w-[180px] bg-ink border border-ink-line px-2 py-1 font-mono text-xs text-bone focus-visible:outline-none focus-visible:border-accent"
      />
      <button
        type="submit"
        className="font-display tracking-wide-display uppercase text-[10px] text-accent hover:text-accent-hover transition-colors"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute hover:text-bone transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
