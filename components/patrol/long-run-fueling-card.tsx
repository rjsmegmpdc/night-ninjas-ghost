import { longRunFuelingPlan, applyHeatToFueling } from '@/lib/race/fueling-pure';
import { getForecastForDate } from '@/lib/weather/forecast';
import { heatAdjust } from '@/lib/weather/heat-adjust-pure';

/**
 * Phase 13 - long-run fueling guide, shown on Patrol when today's session
 * is a long run. Server component — fetches today's forecast for heat adjustment.
 */
export async function LongRunFuelingCard({ durationMin }: { durationMin: number }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const forecast = await getForecastForDate(todayIso);

  let plan = longRunFuelingPlan(durationMin);
  let heatNote: string | null = null;

  if (forecast?.tempMaxC != null) {
    const conditions = { tempC: forecast.tempMaxC, humidityPct: forecast.humidityPct ?? 50 };
    const heat = heatAdjust(conditions);
    if (heat.severity !== 'none') {
      const base = {
        durationS: durationMin * 60,
        carbsPerHrG: plan.carbsPerHrG,
        fluidMlPerHr: plan.fluidMlPerHr,
        sodiumMgPerHr: plan.sodiumMgPerHr,
        totalCarbsG: plan.totalCarbsG,
        totalFluidMl: Math.round(plan.fluidMlPerHr * (durationMin / 60)),
        gelCount: plan.gelCount,
        gelIntervalMin: plan.gelIntervalMin,
      };
      const { fueling, heatNote: note } = applyHeatToFueling(base, heat.severity);
      plan = { ...plan, fluidMlPerHr: fueling.fluidMlPerHr, sodiumMgPerHr: fueling.sodiumMgPerHr };
      heatNote = note;
    }
  }

  const cells = [
    { label: 'carbs / hr', value: `${plan.carbsPerHrG} g` },
    { label: 'fluid / hr', value: `${plan.fluidMlPerHr} ml` },
    { label: 'sodium / hr', value: `${plan.sodiumMgPerHr} mg` },
    { label: 'start at', value: `${plan.startFuelingAtMin} min` },
    { label: 'gels', value: plan.gelCount > 0 ? `${plan.gelCount}` : '—' },
    { label: 'gel every', value: plan.gelIntervalMin > 0 ? `${plan.gelIntervalMin} min` : '—' },
  ];

  return (
    <div className="border border-ink-line rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          long run fueling
        </div>
        {heatNote && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-signal-warn border border-signal-warn/40 px-2 py-0.5 rounded">
            heat adjusted
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-px bg-ink-line border border-ink-line rounded-lg overflow-hidden">
        {cells.map((c) => (
          <div key={c.label} className="bg-ink p-3">
            <div className="font-display text-xl text-bone tabular-nums leading-none">{c.value}</div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute mt-1">{c.label}</div>
          </div>
        ))}
      </div>
      {heatNote ? (
        <p className="font-mono text-[10px] text-signal-warn leading-relaxed">{heatNote}</p>
      ) : (
        <p className="font-mono text-[10px] text-bone-mute leading-relaxed">{plan.note}</p>
      )}
    </div>
  );
}
