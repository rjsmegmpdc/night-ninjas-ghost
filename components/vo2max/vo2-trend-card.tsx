import type { Vo2View } from '@/lib/analysis/vo2max';
import { vo2FitnessBand } from '@/lib/analysis/vo2max-pure';
import type { AthleteProfile } from '@/lib/store/settings';

/**
 * R2.5 - the VO2 max overview: current value (with source + fitness band)
 * and a cross-source trend line. Observed-only - a note makes clear this
 * doesn't change training paces in v1.
 */

const SOURCE_LABEL: Record<string, string> = {
  'manual-lab': 'lab',
  cooper: 'Cooper',
  rockport: 'Rockport',
  device: 'device',
};

const SOURCE_DOT: Record<string, string> = {
  'manual-lab': 'bg-signal-ok',
  cooper: 'bg-accent',
  rockport: 'bg-signal-warn',
  device: 'bg-bone-mute',
};

export function Vo2TrendCard({ view, profile }: { view: Vo2View; profile: AthleteProfile }) {
  if (view.current === null) {
    return (
      <div className="border border-ink-line rounded-xl p-6 space-y-3">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          VO2 max
        </div>
        <p className="text-bone-dim text-sm leading-relaxed max-w-xl">
          No VO2 max readings yet. Record a Cooper or Rockport test below, enter
          a lab result, or connect Garmin (under development) to pull device estimates. Your
          progression will chart here across all sources.
        </p>
      </div>
    );
  }

  const band =
    profile.age && profile.sex
      ? vo2FitnessBand(view.current, profile.age, profile.sex)
      : null;

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            VO2 max - current
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-5xl text-bone tabular-nums leading-none">{view.current.toFixed(1)}</span>
            <span className="font-mono text-sm text-bone-mute">ml/kg/min</span>
          </div>
          <div className="flex items-center gap-2 mt-2 font-mono text-[11px] text-bone-dim">
            <span className={`inline-block w-2 h-2 rounded-sm ${SOURCE_DOT[view.currentSource ?? 'device']}`} />
            {SOURCE_LABEL[view.currentSource ?? 'device']} · {view.currentDateIso}
            {band && <span className="text-bone-mute">· {band}</span>}
          </div>
        </div>
        {view.deltaFromFirst !== null && (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">since first</div>
            <div className={`font-display text-2xl tabular-nums ${view.deltaFromFirst >= 0 ? 'text-signal-ok' : 'text-signal-warn'}`}>
              {view.deltaFromFirst >= 0 ? '+' : ''}{view.deltaFromFirst.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {view.series.length >= 2 && <TrendChart view={view} />}

      <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
        ↳ observed only - VO2 max is tracked for insight but does not change your
        training paces in this version. Source priority: lab &gt; Cooper &gt; Rockport &gt; device.
      </p>
    </div>
  );
}

function TrendChart({ view }: { view: Vo2View }) {
  const W = 320;
  const H = 100;
  const values = view.series.map((o) => o.value);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;
  const n = view.series.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - min) / range) * H;

  const path = view.series.map((o, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(o.value).toFixed(1)}`).join(' ');

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }} preserveAspectRatio="none">
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent" vectorEffect="non-scaling-stroke" />
        {view.series.map((o, i) => (
          <circle key={i} cx={x(i)} cy={y(o.value)} r={2.5} className="fill-bone" />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-bone-mute">
        <span>{view.series[0].dateIso}</span>
        <span>{view.series[n - 1].dateIso}</span>
      </div>
    </div>
  );
}
