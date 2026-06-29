import { describe, it, expect } from 'vitest';
import {
  overlayWeekAdjustment,
  type MatrixAdjustmentContext,
  type AppliedWeek,
} from './matrix-adjustments-pure';
import { DEFAULT_PROFILE } from './state-awareness';
import type { WeekTemplate } from './types';
import type { Interruption } from '@/lib/analysis/interruptions-pure';

function week(total = 50): WeekTemplate {
  return {
    weekNumber: 8,
    phaseName: 'build',
    totalKmTarget: total,
    longRunKmTarget: 18,
    days: [
      { dow: 0, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 8, distanceKmMax: 8 }] },
      { dow: 1, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 6, distanceKmMax: 6 }] },
      { dow: 2, sessions: [{ label: 'Rest', type: 'rest' }] },
      { dow: 3, sessions: [{ label: 'Tempo', type: 'tempo', distanceKmMin: 10, distanceKmMax: 10 }] },
      { dow: 4, sessions: [{ label: 'Easy', type: 'easy', distanceKmMin: 6, distanceKmMax: 6 }] },
      { dow: 5, sessions: [{ label: 'Rest', type: 'rest' }] },
      { dow: 6, sessions: [{ label: 'Long', type: 'long', distanceKmMin: 18, distanceKmMax: 18 }] },
    ],
  };
}

function ctx(
  applied: Record<string, AppliedWeek> = {},
  interruptions: Interruption[] = []
): MatrixAdjustmentContext {
  return { appliedByWeek: new Map(Object.entries(applied)), interruptions };
}

function interruption(over: Partial<Interruption>): Interruption {
  return {
    id: 1, type: 'travel', bodyRegion: null, severity: 'moderate',
    startDate: '2026-07-13', endDate: '2026-07-17', note: null, ...over,
  };
}

const WEEK_START = '2026-07-13';
const WEEK_END = '2026-07-19';

describe('overlayWeekAdjustment', () => {
  it('reflects an applied adjustment on any week (incl. past)', () => {
    const after = week(40);
    const c = ctx({ [WEEK_START]: { afterState: JSON.stringify(after), mode: 'assisted', trigger: 'tsb-low' } });
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: false,
      weekNumber: 8, programWeeks: 18, rawTemplate: week(50), profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBe('applied');
    expect(r.trigger).toBe('tsb-low');
    expect(r.template.totalKmTarget).toBe(40);
  });

  it('marks an automatic applied row as auto-applied', () => {
    const c = ctx({ [WEEK_START]: { afterState: JSON.stringify(week(38)), mode: 'automatic', trigger: 'acwr-high' } });
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: false,
      weekNumber: 8, programWeeks: 18, rawTemplate: week(50), profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBe('auto-applied');
  });

  it('falls back to raw on a corrupt afterState snapshot', () => {
    const raw = week(50);
    const c = ctx({ [WEEK_START]: { afterState: '{not json', mode: 'assisted', trigger: 'tsb-low' } });
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: false,
      weekNumber: 8, programWeeks: 18, rawTemplate: raw, profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBeNull();
    expect(r.template).toBe(raw);
  });

  it('previews a future illness window as a display-only reduce-volume', () => {
    const c = ctx({}, [interruption({ type: 'illness' })]);
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: true,
      weekNumber: 8, programWeeks: 18, rawTemplate: week(50), profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBe('window');
    expect(r.trigger).toBe('sickness-window');
    expect(r.template.totalKmTarget).toBeLessThan(50);
  });

  it('previews a future travel window as a display-only add-recovery', () => {
    const c = ctx({}, [interruption({ type: 'travel' })]);
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: true,
      weekNumber: 8, programWeeks: 18, rawTemplate: week(50), profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBe('window');
    expect(r.trigger).toBe('travel-window');
  });

  it('does NOT preview a window on a non-future week (current/past)', () => {
    const raw = week(50);
    const c = ctx({}, [interruption({ type: 'illness' })]);
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: false,
      weekNumber: 8, programWeeks: 18, rawTemplate: raw, profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBeNull();
    expect(r.template).toBe(raw);
  });

  it('applied row takes precedence over a window', () => {
    const c = ctx(
      { [WEEK_START]: { afterState: JSON.stringify(week(42)), mode: 'assisted', trigger: 'tsb-low' } },
      [interruption({ type: 'illness' })]
    );
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: true,
      weekNumber: 8, programWeeks: 18, rawTemplate: week(50), profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBe('applied');
  });

  it('returns raw for a future off-program week (no weekNumber)', () => {
    const raw = week(50);
    const c = ctx({}, [interruption({ type: 'illness' })]);
    const r = overlayWeekAdjustment({
      weekStartIso: WEEK_START, weekEndIso: WEEK_END, isFuture: true,
      weekNumber: null, programWeeks: null, rawTemplate: raw, profile: DEFAULT_PROFILE, ctx: c,
    });
    expect(r.source).toBeNull();
    expect(r.template).toBe(raw);
  });
});
