// ---------------------------------------------------------------------------
// HelpPage — static reference screen, no data fetching, no hooks
// ---------------------------------------------------------------------------

const GETTING_STARTED: { step: string; detail: string }[] = [
  {
    step: 'iPhone? Add to home screen FIRST',
    detail:
      'In Safari: Share button → "Add to Home Screen", then open GHOST from the new icon and do everything below inside it. iOS gives the installed app its own separate storage — setting up in the Safari tab first means doing it twice.',
  },
  {
    step: 'Read the privacy card',
    detail:
      'First open shows what GHOST stores on your device — everything stays local, no accounts, no server. Tap "Got it — let\'s go".',
  },
  {
    step: 'Create your Strava API app (once, ~2 min)',
    detail:
      'The Setup wizard walks you through it: open strava.com/settings/api, fill the form using the values shown (Copy buttons give you the exact Website and Callback Domain), upload any photo as the icon.',
  },
  {
    step: 'Paste your Client ID and Secret',
    detail:
      'Strava shows both after saving. Paste them into Step 2 of the wizard — they\'re stored only on this device. They identify your API app, not your Strava account; GHOST never sees your password.',
  },
  {
    step: 'Connect with Strava',
    detail:
      'Tap the orange button, approve on strava.com (tick the privacy checkbox to include private activities), and your last 90 days of activities sync automatically.',
  },
  {
    step: 'Optional: back up your profile',
    detail:
      'Setup → Profile Sync → "Back up this device". Verify your email with a 6-digit code, choose a passphrase (no reset — remember it!). Any other device is then just Restore + Connect — no wizard, no copy-paste.',
  },
  {
    step: 'Make it yours',
    detail:
      'Settings → Preferences: pick your home page (where the GHOST button goes), font size, and one of six themes. Then set a goal race in Calendar and pick a plan in Dojo.',
  },
];

const GLOSSARY: { term: string; screen: string; meaning: string }[] = [
  { term: 'Patrol',    screen: '/patrol',    meaning: 'Dashboard — streak, weekly summary, compliance snapshot' },
  { term: 'Recon',     screen: '/recon',     meaning: 'Trend analysis — 6-month volume, zone distribution, CTL/ATL' },
  { term: 'Strike',    screen: '/strike',    meaning: 'Athlete state — 8-week CTL/ATL/TSB and intensity breakdown' },
  { term: 'Dojo',      screen: '/dojo',      meaning: 'Training methodology — pick your plan structure' },
  { term: 'Calendar',  screen: '/calendar',  meaning: 'Race schedule, capacity caps, commitments' },
  { term: 'Race',      screen: '/race',      meaning: 'Race-day tools — pace plan, fueling, carb-load, taper' },
  { term: 'Vo2max',    screen: '/vo2max',    meaning: 'Aerobic ceiling — test entry, trend, insights' },
  { term: 'Coach Log', screen: '/coach-log', meaning: 'Daily wellness log — sleep, energy, stress, resting HR' },
  { term: 'Journal',   screen: '/journal',   meaning: 'Training diary — 30-day calendar view with notes' },
  { term: 'Gear',      screen: '/gear',      meaning: 'Shoes with rotation analysis, clothing, hardware, food, deal watchlist' },
  { term: 'Club',      screen: '/club',      meaning: 'Share your training schedule with your running group' },
  { term: 'Profile',   screen: '/profile',   meaning: 'Athlete settings — zones, HR, strength preferences' },
  { term: 'Settings',  screen: '/settings',  meaning: 'App settings — Strava, data export' },
  { term: 'Setup',     screen: '/setup',     meaning: 'Initial configuration — Strava OAuth, first sync' },
];

