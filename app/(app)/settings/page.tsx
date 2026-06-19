import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, Activity, Database, Trash2, Download, RotateCcw, Footprints, Flame, Calendar } from 'lucide-react';
import { logPageView } from '@/lib/store/instrument';
import { getStravaClientId, getLastSyncAt, getUserTimezone, getStreakRunEverydayMode, getFirstDayOfWeek, getClubParkrunId, getClubWindowDefault, getClubTermsAcceptedAt, getClubLastShareGeneratedAt, getGarminSyncEnabled, getGarminLastSyncAt, getCoachMode } from '@/lib/store/settings';
import { getStravaTokens } from '@/lib/store/secrets';
import { listRecentJobs } from '@/lib/sources/sync-runner';
import { getDataStats } from '@/lib/actions/settings-admin';
import { countActivitiesNeedingBackfill } from '@/lib/shoes/backfill';
import { GearBackfillButton } from '@/components/settings/gear-backfill-button';
import { StreakModeToggle } from '@/components/settings/streak-mode-toggle';
import { FirstDayOfWeekToggle } from '@/components/settings/first-day-of-week-toggle';
import { ClubShareSection } from '@/components/club-share/club-share-section';
import { CoachModeToggle } from '@/components/settings/coach-mode-toggle';
import { GarminSection } from '@/components/garmin/garmin-section';
import {
  startExtendedHistorySync,
  startIncrementalSync,
} from '@/lib/actions/sync';
import { DisconnectStravaForm, WipeEverythingForm } from '@/components/settings/destructive-forms';
import { ExportDataButton } from '@/components/settings/export-data-button';
import { SyncJobsTable } from '@/components/settings/sync-jobs-table';

/**
 * Settings — admin surface for the install.
 *
 * Sections:
 *   1. Strava connection — current state + reauth/disconnect
 *   2. Sync manager     — incremental + full history triggers + job history
 *   3. Plan management  — current dojo + re-run wizard links
 *   4. Data            — counts, export, wipe
 *
 * All destructive actions use multi-step confirmation patterns. The
 * destructive-forms component handles the UX of "click Delete then
 * type WIPE to confirm" so this page stays declarative.
 */
