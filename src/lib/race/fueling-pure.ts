/**
 * Phase 13 - race fueling depth (PURE).
 *
 * Two capabilities layered on top of Phase 6:
 *   1. longRunFuelingPlan: training long-run protocol with gut-training cues.
 *      Fueling starts at 45 min (before that, the body manages without).
 *   2. applyHeatToFueling: adjusts fluid and sodium in a FuelingPlan based on
 *      the Phase 7 heat severity already computed by heatAdjust().
 *
 * No DB, no I/O. Pure functions, unit-tested.
 */

import type { FuelingPlan } from './execution-pure';
import type { HeatSeverity } from '@/lib/weather/heat-adjust-pure';

export interface LongRunFuelingPlan {
  durationMin: number;
  carbsPerHrG: number;
  fluidMlPerHr: number;
  sodiumMgPerHr: number;
  totalCarbsG: number;
  gelCount: number;
  gelIntervalMin: number;
  startFuelingAtMin: number;
  note: string;
}

const GEL_CARB_G = 25;
const FUELING_DELAY_MIN = 45;

/**
 * Training long-run fueling protocol.
 *
 * Same carb-intake ladder as race day (30/60/90 g/hr). Fueling starts at 45
 * minutes — gut training on shorter efforts causes unnecessary GI stress and
 * gains nothing. Fluid baseline 500 ml/hr; sodium 400 mg/hr (slightly below
 * race day — training runs are typically easier effort and cooler).
 */
export function longRunFuelingPlan(durationMin: number): LongRunFuelingPlan {
  const hours = durationMin / 60;
  const carbsPerHrG = hours <= 1 ? 30 : hours <= 2.5 ? 60 : 90;
  const fluidMlPerHr = 500;
  const sodiumMgPerHr = 400;

  const fueledMin = Math.max(0, durationMin - FUELING_DELAY_MIN);
  const fueledHours = fueledMin / 60;
  const totalCarbsG = Math.round(carbsPerHrG * fueledHours);
  const gelCount = totalCarbsG > 0 ? Math.round(totalCarbsG / GEL_CARB_G) : 0;
  const gelIntervalMin =
    gelCount > 0 ? Math.round(fueledMin / gelCount) : 0;

  const note =
    gelCount > 0
      ? `Start at 45 min. ${gelCount} gel${gelCount === 1 ? '' : 's'} total, one every ${gelIntervalMin} min from there. Drink consistently — don't wait until thirsty.`
      : 'Under 60 min of fueled time — water to thirst is enough. Save the gut practice for your longer efforts.';

  return {
    durationMin,
    carbsPerHrG,
    fluidMlPerHr,
    sodiumMgPerHr,
    totalCarbsG,
    gelCount,
    gelIntervalMin,
    startFuelingAtMin: FUELING_DELAY_MIN,
    note,
  };
}

/**
 * Heat adjustment to a race-day FuelingPlan.
 *
 * Uses the same severity classification as Phase 7 heatAdjust() so the fluid
 * and pacing advisories stay coherent. Adjustments follow Sawka et al. sweat-
 * rate evidence for trained athletes:
 *   mild     (+1–2% pace): +150 ml/hr fluid, +200 mg/hr sodium
 *   moderate (+3–5%):      +300 ml/hr fluid, +400 mg/hr sodium
 *   severe   (+6–10%):     +500 ml/hr fluid, +600 mg/hr sodium
 *
 * Returns the original plan unchanged when severity is 'none', with heatNote null.
 */
export function applyHeatToFueling(
  base: FuelingPlan,
  severity: HeatSeverity,
): { fueling: FuelingPlan; heatNote: string | null } {
  if (severity === 'none') {
    return { fueling: base, heatNote: null };
  }

  const fluidExtra = severity === 'mild' ? 150 : severity === 'moderate' ? 300 : 500;
  const sodiumExtra = severity === 'mild' ? 200 : severity === 'moderate' ? 400 : 600;

  const adjustedFluid = base.fluidMlPerHr + fluidExtra;
  const adjustedSodium = base.sodiumMgPerHr + sodiumExtra;

  const fueling: FuelingPlan = {
    ...base,
    fluidMlPerHr: adjustedFluid,
    sodiumMgPerHr: adjustedSodium,
    totalFluidMl: Math.round(adjustedFluid * (base.durationS / 3600)),
  };

  const notes: Record<Exclude<HeatSeverity, 'none'>, string> = {
    mild: `Mild heat — +${fluidExtra} ml/hr fluid, +${sodiumExtra} mg/hr sodium above sea-level baseline.`,
    moderate: `Moderate heat — +${fluidExtra} ml/hr fluid, +${sodiumExtra} mg/hr sodium. Hit every aid station.`,
    severe: `Severe heat — +${fluidExtra} ml/hr fluid, +${sodiumExtra} mg/hr sodium. Prioritise finishing safely over time.`,
  };

  return { fueling, heatNote: notes[severity] };
}
