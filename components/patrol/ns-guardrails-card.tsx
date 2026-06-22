import type { NsGuardReport, GuardSeverity } from '@/lib/analysis/ns-guardrails';
import { Shield, Check, AlertTriangle, XCircle, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

/**
 * NS-2 / NS-3 - the Norwegian Singles discipline panel. Shown on the
 * dashboard only when NS is the active method. Four guards: easy-day
 * discipline, rep control, quality-cap meter, max-HR validity.
 */

const SEV_ICON = { ok: Check, warn: AlertTriangle, miss: XCircle };
const SEV_TONE: Record<GuardSeverity, string> = {
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  miss: 'text-signal-miss',
};
const SEV_BORDER: Record<GuardSeverity, string> = {
  ok: 'border-ink-line',
  warn: 'border-signal-warn/40 bg-signal-warn/5',
  miss: 'border-signal-miss/40 bg-signal-miss/5',
};

function GuardRow({ severity, title, body }: { severity: GuardSeverity; title: string; body: string }) {
  const Icon = SEV_ICON[severity];
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${SEV_BORDER[severity]}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.5} className={SEV_TONE[severity]} />
        <span className="font-display tracking-wide-display uppercase text-sm text-bone">{title}</span>
      </div>
      <p className="text-sm text-bone-dim leading-relaxed pl-6">{body}</p>
    </div>
  );
}

export function NsGuardrailsCard({ report }: { report: NsGuardReport }) {
  const cap = report.qualityCap;
  const capPct = Math.round(cap.fraction * 100);
  // Meter: target band 20-25% drawn as a marker zone on a 0-40% scale.
  const scaleMax = 40;
  const pos = (v: number) => `${Math.min((v / scaleMax) * 100, 100)}%`;

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} strokeWidth={1.5} className="text-accent" />
          <div>
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">norwegian singles</div>
            <div className="font-display tracking-wide-display uppercase text-lg text-bone">Discipline check</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`font-mono text-xl font-bold tabular-nums leading-none ${report.disciplineScore >= 80 ? 'text-signal-ok' : report.disciplineScore >= 50 ? 'text-signal-warn' : 'text-signal-miss'}`}>
              {report.disciplineScore}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-bone-mute">score</div>
          </div>
          <span className={`font-mono text-[10px] uppercase tracking-widest ${SEV_TONE[report.worst]}`}>
            {report.worst === 'ok' ? 'on method' : report.worst === 'warn' ? 'watch' : 'off method'}
          </span>
        </div>
      </div>

      {/* Quality-cap meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">quality of volume (last 3 weeks)</span>
          <span className={`font-mono text-xs ${SEV_TONE[cap.severity]}`}>{capPct}% / target 22%</span>
        </div>
        <div className="relative h-3 bg-ink-shadow border border-ink-line rounded-full overflow-hidden">
          {/* target band 20-25% */}
          <div className="absolute inset-y-0 bg-signal-ok/20" style={{ left: pos(20), right: `calc(100% - ${pos(25)})` }} />
          {/* actual fill */}
          <div className={`absolute inset-y-0 left-0 rounded-full ${cap.severity === 'miss' ? 'bg-signal-miss' : cap.severity === 'warn' ? 'bg-signal-warn' : 'bg-accent'}`} style={{ width: pos(capPct) }} />
        </div>
        <p className="font-mono text-[10px] text-bone-mute leading-relaxed">{cap.body}</p>
      </div>

      <div className="space-y-2">
        <GuardRow {...report.easyDiscipline} />
        <GuardRow {...report.repIntensity} />
        <GuardRow {...report.maxHrGuard} />
      </div>

      <div className="pt-1 flex items-center justify-between">
        <p className="font-mono text-[10px] text-bone-mute">3-week rolling window</p>
        <Link
          href="/profile#ns-calibration"
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-accent transition-colors"
        >
          <SlidersHorizontal size={10} strokeWidth={1.5} />
          Edit HR caps
        </Link>
      </div>
    </div>
  );
}