const TASKS: { title: string; description: string }[] = [
  {
    title: 'Sync activities',
    description:
      'Go to Setup and tap "Sync last 90 days". First time: use "Pull full history" for your complete archive.',
  },
  {
    title: 'Set a goal race',
    description:
      'Go to Calendar — Goal Race card — fill in race date, distance, and target time.',
  },
  {
    title: 'Pick a training plan',
    description:
      'Go to Dojo — choose a methodology — set your start date.',
  },
  {
    title: 'Log wellness',
    description:
      'Go to Coach Log — fill in today\'s sleep, energy, and stress ratings.',
  },
  {
    title: 'Track a VO2 max test',
    description:
      'Go to Vo2max — choose Cooper, Rockport, or Lab — enter your result.',
  },
  {
    title: 'Import your shoes',
    description:
      'Go to Gear — "Import from Strava" pulls your whole shoe inventory with mileage. Clothing, packs, and food are added manually.',
  },
  {
    title: 'Move to a new device',
    description:
      'Old device: Setup — Profile Sync — "Back up this device". New device: "Restore to this device" — same email + passphrase — then Connect with Strava.',
  },
  {
    title: 'Log time off',
    description:
      'Go to Calendar — Commitments — add a sickness or travel event.',
  },
];

const TROUBLESHOOTING: { title: string; description: string }[] = [
  {
    title: 'App looks outdated / new features missing',
    description:
      'Close ALL GHOST tabs, then reopen — the updated version activates on the next full load. Do NOT use "Clear site data": that deletes your entire local training database along with the cache.',
  },
  {
    title: 'Strava OAuth redirect fails',
    description:
      'Ensure your Strava App\'s "Authorization Callback Domain" is set to the production domain (not localhost). Found at strava.com/settings/api — Edit.',
  },
  {
    title: 'Activities not appearing after sync',
    description:
      'Check Setup — sync status. If a job is stuck, it may be rate-limited. Wait a minute and try again.',
  },
  {
    title: 'Data shows "MemoryVFS"',
    description:
      'Your browser doesn\'t support OPFS, or you\'re in private browsing. Data will be lost when you close the tab. Use Chrome or Edge for persistence.',
  },
];

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Card (tasks + troubleshooting)
// ---------------------------------------------------------------------------

