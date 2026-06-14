/**
 * Phase 3b - state-aware prescription (pure logic).
 *
 * Three layers (per ROADMAP):
 *   1. State calculation     - CTL/ATL/TSB (athlete-state) + ACWR (here)
 *   2. State interpretation  - interpretState(): what does this state MEAN
 *                              for THIS dojo in THIS phase
 *   3. Plan adjustment       - applyAdjustment(): modify the week template
 *                              through the dojo's lens
 *
 * Dojo philosophy is expressed as DATA (DojoStateProfile), interpreted by
 * shared logic. Hansons tolerates deep negative TSB mid-block (cumulative
 * fatigue is the method); Lydiard's base phase tolerates volume but not
 * intensity; polarised cuts intensity before volume. Each engine declares
 * a profile; engines without one get DEFAULT_PROFILE.
 *
 * CRITICAL INVARIANTS:
 *   - renderWeek() output (raw templates) is NEVER mutated here. We copy.
 *     The engine snapshot net (engine-snapshot.test.ts) must stay green.
 *   - The ACWR >= 1.5 hard rail fires regardless of profile or coach mode.
 *   - This module is pure: no DB, no I/O. The server pipeline
 *     (state-aware-week.ts) owns persistence and mode behaviour.
 */

import type { WeekTemplate, SessionType, PhaseBand, DojoStateProfile } from './types';

export type { PhaseBand, DojoStateProfile };
import type { FormClass } from '@/lib/analysis/athlete-state-pure';

/* ----------------------------------------------------------------------------
 * Phase banding - collapse program position into coarse bands that
 * tolerance profiles key on.
 * -------------------------------------------------------------------------- */

export function phaseBandFor(weekNumber: number | null, programWeeks: number): PhaseBand {
  if (weekNumber === null || weekNumber < 1) return 'off-program';
  const frac = weekNumber / programWeeks;
  if (frac <= 0.3) return 'base';
  if (frac <= 0.75) return 'build';
  if (frac <= 0.9) return 'peak';
  return 'taper';
}

/* ----------------------------------------------------------------------------
 * Dojo state profile - the philosophy, as data.
 * -------------------------------------------------------------------------- */


export const DEFAULT_PROFILE: DojoStateProfile = {
  tsbFloor: { base: -15, build: -20, peak: -20, taper: -5 },
  protectedTypes: ['long'],
  preferIntensityCut: false,
};

/* ----------------------------------------------------------------------------
 * ACWR - acute (7d) vs chronic (28d weekly average) load ratio.
 * Pure computation from two distance sums; the loader feeds it.
 * -------------------------------------------------------------------------- */

export const ACWR_HARD_RAIL = 1.5;
export const ACWR_CAUTION = 1.3;

export function computeAcwr(acute7dKm: number, chronic28dKm: number): number | null {
  if (chronic28dKm <= 0) return null; // not enough history to judge
  const chronicWeekly = chronic28dKm / 4;
  if (chronicWeekly <= 0) return null;
  return Math.round((acute7dKm / chronicWeekly) * 100) / 100;
}

/* ----------------------------------------------------------------------------
 * Interpretation
 * -------------------------------------------------------------------------- */

export type AdjustmentKind = 'hold' | 'reduce-volume' | 'reduce-intensity' | 'add-recovery';
export type AdjustmentTrigger =
  | 'acwr-high'      // hard rail, >= 1.5
  | 'acwr-caution'   // >= 1.3
  | 'tsb-low'        // below dojo floor for the band
  | 'overreached';   // form class floor

export interface StateInterpretation {
  verdict: 'in-range' | 'over-fatigued' | 'injury-risk';
  adjustment: AdjustmentKind;
  /** 0..1 - fraction by which affected sessions are scaled down */
  magnitude: number;
  trigger: AdjustmentTrigger | null;
  /** True when the ACWR hard rail fired - cannot be silently dismissed */
  rail: boolean;
  rationale: string;
}

export interface InterpretInput {
  tsb: number;
  formClass: FormClass;
  acwr: number | null;
  band: PhaseBand;
}

const HOLD: StateInterpretation = {
  verdict: 'in-range',
  adjustment: 'hold',
  magnitude: 0,
  trigger: null,
  rail: false,
  rationale: 'State within the tolerance this method expects for the phase.',
};

export function interpretState(
  input: InterpretInput,
  profile: DojoStateProfile = DEFAULT_PROFILE
): StateInterpretation {
  const { tsb, formClass, acwr, band } = input;

  // Rail 1 - ACWR hard cap. Fires regardless of dojo or phase.
  if (acwr !== null && acwr >= ACWR_HARD_RAIL) {
    return {
      verdict: 'injury-risk',
      adjustment: 'reduce-volume',
      magnitude: 0.25,
      trigger: 'acwr-high',
      rail: true,
      rationale: `Acute:chronic workload ratio ${acwr.toFixed(2)} is at or above ${ACWR_HARD_RAIL} - injury-risk territory regardless of training philosophy. Volume cut enforced.`,
    };
  }

  if (band === 'off-program') return HOLD;

  // Rail 2 - ACWR caution band.
  if (acwr !== null && acwr >= ACWR_CAUTION) {
    return {
      verdict: 'over-fatigued',
      adjustment: 'reduce-volume',
      magnitude: 0.15,
      trigger: 'acwr-caution',
      rail: false,
      rationale: `Load is ramping faster than your chronic base supports (ACWR ${acwr.toFixed(2)}). A modest volume trim keeps the progression sustainable.`,
    };
  }

  // Dojo-specific TSB floor for this band.
  const floor = profile.tsbFloor[band];
  if (tsb < floor) {
    const depth = Math.min((floor - tsb) / 15, 1); // 15 TSB points below floor = max
    const magnitude = Math.round((0.1 + depth * 0.15) * 100) / 100; // 0.10..0.25
    const kind: AdjustmentKind = profile.preferIntensityCut ? 'reduce-intensity' : 'reduce-volume';
    return {
      verdict: 'over-fatigued',
      adjustment: kind,
      magnitude,
      trigger: 'tsb-low',
      rail: false,
      rationale: `Form balance ${tsb.toFixed(0)} is below this method's ${band}-phase floor of ${floor}. ${profile.preferIntensityCut ? 'Easing intensity' : 'Trimming volume'} while keeping the week's structure.`,
    };
  }

  // Form-class floor - overreached always earns at least added recovery.
  if (formClass === 'overreached') {
    return {
      verdict: 'over-fatigued',
      adjustment: 'add-recovery',
      magnitude: 0.1,
      trigger: 'overreached',
      rail: false,
      rationale: 'Form class is overreached. Converting an easy day to recovery to absorb the fatigue before it compounds.',
    };
  }

  return HOLD;
}

