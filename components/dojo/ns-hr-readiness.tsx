'use client';

import { useState } from 'react';
import { HeartPulse, ChevronDown, ChevronUp, Check, AlertTriangle, XCircle, Mountain, Gauge } from 'lucide-react';
import type { HrAvailability } from '@/lib/analysis/hr-availability';

/**
 * NS HR-readiness callout. Shown when Norwegian Singles is selected in the
 * dojo picker. NS depends on accurate HR zoning more than any other method
 * here, so this:
 *   - States the dependency plainly
 *   - Shows the athlete's live HR-data status from Strava (coverage + max)
 *   - Calls out missing HR data or a missing measured max HR
 *   - Describes the known max-HR test protocols (the athlete does the work)
 *
 * All user-driven: nothing is automated. The component highlights what to
 * do and why it matters.
 */

export function NsHrReadiness({ availability }: { availability: HrAvailability | null }) {
  const [showProtocols, setShowProtocols] = useState(false);

  return (
    <div className="border border-accent/40 bg-accent-faint rounded-xl p-6 space-y-5">
      <div className="flex items-start gap-3">
        <HeartPulse size={22} strokeWidth={1.5} className="text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-accent">
            before you commit to norwegian singles
          </div>
          <h3 className="font-display tracking-wide-display uppercase text-xl text-bone">
            This method runs on accurate heart rate
          </h3>
        </div>
      </div>

      <p className="text-sm text-bone-dim leading-relaxed">
        Norwegian Singles depends on holding sub-threshold precisely - easy days
        genuinely easy, quality days controlled below the threshold line. That
        only works if your HR zones are built on a <strong className="text-bone">measured
        max heart rate</strong>, not an age estimate. The guardrails on your
        dashboard use this same data to flag easy days that ran hot and reps that
        ran too hard. Get the inputs right and the method polices itself.
      </p>

      {/* Live HR-data status */}
      {availability && <HrStatus availability={availability} />}

      {/* Max-HR test protocols */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowProtocols((v) => !v)}
          className="flex items-center gap-2 font-display tracking-wide-display uppercase text-xs text-bone hover:text-accent transition-colors"
          aria-expanded={showProtocols}
        >
          {showProtocols ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          How to get an accurate max HR
        </button>

        {showProtocols && (
          <div className="space-y-4 pl-1">
            <p className="text-sm text-bone-dim leading-relaxed">
              Max HR is individual and not well predicted by 220-age (that formula
              carries a 10-12 bpm error - enough to misplace a whole zone). A field
              test under real fatigue gives the truest read. Both protocols below
              need a recent HR file from a chest strap or watch; record them on
              Strava and your observed peak updates automatically. Warm up
              thoroughly first, and only test when healthy and rested.
            </p>

            <Protocol
              icon={Mountain}
              title="Hill rep test (most reliable)"
              steps={[
                'Warm up 15 minutes easy, then a few strides.',
                'Find a steady hill of about 2 minutes climbing.',
                'Run 3 hard hill reps, jogging back down between each.',
                'On the third rep, go all-out to the top, driving the final 30 seconds.',
                'Your max HR is the highest value seen at or just after the top of that last rep.',
              ]}
            />

            <Protocol
              icon={Gauge}
              title="Flat max-effort test"
              steps={[
                'Warm up 15 minutes easy.',
                'Run 5 minutes building from hard to all-out, flat course or track.',
                'Sprint the final 45 seconds with everything left.',
                'Peak HR in the last minute approximates your max.',
                'Repeat the all-out finish once more after a 3-minute jog if the first felt sub-maximal.',
              ]}
            />

            <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
              ↳ once you have a number, set it as your max HR on the VO2 Max page
              (Analytics → VO2 Max → athlete profile). That single value calibrates
              every HR zone and switches the NS guardrails from estimated to reliable.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HrStatus({ availability }: { availability: HrAvailability }) {
  const { status, runCount, withHrCount, observedMaxHr, hasMeasuredMaxHr, age } = availability;

  const coverageRow = (() => {
    if (status === 'no-activities') {
      return { icon: AlertTriangle, tone: 'text-signal-warn', text: 'No running activities synced yet - connect Strava and sync so we can check your HR data.' };
    }
    if (status === 'good') {
      return { icon: Check, tone: 'text-signal-ok', text: `HR data present on ${withHrCount} of ${runCount} recent runs. Good coverage.` };
    }
    if (status === 'partial') {
      return { icon: AlertTriangle, tone: 'text-signal-warn', text: `Only ${withHrCount} of ${runCount} recent runs have HR data. Wear a monitor (a chest strap is best) on every run for NS - the method needs it.` };
    }
    return { icon: XCircle, tone: 'text-signal-miss', text: `None of your ${runCount} recent runs carry HR data. Norwegian Singles can't police easy/quality effort without it - wear a heart-rate monitor on every run.` };
  })();

  const maxRow = (() => {
    if (hasMeasuredMaxHr) {
      return { icon: Check, tone: 'text-signal-ok', text: 'Measured max HR is set - your zones are calibrated.' };
    }
    const est = age ? 220 - age : null;
    const obs = observedMaxHr ? `Your highest HR seen on Strava is ${Math.round(observedMaxHr)} bpm - a better starting point than the estimate. ` : '';
    return {
      icon: XCircle,
      tone: 'text-signal-miss',
      text: `No measured max HR set${est ? `, so zones fall back to 220-age = ${est} bpm` : ''}. ${obs}Run a max test (below) for an accurate figure.`,
    };
  })();

  return (
    <div className="bg-ink-shadow border border-ink-line rounded-lg p-4 space-y-3">
      <div className="font-display tracking-wide-display uppercase text-[10px] text-bone-mute">your hr data right now</div>
      {[coverageRow, maxRow].map((row, i) => {
        const Icon = row.icon;
        return (
          <div key={i} className="flex items-start gap-2">
            <Icon size={14} strokeWidth={1.5} className={`${row.tone} shrink-0 mt-0.5`} />
            <span className="text-sm text-bone-dim leading-relaxed">{row.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function Protocol({ icon: Icon, title, steps }: { icon: typeof Mountain; title: string; steps: string[] }) {
  return (
    <div className="bg-ink-shadow border border-ink-line rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} strokeWidth={1.5} className="text-accent" />
        <span className="font-display tracking-wide-display uppercase text-sm text-bone">{title}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm text-bone-dim leading-relaxed">
            <span className="font-mono text-[11px] text-accent shrink-0 mt-0.5">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
