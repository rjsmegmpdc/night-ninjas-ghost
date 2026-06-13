import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';

const STEPS = ['Welcome', 'Strava App', 'Connect', 'Dojo', 'Races', 'Weekly', 'Sync'];

export default function WelcomePage() {
  return (
    <div className="space-y-12">
      <Stepper steps={STEPS} current={1} />

      <div className="grid md:grid-cols-[2fr_3fr] gap-12 items-center">
        <div className="flex justify-center md:justify-end">
          <Logo size={220} className="text-bone" />
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <span className="nn-caps">welcome</span>
            <h1 className="font-display tracking-wide-display text-6xl leading-none uppercase">
              Train in the<br />
              <span className="text-accent">Shadows.</span>
            </h1>
          </div>

          <div className="space-y-4 text-bone-dim text-base max-w-md">
            <p>
              Shadow Tracker is a local-first running training analyser. It pulls
              your activity history from Strava, compares your week against a
              proper plan — Lydiard, Hansons, or your own — and tells you what
              you missed, what you nailed, and where the patterns are.
            </p>
            <p className="text-bone">
              No cloud. No subscription. No advertising. Your data stays on
              this machine.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <Link href="/setup/strava-app">
              <Button variant="primary" size="lg">
                Begin Setup
              </Button>
            </Link>
            <span className="font-mono text-xs text-bone-mute">
              ~5 minutes · 7 steps
            </span>
          </div>
        </div>
      </div>

      {/* Trust strip — what we capture, what we don't */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line mt-16">
        {[
          { label: 'data location', value: 'this machine' },
          { label: 'cloud sync', value: 'never' },
          { label: 'telemetry', value: 'disabled' },
          { label: 'your data', value: 'yours' },
        ].map((cell) => (
          <div key={cell.label} className="bg-ink p-5">
            <div className="nn-caps mb-1">{cell.label}</div>
            <div className="font-display tracking-wide-display text-lg">
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
