import {
  FlaskConical,
  Activity,
  BarChart2,
  Footprints,
  Heart,
  Brain,
  RefreshCw,
  Flag,
  AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * Test Lab — tester reference for verifying VELOCITY feature correctness.
 * Static page: no data fetching. Describes user inputs and expected outputs
 * for each feature area, matched to the automated test suite.
 */
export default function TestLabPage() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-10">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - reference</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Test Lab
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Tester reference. For each feature: what to set up, what to do, and
          what the app should show. Matched to the automated test suite.
        </div>
      </header>

      <Notice>
        The automated suite (29 files, 472 tests) covers all pure computation.
        This page covers the <strong>user-visible behaviour</strong> that tests
        cannot reach: syncing from Strava, rendering on real pages, and
        end-to-end flows. Run <code>npm test</code> first — if any test fails,
        stop and fix it before manual verification.
      </Notice>

      {/* ------------------------------------------------------------------ */}
      <Section icon={RefreshCw} badge="settings · sync" title="Strava sync">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          Covers the sync job lifecycle: initial pull, incremental update,
          interruption, resume, and rate-limiting behaviour.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Action', 'Expected result']}
          rows={[
            [
              'Initial 90-day pull',
              'Fresh install, no activities in DB',
              'Complete setup wizard → Settings → "Sync now"',
              'Settings shows sync job progress bar; on completion: activities visible on Patrol for past 90 days; shoe inventory populated under /shoes',
            ],
            [
              'Incremental sync',
              'Existing activities; log a new Strava activity',
              'Settings → "Sync now"',
              'Only the new activity is fetched (check "pages fetched" count = 1 for a single new run); Patrol reflects the new activity',
            ],
            [
              'Stale pending job reaper',
              'A pending sync job exists (simulate by inserting a row with status=pending and lastHeartbeatAt >2 min ago)',
              'Navigate to /patrol',
              'Job status changes to "failed" with message "Job never started — process exited before sync began." Patrol renders without a stuck progress bar',
            ],
            [
              'Interrupted job resume',
              'Start a sync; kill the dev server mid-sync; restart',
              'Navigate to /patrol',
              'Job status flips to "paused" (heartbeat >60s stale); Settings shows "Resume" button; tapping Resume continues from saved cursor',
            ],
            [
              'Gear dedup',
              'Multiple activities use the same shoe (same gear_id)',
              'Run a full sync with 3+ pages',
              'Settings sync log shows each gear_id fetched only once across the run (check server console: ensureShoesForGearIds called once per gear_id)',
            ],
            [
              'Null start_date filter',
              'Strava API occasionally returns activities without start_date (malformed webhook events)',
              'Simulate by inserting a mock activity row with null start_date',
              'Sync completes without error; corrupt row is silently skipped; no cursor corruption (subsequent sync fetches the correct window)',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={Activity} badge="patrol · dashboard" title="Training load (CTL / ATL / TSB)">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          Patrol's daily summary card shows form (TSB), training load, and the
          coaching message. These outputs derive from the EWMA engine.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected on Patrol']}
          rows={[
            [
              'Fresh athlete (TSB > +25)',
              'No activities in the past 7 days; good base in the past 42 days',
              'Form label: "Fresh" · green chip · coaching message suggests readiness to race or build',
            ],
            [
              'Loaded athlete (TSB −10 to −25)',
              '5+ consecutive days with moderate-high load in the past week',
              'Form label: "Loaded" · amber chip · coaching message notes accumulated fatigue, suggests monitoring',
            ],
            [
              'Overreached (TSB < −25)',
              'Very high load past 7 days + low chronic base (new runner doing too much)',
              'Form label: "Overreached" · red chip · coaching message recommends rest or recovery run only',
            ],
            [
              'Calibrated vs estimated confidence',
              'Athlete has measured max HR set in /profile',
              'Confidence label: "Calibrated" · load computed from HR-reserve (Tier 1) · distinct from "Estimated" which uses age-predicted max',
            ],
            [
              'Monotony warning',
              '7 days of very similar load with no rest day (e.g. 5 consecutive 30-min easy runs, all same HR)',
              'Patrol shows a monotony warning card; coaching message references variation deficit',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={BarChart2} badge="patrol · compliance" title="Session compliance">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          Patrol shows planned sessions vs actual activities, with compliance
          dots (OK / WARN / FAST / SLOW / SHORT / NONE) for each session.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected compliance dot']}
          rows={[
            [
              'Pace on target',
              'Planned tempo at 4:45/km · ran 4:48/km (within ±5%)',
              'Green · "OK"',
            ],
            [
              'Ran too fast',
              'Planned easy at 5:30/km · ran 4:55/km',
              'Amber · "FAST" · Patrol note: "Easy run ran too hot — this is Tier 2 intensity, not recovery"',
            ],
            [
              'Ran too slow',
              'Planned tempo at 4:45/km · ran 5:20/km',
              'Amber · "SLOW"',
            ],
            [
              'Short run',
              'Planned 16km long run · ran 10km',
              'Amber · "SHORT" · distance flag, not pace flag',
            ],
            [
              'Session shifted by a day',
              'Planned Thursday interval · skipped Thu · ran intervals Friday instead',
              'Patrol shows Thursday as NONE (shifted) and Friday as matched; session shown as "shifted +1 day"',
            ],
            [
              'Extra unplanned run',
              'Plan has 5 sessions this week · athlete ran 6',
              'Sixth run shows as "Shadow" (unplanned) in grey',
            ],
            [
              'Walk / yoga not flagged',
              'Athlete walks 4km; plan has a run slot',
              'Walk not counted as filling a run slot; does not appear as Extra',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={Heart} badge="patrol · ns guardrails" title="Norwegian Singles guardrails">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          Only visible when the Dojo methodology is Norwegian Singles. Tests HR
          discipline across easy runs and threshold sessions.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected NS card result']}
          rows={[
            [
              'Easy discipline: passing',
              'All easy runs this week: avg HR below easy ceiling (e.g. Matt&apos;s cap: 130bpm)',
              'Easy discipline: green "Pass" · no alert',
            ],
            [
              'Easy discipline: breach',
              'Two easy runs averaged 138bpm against a 130bpm cap',
              'Easy discipline: red "Miss" · advisory text names the sessions that ran hot',
            ],
            [
              'Rep intensity: passing',
              'Threshold intervals averaged 141bpm against a 143bpm sub-threshold cap',
              'Rep intensity: green "Pass"',
            ],
            [
              'Rep intensity: breach',
              'Threshold intervals averaged 148bpm (above 143bpm cap)',
              'Rep intensity: red "Miss" · "Running too hot in quality sessions negates the NS dual-threshold benefit"',
            ],
            [
              'Age-predicted max HR warning',
              'Athlete has no measured max HR in /profile',
              'Max HR validity: amber "Warn" · "Using age-predicted max — calibrate with a field test for accurate guardrails"',
            ],
            [
              'Discipline score',
              'Easy pass (40pts), rep miss (0pts), quality ok (20pts), maxHr warn (5pts)',
              'Discipline score: 65/100 shown in card header',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={Footprints} badge="shoes · recommender" title="Shoe recommender and rotation">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          The Shoes page and the Patrol shoe card recommend footwear per
          session type. Rotation health tracks wear across your fleet.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'Race-day recommendation',
              'Athlete has carbon-plated race shoe in inventory; planning a goal-race session',
              'Patrol shoe card: carbon shoe recommended · "Race day — max performance"',
            ],
            [
              'Easy run routing',
              'Athlete has daily trainer (high-cushion) in inventory',
              'Shoe card recommends daily trainer for easy/recovery runs; super-trainer or tempo shoe NOT recommended',
            ],
            [
              'Rotation health: healthy',
              'Shoe at 400km against a 700km recommended limit',
              'Rotation health: green bar · "57% worn · healthy"',
            ],
            [
              'Rotation health: approaching limit',
              'Shoe at 580km against 700km limit',
              'Rotation health: amber · ">80% worn · consider replacement" · shoe nudge banner on Patrol',
            ],
            [
              'Rotation health: over limit',
              'Shoe at 730km against 700km limit',
              'Rotation health: red · "Over recommended limit" · strong replacement nudge',
            ],
            [
              'No shoes in category',
              'Athlete has no trail shoe; trail run planned',
              'Shoe card: "No trail shoe in your inventory — running in daily trainer" (informational)',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={Flag} badge="race · planner" title="Race execution and recovery">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          /race covers the execution plan (pacing + fueling), taper checklist,
          and post-race recovery protocol.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'Even-split pace plan',
              'Goal race: marathon · target time: 3:30:00 · strategy: even',
              'Race page: 42 segments · each ~5:00/km · total predicted: 3:30:00 ± 30s',
            ],
            [
              'Negative-split plan',
              'Same as above · strategy: negative-split · ratio 0.49/0.51',
              'First half target ~5:02/km · second half ~4:58/km',
            ],
            [
              'Fueling plan — long effort',
              'Race distance: marathon · effort duration: 3h30min',
              'Fueling plan: first gel at 40min; subsequent gels every 25min; electrolytes every 45min; ~5 gels total shown',
            ],
            [
              'Carb loading schedule',
              'Race date set in /race; current date is T-3 days',
              'Race page shows carb loading section: target g/kg, 3-day schedule with daily carb targets',
            ],
            [
              'Post-race recovery protocol — marathon',
              'Marathon debrief submitted',
              '/race shows R1 (days 1-2: walk only), R2 (days 3-7: easy cross-training), R3 (days 8-14: return to easy run), R4 (days 15-21: resume structured training) with active phase highlighted',
            ],
            [
              'Post-race recovery — 5k',
              '5k race debrief submitted',
              'Protocol window scaled down proportionally; phases still strictly increasing; active phase shown',
            ],
            [
              'Taper checklist: carb-load flip',
              'Race date = T-2 days',
              'Taper checklist: fuelling item changes from "Hold normal diet" to "Begin carb loading" (triggers inside 3-day window)',
            ],
            [
              'Heat advisory',
              'Race-day forecast: 26°C / 65% humidity',
              'Race page shows heat advisory banner; pace plan adjusts upward ~8-12% from goal pace; severity: "moderate"',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={Brain} badge="settings · ai" title="AI features (BYOK)">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          AI features require an Anthropic API key entered in /settings. No key
          → no AI cards visible.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'No API key — AI disabled',
              'Settings: Anthropic key field empty',
              'Patrol: daily briefing card not shown; coach voice card uses rule-based messages only',
            ],
            [
              'API key set — briefing appears',
              'Settings: valid Anthropic key entered',
              'Patrol: daily briefing card appears with AI-generated training summary; model label (Haiku / Sonnet) shown',
            ],
            [
              'Briefing context includes plan state',
              'Athlete is in week 14 of a Hansons build; CTL rising; one session missed',
              'Briefing text references the missed session and the current training phase; does not hallucinate sessions that did not occur',
            ],
            [
              'Invalid key — graceful error',
              'Settings: enter an invalid API key (bad format)',
              'Patrol: daily briefing card shows error message; API key pattern (sk-ant-…) is stripped from any error text shown to user',
            ],
            [
              'Keychain unavailable',
              'Run the app without Windows Credential Manager (rare scenario)',
              'Settings shows keychain error on save; API key field shows "keychain unavailable" notice; no file-based fallback silently stores the key',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={AlertCircle} badge="calendar · state" title="Calendar events and state-awareness">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          Calendar events (sickness, travel, work trips) feed the
          state-awareness layer and adjust the plan automatically.
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'Sickness window — current week',
              '/calendar: add sickness event starting Monday this week, no end date (still active)',
              'Patrol: shows "Active illness" banner; plan adjustments card recommends volume reduction; compliance dots dimmed for the illness window',
            ],
            [
              'Work trip — future week',
              '/calendar: add work_trip event for next week; impact = travel_only',
              'Dojo plan matrix for next week: shows preview overlay "Travel — add recovery session"; not yet applied (preview only)',
            ],
            [
              'ACWR hard rail fires',
              'Athlete loads 3× their chronic load in a single week (ACWR ≥ 1.5)',
              'Patrol: red "Injury risk" alert; state-awareness adjustment = reduce-volume regardless of plan methodology; overrides even a Hansons high-volume week',
            ],
            [
              'Enum guard — invalid event type',
              'POST to createCalendarEvent with eventType = "vacation" (not in enum)',
              'Server action rejects with validation error; event not written to DB; UI shows error state',
            ],
            [
              'Ninja Loop holiday',
              'NZ public holiday falls in the current week (auto-fetched from GitHub iCal)',
              'Calendar shows holiday entry; plan adjustments show it as a reduced-impact day',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={BarChart2} badge="vo2max · analytics" title="VO2max tracking">
        <p className="text-bone-dim text-sm leading-relaxed mb-4">
          /vo2max accepts observations from multiple sources and shows trend
          direction. Outliers are detected using MAD (not mean+std).
        </p>
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'Cooper test entry',
              '/vo2max: add observation; source = Cooper; distance run in 12 min: 3050m',
              'VO2max estimate displayed: ~55 mL/kg/min · fitness band shown · observation saved to history',
            ],
            [
              'Device reading (Garmin)',
              '/vo2max: add observation; source = device (Garmin); value: 52',
              'Observation stored; shown in trend chart; confidence label: "device estimate"',
            ],
            [
              'Outlier detection',
              'Series of observations: 52, 53, 51, 52, 72 (last one is a data error)',
              'VO2max insights card: 72 flagged as outlier (>3 MAD from median); excluded from trend calculation; shown in chart with outlier marker',
            ],
            [
              'Rising trend',
              '4 observations over 8 weeks showing consistent increase (48 → 49 → 51 → 53)',
              'Insights card: trend direction "Rising" · green indicator · trend line shows upward slope',
            ],
            [
              'Insufficient data for trend',
              'Only 1 observation in DB',
              'Insights card: "Not enough data for trend — add at least 3 observations" · no trend line shown',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section icon={RefreshCw} badge="setup · first-run" title="Setup wizard and first-run experience">
        <ScenarioTable
          headers={['Scenario', 'Setup', 'Expected result']}
          rows={[
            [
              'First-run orientation banner',
              'Fresh install, first visit to /patrol (orientationDismissed = false in settings)',
              'Orientation banner appears above Patrol content: "Welcome to VELOCITY — here\'s where to start" with links to Recon and Calendar; dismiss button visible',
            ],
            [
              'Banner dismissed',
              'Click "Got it" on orientation banner',
              'Banner disappears immediately; does not re-appear on next visit (setting persisted in DB)',
            ],
            [
              'Banner suppressed for existing users',
              'User already has activities synced AND orientationDismissed = true',
              'No banner shown at all on /patrol',
            ],
            [
              'Setup wizard completion',
              'New user completes all 7 wizard steps',
              'App redirects to /patrol; initial 90-day sync job triggered; Patrol shows "Syncing…" progress banner',
            ],
            [
              'Schema migrations idempotency',
              'Run `node scripts/run-migrations.js` twice on the same DB',
              'Second run: all migration files show "skipped (recorded in schema_migrations)"; no errors; table count unchanged',
            ],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-ink-line pt-6 text-bone-dim text-xs font-mono space-y-1">
        <p>Test suite: <code>npm test</code> · 29 files · 472 tests · Vitest</p>
        <p>Full test descriptions: <code>TESTING.md</code> · Architecture: <code>ARCHITECTURE.md</code></p>
        <p>Areas without automated coverage: sync pipeline, Server Actions, page rendering, OAuth flow, keychain, AI briefing.</p>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg px-4 py-3 text-sm text-bone-dim leading-relaxed">
      {children}
    </div>
  );
}

function Section({
  icon: Icon,
  badge,
  title,
  children,
}: {
  icon: React.ElementType;
  badge: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 border-b border-ink-line pb-3">
        <Icon size={18} className="text-bone-dim shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="nn-caps text-xs">{badge}</span>
          <h2 className="font-display text-2xl uppercase tracking-wide">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function ScenarioTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-line">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2 font-mono text-xs text-bone-dim uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-ink-line/50 last:border-0 align-top"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 leading-relaxed ${
                    j === 0
                      ? 'font-medium text-bone whitespace-nowrap'
                      : 'text-bone-dim'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
