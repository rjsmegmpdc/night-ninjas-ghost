import { describe, it, expect } from 'vitest';
import { ALL_ENGINES } from './index';
import type { PlanEngine, PlanParams, WeekTemplate, Level } from './types';

/**
 * Engine characterization snapshots - the regression net for Phase 3b.
 *
 * Before adding state-aware clamping (interpretState/applyAdjustment) to
 * the 8 dojo engines, we pin their CURRENT output. Each engine is run
 * across its full program span for three athlete levels, and a compact
 * per-week digest is snapshotted.
 *
 * When 3b lands, any unintended change to a raw template (a clamp leaking
 * into the unclamped path, a refactor breaking Lydiard's hill phase, etc.)
 * fails these tests with a readable diff.
 *
 * Digest format per week (one line):
 *   "W03 base | 52km L16 | Mon easy8 / Tue int10 / Wed rest / ..."
 *
 * Deliberately compact: full DayPlan objects would make snapshots huge and
 * diffs unreadable. The digest captures what matters - phase, totals,
 * long run, and the per-day session shape - while staying reviewable.
 *
 * Determinism: fixed params, no WeekContext (raw templates only). The
 * engines must be pure functions of (params, weekNumber).
 */

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

/** Fixed, deterministic params - Matt-like marathon target. */
function paramsFor(engine: PlanEngine, level: Level): PlanParams {
  return {
    goalDistanceKm: 42.195,
    goalTimeS: 3 * 3600, // 3:00:00 - sub-3 goal
    level,
    programWeeks: engine.defaultProgramWeeks,
    startDate: '2026-06-29', // fixed Monday
  };
}

function fmtKm(km: number | undefined): string {
  if (km === undefined) return '';
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Compact one-line digest of a WeekTemplate. */
function digestWeek(t: WeekTemplate): string {
  const days = [0, 1, 2, 3, 4, 5, 6]
    .map((dow) => {
      const day = t.days.find((d) => d.dow === dow);
      if (!day || day.sessions.length === 0) return `${DAY_LABELS[dow]} -`;
      const sessions = day.sessions
        .map((s) => {
          const dist = s.distanceKmMin !== undefined
            ? fmtKm(s.distanceKmMax !== undefined && s.distanceKmMax !== s.distanceKmMin
                ? (s.distanceKmMin + s.distanceKmMax) / 2
                : s.distanceKmMin)
            : '';
          const dur = s.durationMinMin !== undefined ? `${s.durationMinMin}m` : '';
          return `${s.type}${dist}${dur}`;
        })
        .join('+');
      return `${DAY_LABELS[dow]} ${sessions}`;
    })
    .join(' / ');

  const wk = String(t.weekNumber).padStart(2, '0');
  return `W${wk} ${t.phaseName} | ${fmtKm(t.totalKmTarget)}km L${fmtKm(t.longRunKmTarget)} | ${days}`;
}

describe('engine characterization snapshots (3b regression net)', () => {
  for (const engine of ALL_ENGINES) {
    describe(engine.dojo, () => {
      for (const level of LEVELS) {
        it(`${level} - full program span`, () => {
          const params = paramsFor(engine, level);
          const weeks: string[] = [];
          for (let w = 1; w <= (params.programWeeks ?? 18); w++) {
            const template = engine.renderWeek(params, w, undefined);
            weeks.push(digestWeek(template));
          }
          expect(weeks).toMatchSnapshot();
        });
      }

      it('is deterministic - same input, same output', () => {
        const params = paramsFor(engine, 'intermediate');
        const a = digestWeek(engine.renderWeek(params, 5, undefined));
        const b = digestWeek(engine.renderWeek(params, 5, undefined));
        expect(a).toBe(b);
      });

      it('respects weeklyVolumeCapKm when provided', () => {
        const params: PlanParams = { ...paramsFor(engine, 'advanced'), weeklyVolumeCapKm: 60 };
        for (let w = 1; w <= (params.programWeeks ?? 18); w++) {
          const t = engine.renderWeek(params, w, undefined);
          // Allow a small tolerance: engines may round per-day distances up.
          expect(t.totalKmTarget).toBeLessThanOrEqual(60 * 1.05);
        }
      });

      it('a cap at 85% of natural peak is honored within rounding tolerance', () => {
        const base = paramsFor(engine, 'advanced');
        const programWeeks = base.programWeeks ?? 18;
        const uncappedPeak = Math.max(
          ...Array.from({ length: programWeeks }, (_, i) =>
            engine.renderWeek(base, i + 1, undefined).totalKmTarget ?? 0
          )
        );
        if (uncappedPeak <= 40) return; // engine naturally low — skip
        const cap = Math.floor(uncappedPeak * 0.85);
        const capped: PlanParams = { ...base, weeklyVolumeCapKm: cap };
        const cappedPeak = Math.max(
          ...Array.from({ length: programWeeks }, (_, i) =>
            engine.renderWeek(capped, i + 1, undefined).totalKmTarget ?? 0
          )
        );
        // Per-session rounding can add up to 3km; must still be below the natural peak.
        expect(cappedPeak).toBeLessThanOrEqual(cap + 3);
        expect(cappedPeak).toBeLessThan(uncappedPeak);
      });
    });
  }
});
