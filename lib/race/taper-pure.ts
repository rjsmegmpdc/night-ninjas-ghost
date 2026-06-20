/**
 * Phase 6 part 2 - taper view (PURE).
 *
 * During the taper (final ~3 weeks) the work is done; the job is to arrive
 * fresh without losing sharpness. This module produces the daily-discipline
 * checklist and turns already-computed training stats into honest
 * confidence cues. No DB, no I/O.
 *
 * Confidence cues are deliberately drawn ONLY from data the app actually has
 * (block volume, biggest week, compliance). We do NOT fabricate per-zone pace
 * trends ("tempo improved 12s/km") - that series is not captured.
 */

export type TaperItemKey = 'sleep' | 'hydration' | 'fuel' | 'last-hard' | 'strides' | 'logistics';

export interface TaperChecklistItem {
  key: TaperItemKey;
  title: string;
  detail: string;
}

/**
 * The taper-discipline checklist. Advisory (not a persisted tick-list). One
 * item is day-sensitive: fuelling flips to carb-load inside the final 3 days.
 */
export function taperChecklist(daysToRace: number): TaperChecklistItem[] {
  const loading = daysToRace <= 3;
  return [
    {
      key: 'sleep',
      title: 'Bank sleep',
      detail:
        'Prioritise 8h+ now. The night before the race rarely is the one that counts - the two weeks of sleep before it do.',
    },
    {
      key: 'hydration',
      title: 'Hydrate steadily',
      detail:
        'Consistent fluids + electrolytes across the day, urine pale. Do not over-drink on race morning.',
    },
    {
      key: 'fuel',
      title: loading ? 'Carb-load' : 'Hold normal fuelling',
      detail: loading
        ? 'Ramp carbohydrate per the carb-load plan; keep fat and fibre low so the gut settles.'
        : 'Eat normally - the carb-load starts about 3 days out (see the carb-load plan).',
    },
    {
      key: 'last-hard',
      title: 'Last hard session is behind you',
      detail:
        'No fitness is gained now, only lost to fatigue. Everything from here is sharpening, not building.',
    },
    {
      key: 'strides',
      title: 'Short race-pace strides',
      detail:
        'A few short race-pace (or slightly quicker) strides every couple of days keep the legs sharp at no cost.',
    },
    {
      key: 'logistics',
      title: 'Lock logistics',
      detail:
        'Kit, pins, gels, transport, start timing. Remove every race-morning decision you can in advance.',
    },
  ];
}

export interface TaperCueInput {
  /** Block volume change vs the prior 12-week window, as a percent (e.g. 12 = +12%). */
  volumeDeltaPct: number | null;
  /** Biggest single training week this block, km. */
  biggestWeekKm: number | null;
  /** Prescribed-session compliance this block, percent. */
  compliancePct: number | null;
  /** Longest single run this block, km. */
  longestRunKm: number | null;
}

/**
 * Turn block stats into 0-4 honest confidence cues. Each cue is emitted only
 * when its data is present and meaningful, so a thin history yields fewer cues
 * rather than empty filler.
 */
export function buildTaperCues(input: TaperCueInput): string[] {
  const cues: string[] = [];

  if (input.biggestWeekKm != null && input.biggestWeekKm > 0) {
    cues.push(`Your biggest week this build reached ${Math.round(input.biggestWeekKm)} km - that work is in the bank.`);
  }
  if (input.longestRunKm != null && input.longestRunKm > 0) {
    cues.push(`Longest run this block: ${Math.round(input.longestRunKm)} km. You have been there.`);
  }
  if (input.volumeDeltaPct != null && input.volumeDeltaPct > 3) {
    cues.push(`Training volume is up ${Math.round(input.volumeDeltaPct)}% on the previous block.`);
  }
  if (input.compliancePct != null && input.compliancePct >= 70) {
    cues.push(`You hit ${Math.round(input.compliancePct)}% of prescribed sessions - consistency is the strongest predictor you have.`);
  }

  return cues;
}
