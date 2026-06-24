import { Card, CardLabel } from '@/components/ui/card';
import {
  Compass,
  BookOpen,
  Layout,
  Wrench,
  Flag,
  Shield,
  LifeBuoy,
} from 'lucide-react';

/**
 * Help — runner-facing documentation. Plain English, task-oriented,
 * keeps the Night Ninjas voice but softens the brevity for clarity.
 *
 * Sections are anchored so the per-section ? icons (next iteration) can
 * deep-link here.
 */
export default function HelpPage() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-4xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - reference</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Reference
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Plain English. What the app does, what the words mean, and what to do
          when life happens.
        </div>
      </header>

      {/* ----- Quick start ----- */}
      <section id="quick-start" className="space-y-4">
        <SectionHeading icon={Compass} label="quick start">
          What this app actually does
        </SectionHeading>
        <Card className="space-y-4 text-bone-dim leading-relaxed">
          <p>
            VELOCITY pulls your training data from Strava and compares it
            against a real plan — Hansons, Lydiard, or one you build yourself.
            It doesn't just show you what you did. It tells you what you were
            <em className="text-bone"> meant </em>
            to do, what you actually did, and where the gaps are.
          </p>
          <p>
            The job each week is simple: open <Term>Patrol</Term> and see if
            your week is on track. If it isn't, that's information, not
            judgement. Did you ride the pace too fast on Tuesday? Skip
            Thursday's tempo? Cut the long run short? The app tells you.
            What you do with that is up to you.
          </p>
          <p>
            Patrol pulls real data — your actual activities are compared
            against the plan engine's prescribed sessions for the current
            week. Wellness markers (sleep, stress, energy) are coming next;
            for now Patrol shows the heart rate and pace trends as your
            best signal.
          </p>
          <p className="text-bone">
            Once a week, open <Term>Recon</Term>. Look at the trends. If you've
            been missing the same session three weeks running, something needs
            adjusting — either your plan or your life.
          </p>
        </Card>
      </section>

      {/* ----- Glossary ----- */}
      <section id="glossary" className="space-y-4">
        <SectionHeading icon={BookOpen} label="glossary">
          What the words mean
        </SectionHeading>
        <Card className="space-y-3">
          <p className="text-bone-dim text-sm leading-relaxed mb-4">
            The app uses a few Night Ninjas-flavoured terms. Here's the
            translation.
          </p>
          <GlossaryTable
            rows={[
              ['Patrol', 'this week\u2019s training', 'The main dashboard. Your current week — sessions, paces, compliance flags. The screen you check daily.'],
              ['Mission', 'a planned session', 'One scheduled workout. Tuesday\u2019s tempo, Sunday\u2019s long run, etc.'],
              ['Recon', 'weekly report', 'Compliance trends. Did you hit the prescribed paces? Are you under-volume? Is intensity drifting?'],
              ['Strike', 'peak training weeks', 'Your top training weeks ranked by volume, intensity, and consistency. Useful for spotting the athlete state when you felt strongest — and reproducing it.'],
              ['Dojo', 'training plan', 'The training method behind your plan. Eight available — Hansons, Daniels, Pfitzinger, Higdon, Lydiard, Polarised (80/20), Ultra, and Custom. Each defines its own week structure, pace zones, taper schedule, and how it responds to your calendar.'],
              ['Calendar', 'races + life', 'Where you set goals, group runs, and tell the app about holidays, work trips, and other life stuff.'],
              ['Journal', 'wellness log', 'Daily sleep, stress, and energy tracking. The instrumentation that explains why you broke down at 85km last time.'],
              ['Shadow', 'unassigned activity', 'A run that didn\u2019t match any prescribed session. Not bad — just unplanned.'],
              ['Shoes', 'gear inventory', 'Mirror of your Strava gear, enriched with manufacturer-recommended km. The 80% nudge tells you when to look at replacements.'],
            ]}
          />
        </Card>
      </section>

      {/* ----- Screens ----- */}
      <section id="screens" className="space-y-4">
        <SectionHeading icon={Layout} label="the screens">
          What each screen is for
        </SectionHeading>
        <div className="space-y-3">
          <ScreenCard name="Patrol" tagline="this week's training">
            Your daily-use screen. Shows the current week's prescribed sessions,
            what you actually did, and a compliance flag for each one. The big
            stat at the top is volume vs target. The "Tonight's Mission" card
            tells you what's prescribed for today. If you check one screen each
            morning, this is it.
          </ScreenCard>
          <ScreenCard name="Recon" tagline="weekly compliance">
            The Sunday-night screen. Three big numbers at the top — total km,
            compliance %, long-run consistency — each compared against the
            previous 12 weeks so you can see direction. Below that, a
            heatmap showing which days you hit and which you missed across
            the window. Then a per-week table breaking down volume, long
            run, sessions hit, and any calendar adaptations. Bottom panel
            surfaces patterns from the data — three observations max,
            terse, signal-only, no motivational fluff.
          </ScreenCard>
          <ScreenCard name="Strike" tagline="peak training weeks">
            Your top training weeks ranked by a composite of volume, intensity,
            consistency, and long-run achieved. Useful when you're wondering
            "what was I doing when I felt strong?" Also surfaces PBs and lets
            you compare a current build vs a previous one.
          </ScreenCard>
          <ScreenCard name="Dojo" tagline="your plan">
            View and edit your active training plan. Pace zones, weekly
            structure, volume caps. If you're on Hansons but want to swap
            to Lydiard, this is where you do it.
          </ScreenCard>
          <ScreenCard name="Calendar" tagline="races + life">
            Race calendar (goal race + tune-ups), recurring group runs (Shoe
            Science Tuesday, Coaches Run Thursday), Ninja Loop on public
            holidays, and one-off commitments — holidays, work trips, sickness.
            Anything that affects your training schedule lives here.
          </ScreenCard>
          <ScreenCard name="Journal" tagline="daily wellness">
            Sleep quality, work stress, energy, perceived effort. Daily entries
            take 10 seconds. Over time, patterns emerge — you'll see your
            breakdown weeks were preceded by a fortnight of bad sleep, or a
            stressful work block.
          </ScreenCard>
          <ScreenCard name="Settings" tagline="config">
            Re-run the wizard, manage Strava connection, trigger a full history
            sync, export or wipe local data, change timezone.
          </ScreenCard>
        </div>
      </section>

      {/* ----- Common tasks ----- */}
      <section id="tasks" className="space-y-4">
        <SectionHeading icon={Wrench} label="common tasks">
          When life happens
        </SectionHeading>
        <div className="space-y-3">
          <TaskCard title="You're injured and need to take time off">
            <p>
              Open Calendar. Add a Commitment with type "Sickness" or "Other".
              Set the start date to today and the end date to when you expect
              to be back running. Set Impact to "No training" if you're fully
              off, or "Reduced training" if you can do something light.
            </p>
            <p>
              The plan engine will scale your week's targets accordingly. When
              you're back, missed sessions won't show as compliance failures —
              they'll show as <Code>none</Code> flags, which is the engine
              acknowledging the absence rather than blaming you for it.
            </p>
          </TaskCard>

          <TaskCard title="You're going on holiday for two weeks">
            <p>
              Calendar → Commitments → Add. Type "Holiday", set the date range,
              and pick the Impact level that matches your plans. "Travel only ·
              short easy" if you're packing shoes and planning to jog.
              "Reduced training" if you're aiming for ~50% of normal volume.
              "No training" if you're switching off entirely.
            </p>
          </TaskCard>

          <TaskCard title="You want to add a tune-up race">
            <p>
              Calendar → Races → bottom of the section, fill in the inline form
              and click "+ Add tune-up". Date, distance, and (optionally) a
              target time. The plan engine uses the date to schedule a small
              taper before the race.
            </p>
          </TaskCard>

          <TaskCard title="Your plan isn't matching your reality">
            <p>
              The plan engine reads from your Calendar — races, group runs,
              and commitments all reshape the prescribed week. Two main
              levers if you want to change things:
            </p>
            <p>
              <strong className="text-bone">If volume is too high</strong>, set
              your weekly cap below the breakdown threshold (Calendar →
              Capacity caps).
            </p>
            <p>
              <strong className="text-bone">If session structure is wrong</strong>,
              add your real recurring group runs (Calendar → Group Runs). The
              engine will slot them in instead of generic dojo defaults — so
              Tuesday Shoe Science replaces Tuesday speed work.
            </p>
            <p>
              <strong className="text-bone">If life is in the way</strong>,
              add a Commitment (Calendar → Commitments). The engine scales
              targets accordingly — "Reduced training" halves volume, "Travel
              only" keeps short easy runs and removes long runs, "No training"
              blanks the whole week. Your Patrol header will show what got
              adapted.
            </p>
            <p>
              <strong className="text-bone">If your goal race is close</strong>,
              the engine automatically tapers — 15% volume reduction in the
              second-to-last week, 30% in race week, with the actual race
              slotted into the right day. You don't need to do anything.
            </p>
          </TaskCard>

          <TaskCard title="You want your full Strava history, not just 90 days">
            <p>
              The wizard pulls 90 days as a starting point. To get the rest,
              go to Settings → Sync Manager → "Pull full history". The job
              runs in the background. You can keep using the app while it
              works.
            </p>
            <p>
              If Strava's rate limit kicks in, the sync pauses automatically
              and resumes once the limit resets (15 minutes). You don't need
              to babysit it.
            </p>
          </TaskCard>

          <TaskCard title="Strava sync got interrupted">
            <p>
              When the dev server crashes, your computer sleeps, or the network
              drops mid-sync, the job is left in a paused state. Next time you
              open Patrol or Calendar, you'll see a banner at the top:
              <em className="text-bone"> Sync paused — resume?</em> Click
              Resume. The job picks up where it left off.
            </p>
          </TaskCard>

          <TaskCard title="An activity got synced wrong">
            <p>
              If you renamed or edited an activity on Strava after VELOCITY
              pulled it, trigger an incremental sync from Settings →
              "Sync now". The runner upserts based on Strava activity ID, so
              the existing row will update with the new values.
            </p>
          </TaskCard>

          <TaskCard title="You want to start over from scratch">
            <p>
              Settings → "Wipe everything". Two-step confirmation. Clears the
              local DB, removes Strava credentials from your OS keychain, and
              sends you back to the wizard.
            </p>
            <p>
              If you only want to disconnect Strava without losing data, use
              "Disconnect Strava" instead — that just clears the keychain.
            </p>
          </TaskCard>
        </div>
      </section>

      {/* ----- Analytics metrics ----- */}
      <section id="analytics" className="space-y-4">
        <SectionHeading icon={BookOpen} label="analytics">
          What the numbers mean
        </SectionHeading>
        <Card className="space-y-3">
          <p className="text-bone-dim text-sm leading-relaxed mb-4">
            VELOCITY surfaces training-load metrics drawn from exercise science.
            Here's what each one represents.
          </p>
          <GlossaryTable
            rows={[
              ['CTL', 'chronic training load', 'Your 42-day rolling fitness score — a weighted average of daily training stress. A rising CTL means fitness is accumulating. Also called "form" in some tools.'],
              ['ATL', 'acute training load', 'Your 7-day rolling fatigue score — same formula, shorter window. Spikes sharply after a hard block; drops quickly with rest.'],
              ['TSB', 'training stress balance', 'CTL minus ATL. Positive = fresh (more fitness than fatigue). Negative = tired. Race-day target: +5 to +25. Deeply negative means you need rest before you can perform.'],
              ['HR Reserve', 'heart rate reserve', 'Max HR minus resting HR. The range your heart operates in. Used as the denominator in the Karvonen method for calculating effort zones.'],
              ['Karvonen', 'target HR formula', '(Max HR − Resting HR) × intensity % + Resting HR. Gives a personalised HR target for each zone. A 75% effort feels harder for a low-resting-HR athlete than the raw number suggests.'],
              ['Pace zones', 'prescribed speed bands', 'Derived from your goal race pace. Easy zone: ~65–75% of threshold pace. Tempo/threshold: ~80–90%. Interval: 95–100%. The app uses these to flag FAST/SLOW on each session.'],
            ]}
          />
        </Card>
      </section>

      {/* ----- Dojo methodologies ----- */}
      <section id="methodologies" className="space-y-4">
        <SectionHeading icon={BookOpen} label="dojo methodologies">
          The training philosophies
        </SectionHeading>
        <Card className="space-y-3">
          <p className="text-bone-dim text-sm leading-relaxed mb-4">
            Each dojo is a distinct training philosophy with different assumptions
            about how fitness is built. Two sentences each — enough to pick the
            right one.
          </p>
          <GlossaryTable
            rows={[
              ['Hansons', 'cumulative fatigue model', 'Heavy weekly mileage at controlled paces; no single monster long run. The stimulus is the accumulated tiredness of training on tired legs day after day.'],
              ['Daniels', 'VDOT periodisation', 'Phase-based structure anchored to your estimated aerobic capacity (VDOT). Each phase has a single purpose — base, quality, competition — with workouts keyed precisely to that number.'],
              ['Pfitzinger', 'high-mileage / LT focus', 'The most demanding option: high volume, medium-long midweek runs alongside the true long run, and heavy lactate-threshold emphasis. Built for experienced runners chasing serious PRs.'],
              ['Higdon', 'approachable structure', 'Lower mid-week stress with one long run per week — the classic approachable shape. Covers novice through competitive; a good starting point if the others feel overwhelming.'],
              ['Lydiard', 'aerobic base first', 'Months of pure aerobic conditioning before any speedwork, then a focused speed development phase once the base is built. Needs a long runway — best if your race is 20+ weeks out.'],
              ['Polarised', '80/20 intensity split', '80% of training volume at easy/recovery pace; 20% at high intensity with almost nothing in between. Designed to eliminate junk-mile grey-zone work; evidence-based for endurance performance.'],
              ['Ultra', 'volume over pace', 'Structured for 50km and beyond: more time on feet, less pace-zone specificity, back-to-back long days to simulate race fatigue. Shorter, less aggressive taper than road plans.'],
              ['Norwegian Singles', 'threshold via lactate', 'High-controlled-intensity threshold work — singles only (one session per day) guided by lactate measurement, derived from the Norwegian elite methodology. Demands honest pacing discipline.'],
              ['Custom', 'your own structure', "No prescribed engine — you define the week directly. Use when you're following a coach's spreadsheet or when none of the above fits your situation."],
            ]}
          />
        </Card>
      </section>

      {/* ----- Compliance flags ----- */}
      <section id="flags" className="space-y-4">
        <SectionHeading icon={Flag} label="compliance flags">
          What the flags mean
        </SectionHeading>
        <Card className="space-y-4">
          <p className="text-bone-dim text-sm leading-relaxed">
            On Patrol and Recon, each session gets a flag. It's a quick
            visual signal. Don't take any single flag too seriously — patterns
            across weeks matter more than one bad day.
          </p>
          <FlagTable />
          <div className="pt-3 border-t border-ink-line text-bone-dim text-xs leading-relaxed font-mono">
            ↳ a single missed session is normal. Three missed Tuesday sessions
            in a row is a signal that something needs to change — your plan,
            your schedule, or your recovery.
          </div>
        </Card>
      </section>

      {/* ----- Privacy ----- */}
      <section id="privacy" className="space-y-4">
        <SectionHeading icon={Shield} label="privacy & data">
          Where your data lives
        </SectionHeading>
        <Card className="space-y-4 text-bone-dim leading-relaxed">
          <p>
            VELOCITY is local-first. Your activity history and plan data
            stay on this machine. There is no cloud sync, no analytics, no
            telemetry, no account.
          </p>
          <p>
            <strong className="text-bone">Where files live:</strong>
          </p>
          <ul className="space-y-2 font-mono text-xs">
            <li>
              <span className="text-bone">SQLite DB</span>
              <span className="text-bone-mute"> · activity history, plans, journal, calendar</span>
              <br />
              <span className="ml-4 text-bone-dim">Windows: %APPDATA%\NightNinjas\shadow-tracker.db</span>
              <br />
              <span className="ml-4 text-bone-dim">Mac: ~/Library/Application Support/NightNinjas/shadow-tracker.db</span>
              <br />
              <span className="ml-4 text-bone-dim">Linux: ~/.config/night-ninjas/shadow-tracker.db</span>
            </li>
            <li className="pt-2">
              <span className="text-bone">Strava credentials</span>
              <span className="text-bone-mute"> · client_secret + OAuth tokens</span>
              <br />
              <span className="ml-4 text-bone-dim">Stored in your OS keychain (Windows Credential Manager / macOS Keychain / Linux libsecret)</span>
              <br />
              <span className="ml-4 text-bone-dim">Service name: NightNinjas-ShadowTracker</span>
            </li>
          </ul>
          <p>
            <strong className="text-bone">What goes over the network:</strong>{' '}
            direct calls to <Code>strava.com</Code> for OAuth and activity sync;
            <Code>anthropic.com</Code> if you enable AI insights (BYOK — your key, your calls);
            <Code>connect.garmin.com</Code> if you connect Garmin;
            one annual fetch of NZ public holidays from a public GitHub repo.
            No analytics. No phoning home.
          </p>
          <p>
            <strong className="text-bone">Usage logging:</strong> a local file
            (<Code>usage-log.jsonl</Code> in your data directory) records
            anonymised events — page views, action timings, error tags. We
            never log form values, race times, names, free text, or activity
            content. The log is only shared if you explicitly attach it to a
            feedback email via the Feedback button. Open the file directly to
            see what's in it.
          </p>
          <p>
            <strong className="text-bone">To wipe everything:</strong> Settings
            → "Wipe everything". Or manually delete the data directory above
            and run "Disconnect Strava".
          </p>
        </Card>
      </section>

      {/* ----- Troubleshooting ----- */}
      <section id="troubleshooting" className="space-y-4">
        <SectionHeading icon={LifeBuoy} label="troubleshooting">
          When things go wrong
        </SectionHeading>
        <div className="space-y-3">
          <TaskCard title="The Strava sync failed">
            <p>
              Most common reason: token expired. Go to Settings → "Disconnect
              Strava", then re-run the wizard from step 3 (Connect). The OAuth
              flow refreshes everything cleanly.
            </p>
            <p>
              If it fails again with the same error, your registered Strava app
              may have been deleted or rate-limited. Check{' '}
              <Code>strava.com/settings/api</Code>.
            </p>
          </TaskCard>

          <TaskCard title="The dev server won't start">
            <p>
              Run <Code>.\check.ps1</Code> from the project root. It kills
              orphan processes, strips file encoding issues, verifies
              dependencies, and applies any pending DB migrations. 90% of
              startup issues clear with one run of the checker.
            </p>
          </TaskCard>

          <TaskCard title="A session shows wrong pace or distance">
            <p>
              Strava's data is the source of truth. If the activity looks wrong
              in Patrol, check it on Strava first. If Strava is right but
              VELOCITY is wrong, trigger an incremental sync from
              Settings — the upsert will replace the row.
            </p>
            <p>
              If you're sure the activity should be classified differently
              (e.g. tagged as a Run but logged as a Workout), you can change
              the activity type on Strava and re-sync.
            </p>
          </TaskCard>

          <TaskCard title="Holidays look wrong on the Ninja Loop card">
            <p>
              Calendar → Ninja Loop card → "Refresh from GitHub iCal". Forces
              a re-fetch from the public NZ holidays repo. If a year is
              missing, it's because the source repo hasn't been updated yet —
              the maintainer adds new years annually.
            </p>
          </TaskCard>
        </div>
      </section>
    </div>
  );
}