export default async function SettingsPage() {
  logPageView('/settings');

  const coachMode = await getCoachMode();

  // Read all the things we need to render
  const [
    clientId,
    lastSyncAt,
    timezone,
    tokens,
    recentJobs,
    stats,
    pendingBackfillCount,
    streakRunEverydayMode,
    firstDayOfWeek,
    clubParkrunId,
    clubWindow,
    clubTermsAcceptedAt,
    clubLastShareGeneratedAt,
    garminConnected,
    garminLastSyncAt,
  ] = await Promise.all([
    getStravaClientId(),
    getLastSyncAt(),
    getUserTimezone(),
    getStravaTokens(),
    listRecentJobs(10),
    getDataStats(),
    countActivitiesNeedingBackfill(),
    getStreakRunEverydayMode(),
    getFirstDayOfWeek(),
    getClubParkrunId(),
    getClubWindowDefault(),
    getClubTermsAcceptedAt(),
    getClubLastShareGeneratedAt(),
    getGarminSyncEnabled(),
    getGarminLastSyncAt(),
  ]);

  const stravaConnected = clientId != null && tokens != null;

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">profile - settings</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Settings
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Strava connection, sync manager, plan management, data export and reset.
          Most things you'll touch infrequently.
        </div>
      </header>

      {/* Strava connection ---------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading icon={Activity} label="strava connection">
          Strava
        </SectionHeading>

        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line">
            <Cell label="status">
              {stravaConnected ? (
                <span className="text-signal-ok">Connected</span>
              ) : (
                <span className="text-bone-mute">Not connected</span>
              )}
            </Cell>
            <Cell label="last sync">
              {lastSyncAt ? (
                <span className="font-mono text-sm">
                  {formatRelative(lastSyncAt)}
                </span>
              ) : (
                <span className="text-bone-mute">never</span>
              )}
            </Cell>
            <Cell label="client id">
              {clientId ? (
                <code className="font-mono text-xs text-bone-dim break-all">{clientId}</code>
              ) : (
                <span className="text-bone-mute">—</span>
              )}
            </Cell>
            <Cell label="timezone">
              <span className="font-mono text-sm">{timezone}</span>
            </Cell>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-ink-line">
            {stravaConnected ? (
              <>
                <Link href="/setup/connect">
                  <Button variant="outline" size="sm">Re-authorise</Button>
                </Link>
                <DisconnectStravaForm />
              </>
            ) : (
              <Link href="/setup/strava-app">
                <Button variant="primary" size="sm">Connect Strava</Button>
              </Link>
            )}
          </div>
        </Card>
      </section>

      {/* Sync manager --------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading icon={RotateCcw} label="sync manager">
          Sync
        </SectionHeading>

        {!stravaConnected && (
          <Card className="border-bone-mute/30">
            <div className="font-mono text-sm text-bone-dim">
              ↳ connect Strava first (above) to enable syncing
            </div>
          </Card>
        )}

        {stravaConnected && (
          <>
            <Card className="space-y-4">
              <CardLabel>trigger sync</CardLabel>
              <div className="flex flex-col sm:flex-row gap-3">
                <form action={async () => { 'use server'; await startIncrementalSync(); }} className="flex-1">
                  <Button variant="outline" size="md" type="submit" className="w-full">
                    Sync now
                  </Button>
                  <div className="font-mono text-[10px] text-bone-mute mt-2 leading-relaxed">
                    ↳ pulls activities since last sync. fast, no rate limit risk.
                  </div>
                </form>
                <form action={async () => { 'use server'; await startExtendedHistorySync(); }} className="flex-1">
                  <Button variant="primary" size="md" type="submit" className="w-full">
                    Pull full history
                  </Button>
                  <div className="font-mono text-[10px] text-bone-mute mt-2 leading-relaxed">
                    ↳ fetches all activities older than what's already synced.
                    pauses if rate-limited.
                  </div>
                </form>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <CardLabel>sync history · last 10</CardLabel>
                <span className="font-mono text-xs text-bone-mute">
                  {recentJobs.length} job{recentJobs.length === 1 ? '' : 's'}
                </span>
              </div>
              {recentJobs.length === 0 ? (
                <div className="font-mono text-sm text-bone-dim">
                  ↳ no sync jobs yet
                </div>
              ) : (
                <SyncJobsTable jobs={recentJobs} />
              )}
            </Card>
          </>
        )}
      </section>

      {/* Shoes ---------------------------------------------------------- */}
      {stravaConnected && (
        <section className="space-y-3">
          <SectionHeading icon={Footprints} label="shoes">
            Shoes
          </SectionHeading>

          <Card className="space-y-4">
            <CardLabel>gear backfill</CardLabel>
            <p className="text-bone-dim text-sm leading-relaxed">
              Activities synced before the shoes feature existed don't have
              gear info. Run a one-time backfill to fetch gear_id from
              Strava per-activity. Future syncs handle this automatically.
            </p>
            <GearBackfillButton pendingCount={pendingBackfillCount} />
          </Card>
        </section>
      )}

      {/* Plan management ----------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading icon={SettingsIcon} label="plan management">
          Plan
        </SectionHeading>

        <Card className="space-y-4">
          <p className="text-bone-dim text-sm leading-relaxed">
            Switch dojo (Hansons / Lydiard / Custom), edit your goal race, or
            re-run the entire setup wizard. Your activity data is preserved
            across all of these.
          </p>
          <div className="flex flex-wrap gap-3 pt-3 border-t border-ink-line">
            <Link href="/setup/dojo">
              <Button variant="outline" size="sm">Switch dojo</Button>
            </Link>
            <Link href="/setup/races">
              <Button variant="outline" size="sm">Edit races</Button>
            </Link>
            <Link href="/calendar">
              <Button variant="outline" size="sm">Calendar (capacity, group runs)</Button>
            </Link>
            <Link href="/setup">
              <Button variant="ghost" size="sm">Re-run wizard</Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* Display -------------------------------------------------------- */}
      <section id="display" className="space-y-3 scroll-mt-8">
        <SectionHeading icon={Calendar} label="display">
          Display
        </SectionHeading>

        <Card className="space-y-4">
          <CardLabel>first day of week</CardLabel>
          <p className="text-bone-dim text-sm leading-relaxed">
            <strong className="text-bone">Monday</strong> - column order Mon Tue Wed Thu Fri Sat Sun.
            ISO 8601 standard. Default for NZ/AU/UK/EU.
            <br />
            <strong className="text-bone">Sunday</strong> - column order Sun Mon Tue Wed Thu Fri Sat.
            US convention.
          </p>
          <FirstDayOfWeekToggle initial={firstDayOfWeek} />
          <p className="font-mono text-[10px] text-bone-mute leading-relaxed pt-2 border-t border-ink-line">
            ↳ display only - the underlying training week is always Monday-anchored.
          </p>
        </Card>
      </section>

      {/* Coach mode ------------------------------------------------------ */}
      <section id="coach-mode" className="space-y-3 scroll-mt-8">
        <div className="bg-ink-shadow border border-ink-line rounded-xl shadow-card p-6 space-y-4">
          <div>
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
              phase 3b - state-aware engine
            </div>
            <h3 className="font-display tracking-wide-display uppercase text-xl text-bone mt-0.5">
              Coach Mode
            </h3>
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">
            When your athlete state (form balance, load ramp) moves outside what
            your training method expects, the engine can respond. Choose how much
            autonomy it gets. Two rails hold in every mode: a load ramp at
            injury-risk levels (ACWR ≥ 1.5) keeps re-raising until it resolves,
            and logged injuries are never auto-adjusted.
          </p>
          <CoachModeToggle initial={coachMode} />
        </div>
      </section>

      {/* Club sharing ---------------------------------------------------- */}
      <section id="club-sharing" className="space-y-3 scroll-mt-8">
        <ClubShareSection
          initialParkrunId={clubParkrunId}
          initialWindow={clubWindow}
          termsAcceptedAt={clubTermsAcceptedAt}
          lastGeneratedAt={clubLastShareGeneratedAt}
        />
      </section>

      {/* Garmin biometrics ----------------------------------------------- */}
      <section id="garmin" className="space-y-3 scroll-mt-8">
        <GarminSection connected={garminConnected} lastSyncAt={garminLastSyncAt} />
      </section>

      {/* Streak ---------------------------------------------------------- */}
      <section id="streak" className="space-y-3 scroll-mt-8">
        <SectionHeading icon={Flame} label="streak">
          Streak
        </SectionHeading>

        <Card className="space-y-4">
          <CardLabel>what counts as a streak day</CardLabel>
          <p className="text-bone-dim text-sm leading-relaxed">
            <strong className="text-bone">Any exercise</strong> — gym sessions,
            cycling, walks, swims and runs all keep your streak alive. Lower bar,
            more forgiving. Default.
            <br />
            <strong className="text-bone">Run only</strong> — only Run, TrailRun
            and VirtualRun activities count. Stricter. Choose this if you're
            specifically chasing a "run every day" streak.
          </p>
          <StreakModeToggle initial={streakRunEverydayMode} />
          <p className="font-mono text-[10px] text-bone-mute leading-relaxed pt-2 border-t border-ink-line">
            ↳ streak refreshes after each Strava sync. miss day = yesterday had
            no qualifying activity. today is excluded (still in progress).
          </p>
        </Card>
      </section>

      {/* Data ----------------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading icon={Database} label="data">
          Data
        </SectionHeading>

        <Card className="space-y-4">
          <CardLabel>local database</CardLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-line border border-ink-line">
            <Cell label="activities">
              <span className="font-mono tabular-nums text-bone">{stats.activityCount}</span>
            </Cell>
            <Cell label="races">
              <span className="font-mono tabular-nums text-bone">{stats.raceCount}</span>
            </Cell>
            <Cell label="sync jobs">
              <span className="font-mono tabular-nums text-bone">{stats.syncJobCount}</span>
            </Cell>
            <Cell label="db size">
              <span className="font-mono tabular-nums text-bone">
                {stats.dbSizeKb != null ? `${(stats.dbSizeKb / 1024).toFixed(1)} MB` : '—'}
              </span>
            </Cell>
          </div>

          {stats.activityCount > 0 && (
            <div className="font-mono text-xs text-bone-dim leading-relaxed">
              activity range: {stats.oldestActivity ?? '—'} → {stats.newestActivity ?? '—'}
            </div>
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-ink-line">
            <ExportDataButton />
          </div>
        </Card>

        <Card className="border-accent/40 space-y-4">
          <CardLabel className="text-accent">danger zone</CardLabel>
          <p className="text-bone-dim text-sm leading-relaxed">
            Wipes everything: every activity, every race, every plan, every
            sync job, every setting. Strava credentials too. The schema stays
            so the app still boots, but it's effectively a clean install.
          </p>
          <p className="font-mono text-xs text-bone-mute">
            ↳ this cannot be undone. export your data first if you want a backup.
          </p>
          <WipeEverythingForm />
        </Card>
      </section>
    </div>
  );
}

/* ---------- Helpers ---------- */

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
    <div className="flex items-baseline gap-3">
      <Icon size={14} strokeWidth={1.5} className="text-accent" />
      <span className="nn-caps text-accent">{label}</span>
      <span className="font-display tracking-wide-display text-2xl uppercase">
        {children}
      </span>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink p-4">
      <div className="nn-caps text-[10px]">{label}</div>
      <div className="mt-1 text-bone">{children}</div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const ms = now - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}