/* ----------------------------------------------------------------------------
 * Adjustment application - returns a NEW template, never mutates.
 * -------------------------------------------------------------------------- */

export interface AdjustmentResult {
  template: WeekTemplate;
  changed: boolean;
  /** Human-readable per-change descriptions, e.g. "Tue interval 10 -> 8.5km" */
  changes: string[];
}

const QUALITY_ORDER: SessionType[] = ['interval', 'repetition', 'tempo'];

function cloneTemplate(t: WeekTemplate): WeekTemplate {
  return JSON.parse(JSON.stringify(t)) as WeekTemplate;
}

function round05(km: number): number {
  return Math.round(km * 2) / 2;
}

export function applyAdjustment(
  raw: WeekTemplate,
  interp: StateInterpretation,
  profile: DojoStateProfile = DEFAULT_PROFILE
): AdjustmentResult {
  if (interp.adjustment === 'hold' || interp.magnitude <= 0) {
    return { template: raw, changed: false, changes: [] };
  }

  const t = cloneTemplate(raw);
  const changes: string[] = [];
  const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const scale = 1 - interp.magnitude;

  if (interp.adjustment === 'reduce-volume') {
    for (const day of t.days) {
      for (const s of day.sessions) {
        if (s.type === 'rest' || s.type === 'cross' || s.type === 'strength') continue;
        // The hard rail cuts everything, protected or not - injury risk
        // outranks dojo signatures. Soft adjustments respect protection.
        if (!interp.rail && profile.protectedTypes.includes(s.type)) continue;
        if (s.distanceKmMin === undefined) continue;
        const beforeMin = s.distanceKmMin;
        s.distanceKmMin = round05(s.distanceKmMin * scale);
        if (s.distanceKmMax !== undefined) s.distanceKmMax = round05(s.distanceKmMax * scale);
        if (s.distanceKmMin !== beforeMin) {
          changes.push(`${dayName[day.dow]} ${s.type} ${beforeMin}→${s.distanceKmMin}km`);
        }
      }
    }
  }

  if (interp.adjustment === 'reduce-intensity') {
    // Downgrade the single highest-intensity unprotected quality session.
    outer: for (const quality of QUALITY_ORDER) {
      if (profile.protectedTypes.includes(quality)) continue;
      for (const day of t.days) {
        for (const s of day.sessions) {
          if (s.type !== quality) continue;
          const dist = s.distanceKmMin !== undefined ? round05(s.distanceKmMin * (1 - interp.magnitude / 2)) : undefined;
          changes.push(`${dayName[day.dow]} ${s.type}${s.distanceKmMin ?? ''} → easy${dist ?? ''}`);
          s.type = 'easy';
          s.label = 'Easy (downgraded)';
          if (dist !== undefined) {
            s.distanceKmMin = dist;
            if (s.distanceKmMax !== undefined) s.distanceKmMax = dist;
          }
          break outer;
        }
      }
    }
  }

  if (interp.adjustment === 'add-recovery') {
    // Convert the shortest easy session to recovery, trimmed.
    let target: { dow: number; s: WeekTemplate['days'][number]['sessions'][number] } | null = null;
    for (const day of t.days) {
      for (const s of day.sessions) {
        if (s.type !== 'easy' || s.distanceKmMin === undefined) continue;
        if (!target || s.distanceKmMin < (target.s.distanceKmMin ?? Infinity)) {
          target = { dow: day.dow, s };
        }
      }
    }
    if (target) {
      const before = target.s.distanceKmMin!;
      const after = round05(before * scale);
      target.s.type = 'recovery';
      target.s.label = 'Recovery (added)';
      target.s.distanceKmMin = after;
      if (target.s.distanceKmMax !== undefined) target.s.distanceKmMax = after;
      changes.push(`${dayName[target.dow]} easy${before} → recovery${after}`);
    }
  }

  if (changes.length === 0) {
    return { template: raw, changed: false, changes: [] };
  }

  // Recompute totals from the adjusted days.
  let total = 0;
  let long = 0;
  for (const day of t.days) {
    for (const s of day.sessions) {
      if (s.distanceKmMin === undefined) continue;
      const mid = s.distanceKmMax !== undefined ? (s.distanceKmMin + s.distanceKmMax) / 2 : s.distanceKmMin;
      total += mid;
      if (s.type === 'long') long = Math.max(long, mid);
    }
  }
  t.totalKmTarget = Math.round(total);
  if (long > 0) t.longRunKmTarget = Math.round(long);

  return { template: t, changed: true, changes };
}
