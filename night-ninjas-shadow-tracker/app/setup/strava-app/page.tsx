import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';

const STEPS = ['Welcome', 'Strava App', 'Connect', 'Dojo', 'Races', 'Weekly', 'Sync'];

export default function StravaAppPage() {
  return (
    <div className="space-y-10">
      <Stepper steps={STEPS} current={2} />

      <div className="space-y-3">
        <span className="nn-caps">step 02 — register</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Register your<br />Strava app
        </h1>
        <p className="text-bone-dim max-w-2xl">
          Strava requires every user to register their own API application.
          This is a one-off, takes about two minutes, and gives you a
          Client ID and Client Secret you'll paste on the next screen.
        </p>
      </div>

      <Card className="space-y-6">
        <div>
          <CardLabel>instructions</CardLabel>
        </div>
        <ol className="space-y-5 text-bone">
          {STRAVA_STEPS.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-mono text-accent font-medium flex-shrink-0 w-6">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <div className="space-y-1">
                <div>{step.text}</div>
                {step.detail && (
                  <div className="text-bone-dim text-sm">{step.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="pt-4 border-t border-ink-line">
          <a
            href="https://www.strava.com/settings/api"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="md">
              Open Strava API page →
            </Button>
          </a>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Link href="/setup">
          <Button variant="ghost">← Back</Button>
        </Link>
        <Link href="/setup/connect">
          <Button variant="primary">I have my credentials →</Button>
        </Link>
      </div>
    </div>
  );
}

const STRAVA_STEPS = [
  {
    text: 'Open the Strava API settings page (button below).',
    detail: 'You may need to log into Strava first.',
  },
  {
    text: 'Click "Create & Manage Your App" if you haven\'t before.',
  },
  {
    text: 'Fill in: Application Name (anything — e.g. "Shadow Tracker"), Category (choose any), Website (anything — e.g. yourname.run).',
    detail: 'These are decorative. Strava doesn\'t verify them for personal-use apps.',
  },
  {
    text: 'For Authorization Callback Domain, enter exactly: localhost',
    detail: 'No port number, no protocol — just the word "localhost".',
  },
  {
    text: 'Agree to the API Agreement and submit.',
  },
  {
    text: 'Note your Client ID (a number) and Client Secret (a long alphanumeric string).',
    detail: 'You\'ll paste these on the next screen. The secret stays in your OS keychain — it never leaves this machine.',
  },
];
