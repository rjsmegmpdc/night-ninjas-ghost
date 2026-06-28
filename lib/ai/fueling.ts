import { callModel } from './client';
import { formatDuration } from '@/lib/plans/derive';
import type { FuelingPlan } from '@/lib/race/execution-pure';
import type { CarbLoadPlan } from '@/lib/race/execution-pure';
import type { HeatAdjustment } from '@/lib/weather/heat-adjust-pure';
import type { AiModel } from './models';
import { MODELS } from './models';

export interface FuelingBriefingInput {
  raceName: string;
  distanceKm: number;
  targetTimeS: number;
  fueling: FuelingPlan;
  carbLoad: CarbLoadPlan | null;
  heat: HeatAdjustment | null;
  weightKg: number | null;
  activeInjuries: string[];
}

const SYSTEM = `You are an experienced distance-running coach advising on race-day fueling and carbohydrate strategy. Be specific, practical, and evidence-based. One concise paragraph of 4–6 sentences maximum. Address the athlete directly. Never recommend specific brands or products. Never make medical claims. Acknowledge any heat conditions if present.`;

export function buildFuelingPrompt(i: FuelingBriefingInput): string {
  const parts: string[] = [];
  parts.push(`Race: ${i.raceName}, ${i.distanceKm} km, target ${formatDuration(i.targetTimeS)}`);
  parts.push(
    `Fueling plan: ${i.fueling.carbsPerHrG} g carbs/hr, ${i.fueling.fluidMlPerHr} ml fluid/hr, ${i.fueling.sodiumMgPerHr} mg sodium/hr` +
    (i.fueling.gelCount > 0
      ? `, ${i.fueling.gelCount} gels at ${i.fueling.gelIntervalMin}-min intervals`
      : '')
  );
  if (i.carbLoad) {
    parts.push(`Carb-load: ${i.carbLoad.gramsPerKg} g/kg/day (${i.carbLoad.days[0].gramsCarb} g) over the 3 days before the race`);
  }
  if (i.heat && i.heat.severity !== 'none') {
    parts.push(`Conditions: ${i.heat.severity} heat (apparent ${i.heat.apparentTempC}°C, ${i.heat.paceAdjustPct.toFixed(1)}% pace penalty)`);
  }
  if (i.weightKg) {
    parts.push(`Athlete weight: ${Math.round(i.weightKg)} kg`);
  }
  if (i.activeInjuries.length > 0) {
    parts.push(`Active issues: ${i.activeInjuries.join(', ')}`);
  }
  return parts.join('\n');
}

export async function generateFuelingBriefing(
  input: FuelingBriefingInput,
  model: AiModel,
) {
  const userPrompt = buildFuelingPrompt(input);
  return callModel(
    model,
    SYSTEM,
    `Given this context, provide one concise paragraph of personalised race-day fueling advice:\n\n${userPrompt}`,
    500,
  );
}
