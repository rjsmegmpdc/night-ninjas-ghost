/**
 * Phase 3b part 2 - matrix adjustment overlay (PURE).
 *
 * Given pre-loaded context (applied adjustments + logged interruptions), decide
 * the template a matrix week should display. No DB, no server-only - the I/O
 * (loadMatrixAdjustmentContext) lives in matrix-adjustments.ts. See that file
 * for the hybrid-semantics rationale.
 */

import {
  interpretState,
  applyAdjustment,
  phaseBandFor,
  type DojoStateProfile,
} from './state-awareness';
import { windowsOverlapping, type Interruption } from '@/lib/analysis/interruptions-pure';
import type { WeekTemplate } from './types';

export interface AppliedWeek {
  afterState: string;
  mode: string;
  trigger: string;
}

export interface MatrixAdjustmentContext {
  /** weekStartIso -> the newest applied/automatic adjustment for that week. */
  appliedByWeek: Map<string, AppliedWeek>;
  interruptions: Interruption[];
}

export interface WeekOverlayResult {
  template: WeekTemplate;
  /** trigger label when an overlay changed the week, else null. */
  trigger: string | null;
  /** 'applied' | 'auto-applied' (persisted) | 'window' (display-only) | null. */
  source: 'applied' | 'auto-applied' | 'window' | null;
}

/**
 * Overlay coach adjustments onto one matrix week's template (hybrid):
 *   (a) an already applied / automatic adjustment is ALWAYS reflected (the real
 *       prescription), any week;
 *   (b) for FUTURE weeks only, a logged sickness/travel window overlapping the
 *       week yields a DISPLAY-ONLY adjusted template - now-state triggers are
 *       not evaluated for other weeks.
 * Returns the raw template unchanged when nothing applies. Never writes.
 */
export function overlayWeekAdjustment(opts: {
  weekStartIso: string;
  weekEndIso: string;
  isFuture: boolean;
  weekNumber: number | null;
  programWeeks: number | null;
  rawTemplate: WeekTemplate;
  profile: DojoStateProfile;
  ctx: MatrixAdjustmentContext;
}): WeekOverlayResult {
  const { weekStartIso, weekEndIso, isFuture, weekNumber, programWeeks, rawTemplate, profile, ctx } = opts;

  // (a) Real, persisted adjustment - always reflected, any week.
  const applied = ctx.appliedByWeek.get(weekStartIso);
  if (applied) {
    try {
      const template = JSON.parse(applied.afterState) as WeekTemplate;
      return {
        template,
        trigger: applied.trigger,
        source: applied.mode === 'automatic' ? 'auto-applied' : 'applied',
      };
    } catch {
      // corrupt snapshot -> fall through to raw
    }
  }

  // (b) Display-only window preview - future, on-program weeks only.
  if (isFuture && weekNumber != null && programWeeks != null) {
    const illnessWindow = windowsOverlapping(ctx.interruptions, weekStartIso, weekEndIso, ['illness']).length > 0;
    const travelWindow = windowsOverlapping(ctx.interruptions, weekStartIso, weekEndIso, ['travel']).length > 0;
    if (illnessWindow || travelWindow) {
      const band = phaseBandFor(weekNumber, programWeeks);
      const interp = interpretState(
        { tsb: 0, formClass: 'maintained', acwr: null, band, illnessWindow, travelWindow, evaluateNowState: false },
        profile
      );
      if (interp.adjustment !== 'hold') {
        const adj = applyAdjustment(rawTemplate, interp, profile);
        if (adj.changed) {
          return { template: adj.template, trigger: interp.trigger, source: 'window' };
        }
      }
    }
  }

  return { template: rawTemplate, trigger: null, source: null };
}