/* ---------- Helper components ---------- */

function SectionHeading({
  icon: Icon,
  label,
  children,
}: {
  icon: any;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.5} className="text-accent" />
        <span className="nn-caps text-accent">{label}</span>
      </div>
      <h2 className="font-display tracking-wide-display text-3xl uppercase">
        {children}
      </h2>
    </div>
  );
}

function GlossaryTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="divide-y divide-ink-line border-y border-ink-line">
      {rows.map(([term, plain, full]) => (
        <div
          key={term}
          className="py-3 grid grid-cols-1 md:grid-cols-[120px_180px_1fr] gap-3 md:gap-4 items-baseline"
        >
          <span className="font-display tracking-wide-display uppercase text-accent">
            {term}
          </span>
          <span className="font-mono text-xs text-bone-dim">{plain}</span>
          <span className="text-bone-dim text-sm leading-relaxed">{full}</span>
        </div>
      ))}
    </div>
  );
}

function ScreenCard({
  name,
  tagline,
  children,
}: {
  name: string;
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="font-display tracking-wide-display text-xl uppercase">
          {name}
        </span>
        <span className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          {tagline}
        </span>
      </div>
      <div className="text-bone-dim text-sm leading-relaxed">{children}</div>
    </Card>
  );
}

function TaskCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3">
      <div className="font-display tracking-wide-display text-base uppercase text-bone">
        {title}
      </div>
      <div className="text-bone-dim text-sm leading-relaxed space-y-3">
        {children}
      </div>
    </Card>
  );
}