function Card({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-ink-line p-5 space-y-2">
      <p className="font-mono text-sm text-bone font-bold">{title}</p>
      <p className="font-mono text-sm text-bone-dim leading-relaxed">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HelpPage() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-16">

      {/* Page header */}
      <header className="border-b border-ink-line pb-6 space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Help</h1>
        <p className="font-mono text-sm text-bone-dim leading-relaxed">
          Reference — how GHOST works
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Section 0: Getting started — new club members                       */}
      {/* ------------------------------------------------------------------ */}
      <section id="getting-started" aria-labelledby="getting-started-heading">
        <SectionLabel>New here?</SectionLabel>
        <h2
          id="getting-started-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-2"
        >
          Getting started
        </h2>
        <p className="font-mono text-sm text-bone-dim leading-relaxed max-w-3xl mb-6">
          One-time setup, about five minutes. After this, GHOST just works —
          open it and your training is there.
        </p>

        <ol className="space-y-3">
          {GETTING_STARTED.map(({ step, detail }, i) => (
            <li key={step} className="border border-ink-line p-5 flex gap-4">
              <span className="font-display tracking-widest text-2xl text-accent leading-none select-none">
                {i + 1}
              </span>
              <div className="space-y-1.5 min-w-0">
                <p className="font-mono text-sm text-bone font-bold">{step}</p>
                <p className="font-mono text-sm text-bone-dim leading-relaxed">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Glossary                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section id="glossary" aria-labelledby="glossary-heading">
        <SectionLabel>Reference</SectionLabel>
        <h2
          id="glossary-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-6"
        >
          Glossary
        </h2>

        <div className="border border-ink-line overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink-line">
                <th className="font-mono text-xs text-bone-mute uppercase tracking-widest px-5 py-3 w-32">
                  Term
                </th>
                <th className="font-mono text-xs text-bone-mute uppercase tracking-widest px-5 py-3 w-36">
                  Screen
                </th>
                <th className="font-mono text-xs text-bone-mute uppercase tracking-widest px-5 py-3">
                  What it means
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-line">
              {GLOSSARY.map(({ term, screen, meaning }) => (
                <tr key={term} className="hover:bg-ink-shadow transition-colors">
                  <td className="px-5 py-3 font-display tracking-widest text-sm uppercase text-bone">
                    {term}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-bone-mute tabular-nums">
                    {screen}
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
                    {meaning}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Common tasks                                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="tasks" aria-labelledby="tasks-heading">
        <SectionLabel>Howto</SectionLabel>
        <h2
          id="tasks-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-6"
        >
          Common tasks
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {TASKS.map(({ title, description }) => (
            <Card key={title} title={title} description={description} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Database                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section id="data" aria-labelledby="data-heading">
        <SectionLabel>Storage</SectionLabel>
        <h2
          id="data-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-4"
        >
          Database
        </h2>

        <p className="font-mono text-sm text-bone-dim leading-relaxed max-w-3xl mb-8">
          GHOST stores all data locally in your browser using OPFS (Origin Private File System) or
          in-memory storage. Nothing is sent to a server except the Strava OAuth exchange. Data
          persists across sessions unless you clear site data or use the wipe option in Settings.
        </p>

        <div className="space-y-8">
          {/* Storage location */}
          <div>
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-3">
              Storage location
            </p>
            <div className="border border-ink-line divide-y divide-ink-line">
              <div className="px-5 py-3 grid sm:grid-cols-[240px_1fr] gap-2">
                <span className="font-mono text-sm text-bone">Browser (Chrome / Edge / Firefox)</span>
                <span className="font-mono text-sm text-bone-dim leading-relaxed">
                  OPFS — survives page refresh, lost on "Clear site data"
                </span>
              </div>
              <div className="px-5 py-3 grid sm:grid-cols-[240px_1fr] gap-2">
                <span className="font-mono text-sm text-bone">Safari / private browsing</span>
                <span className="font-mono text-sm text-bone-dim leading-relaxed">
                  MemoryVFS — lost on tab close
                </span>
              </div>
              <div className="px-5 py-3 grid sm:grid-cols-[240px_1fr] gap-2">
                <span className="font-mono text-sm text-bone">Storage label</span>
                <span className="font-mono text-sm text-bone-dim leading-relaxed">
                  Shown in the Patrol header (OPFS or MemoryVFS)
                </span>
              </div>
            </div>
          </div>

          {/* Export */}
          <div>
            <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-3">
              Export your data
            </p>
            <div className="border border-ink-line px-5 py-4">
              <p className="font-mono text-sm text-bone-dim leading-relaxed">
                Settings — "Export data" downloads a full JSON snapshot of all your activities,
                shoes, races, and journal entries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: Troubleshooting                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="troubleshooting" aria-labelledby="troubleshooting-heading">
        <SectionLabel>Fixes</SectionLabel>
        <h2
          id="troubleshooting-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-6"
        >
          Troubleshooting
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {TROUBLESHOOTING.map(({ title, description }) => (
            <Card key={title} title={title} description={description} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5: Privacy                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section id="privacy" aria-labelledby="privacy-heading">
        <SectionLabel>Privacy</SectionLabel>
        <h2
          id="privacy-heading"
          className="font-display text-2xl tracking-widest uppercase text-bone mb-4"
        >
          Privacy
        </h2>

        <div className="border border-ink-line divide-y divide-ink-line">
          <div className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
            GHOST does not have a backend (except the Strava OAuth proxy worker and the
            optional Profile Sync store).
          </div>
          <div className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
            Your Strava tokens and API app credentials are stored only in this browser's
            private storage. GHOST never sees or stores your Strava password.
          </div>
          <div className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
            Profile Sync backups are encrypted on your device with your passphrase before
            upload — nobody, including whoever runs this site, can read them.
          </div>
          <div className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
            No analytics, no tracking, no telemetry.
          </div>
          <div className="px-5 py-3 font-mono text-sm text-bone-dim leading-relaxed">
            The only outbound calls are: Strava API (activity sync), the OAuth proxy worker
            (token exchange), Profile Sync (only when you use it), and Open-Meteo
            (race-day weather, no auth).
          </div>
        </div>
      </section>

      {/* Bottom spacer so last section clears mobile nav */}
      <div aria-hidden="true" className="h-8" />
    </div>
  );
}
