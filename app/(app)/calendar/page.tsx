import { RaceSection } from '@/components/calendar/race-section';
import { GroupRunSection } from '@/components/calendar/group-run-section';
import { NinjaLoopSection } from '@/components/calendar/ninja-loop-section';
import { CommitmentSection } from '@/components/calendar/commitment-section';
import { CapacitySection } from '@/components/calendar/capacity-section';
import { autoRefreshIfDue } from '@/lib/actions/refresh-holidays';
import { SyncStatusBanner } from '@/components/sync/sync-status-banner';
import { logPageView } from '@/lib/store/instrument';

/**
 * Calendar — the always-on CRUD surface.
 *
 * Everything you set up in the wizard lives here too. Add a sickness event
 * mid-program. Drop a tune-up race that got cancelled. Toggle a group run
 * on or off when life changes. This is the planning brain of the app.
 */
export default async function CalendarPage() {
  logPageView('/calendar');
  // Trigger auto-refresh of NZ holidays from sohnemann iCal if due (Sept 1
  // trigger, or first ever boot when cache is empty).
  await autoRefreshIfDue();

  return (
    <div className="px-12 py-10 max-w-7xl mx-auto space-y-8">
      <SyncStatusBanner />
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">training - schedule</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Schedule
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Races, group runs, holidays, work trips, sickness — every input the
          plan engine respects when scheduling your week.
        </div>
      </header>

      <div className="space-y-2">
        <h2 className="font-display tracking-wide-display text-2xl uppercase text-bone">
          Races
        </h2>
        <p className="font-mono text-xs text-bone-mute">
          ↳ goal race + tune-ups · drives periodisation
        </p>
      </div>
      <RaceSection />

      <div className="space-y-2 pt-6 border-t border-ink-line">
        <h2 className="font-display tracking-wide-display text-2xl uppercase text-bone">
          Weekly Pattern
        </h2>
        <p className="font-mono text-xs text-bone-mute">
          ↳ recurring group runs · capacity caps
        </p>
      </div>
      <GroupRunSection />
      <NinjaLoopSection />
      <CapacitySection />

      <div className="space-y-2 pt-6 border-t border-ink-line">
        <h2 className="font-display tracking-wide-display text-2xl uppercase text-bone">
          Commitments
        </h2>
        <p className="font-mono text-xs text-bone-mute">
          ↳ holidays, trips, sickness · scales targets accordingly
        </p>
      </div>
      <CommitmentSection />
    </div>
  );
}