function FlagTable() {
  const flags: { name: string; color: string; meaning: string }[] = [
    {
      name: 'OK',
      color: 'text-signal-ok',
      meaning: 'Inside the prescribed pace band and distance. Hit the target.',
    },
    {
      name: 'WARN',
      color: 'text-signal-warn',
      meaning: 'Within ~10% of the band edge. Close enough — not worth worrying about a single warn.',
    },
    {
      name: 'FAST',
      color: 'text-signal-warn',
      meaning: 'Faster than the prescribed band. Means you ran easy days too hard, or threshold work above threshold. Both common, both fixable.',
    },
    {
      name: 'SLOW',
      color: 'text-signal-warn',
      meaning: 'Slower than the band. Often the legs were tired and the pace dropped — or you ran with a friend who runs slower than you.',
    },
    {
      name: 'SHORT',
      color: 'text-accent',
      meaning: 'Below the prescribed distance. Worth a glance — was it a deliberate cut-down, or did you bonk?',
    },
    {
      name: 'NONE',
      color: 'text-bone-mute',
      meaning: 'No matching activity logged for this day. Either you skipped, or the activity was logged with a different type/date than expected.',
    },
  ];
  return (
    <div className="divide-y divide-ink-line border-y border-ink-line">
      {flags.map((f) => (
        <div
          key={f.name}
          className="py-3 grid grid-cols-[80px_1fr] gap-3 items-baseline"
        >
          <span
            className={
              'font-display tracking-wide-display uppercase ' + f.color
            }
          >
            {f.name}
          </span>
          <span className="text-bone-dim text-sm leading-relaxed">
            {f.meaning}
          </span>
        </div>
      ))}
    </div>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display tracking-wide-display uppercase text-accent">
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs bg-ink-panel px-1.5 py-0.5 text-bone">
      {children}
    </code>
  );
}
