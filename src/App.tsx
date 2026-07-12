import { Routes, Route, Navigate, useLocation } from 'react-router';
import { Suspense, lazy, useState, useEffect } from 'react';
import { DbProvider, useDb } from './db/DbContext';
import { TopNav } from './components/nav/TopNav';
import { PageSkeleton } from './components/ui/PageSkeleton';
import { getStoredTokens } from '@/lib/db/settings';

// Route-level code-split — each screen loads on demand
const Patrol    = lazy(() => import('./routes/patrol/PatrolPage'));
const Recon     = lazy(() => import('./routes/recon/ReconPage'));
const Dojo      = lazy(() => import('./routes/dojo/DojoPage'));
const Calendar  = lazy(() => import('./routes/calendar/CalendarPage'));
const CoachLog  = lazy(() => import('./routes/coach-log/CoachLogPage'));
const Race      = lazy(() => import('./routes/race/RacePage'));
const Strike    = lazy(() => import('./routes/strike/StrikePage'));
const Vo2max    = lazy(() => import('./routes/vo2max/Vo2maxPage'));
const Gear      = lazy(() => import('./routes/gear/GearPage'));
const Journal   = lazy(() => import('./routes/journal/JournalPage'));
const Profile   = lazy(() => import('./routes/profile/ProfilePage'));
const Settings  = lazy(() => import('./routes/settings/SettingsPage'));
const Help      = lazy(() => import('./routes/help/HelpPage'));
const Setup     = lazy(() => import('./routes/setup/SetupPage'));

/**
 * First-run gate: if the user has never connected Strava, land them on /setup
 * instead of an empty dashboard. localStorage `ghost.onboarded` is the fast
 * path — set after the first successful connection so return visits skip the
 * DB check entirely. Existing users (tokens in DB, flag not yet set) get the
 * flag backfilled on their next load.
 */
function useFirstRunRedirect(ready: boolean): boolean {
  const location = useLocation();
  const onSetup = location.pathname.startsWith('/setup');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(
    () => (localStorage.getItem('ghost.onboarded') === 'true' ? false : null),
  );

  useEffect(() => {
    if (!ready || needsSetup !== null) return;
    let cancelled = false;
    getStoredTokens()
      .then((tokens) => {
        if (cancelled) return;
        if (tokens) {
          localStorage.setItem('ghost.onboarded', 'true');
          setNeedsSetup(false);
        } else {
          setNeedsSetup(true);
        }
      })
      .catch(() => { if (!cancelled) setNeedsSetup(false); });
    return () => { cancelled = true; };
  }, [ready, needsSetup]);

  return needsSetup === true && !onSetup;
}

function AppShell() {
  const { ready, error: dbError } = useDb();
  const redirectToSetup = useFirstRunRedirect(ready);
  const location = useLocation();

  if (!ready) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-center space-y-4 max-w-lg px-6">
          <p className="font-display tracking-widest text-2xl text-accent uppercase">GHOST</p>
          {dbError ? (
            <p className="font-mono text-xs text-signal-miss leading-relaxed break-all">{dbError}</p>
          ) : (
            <p className="font-mono text-xs text-bone-dim animate-pulse">loading database…</p>
          )}
        </div>
      </div>
    );
  }

  if (redirectToSetup) return <Navigate to="/setup" replace />;

  const home = localStorage.getItem('ghost.home_page') ?? '/patrol';

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <TopNav />
      {/* Clear the mobile bottom nav bar and the desktop rail.
          Keyed wrapper re-runs the M3 fade-through entrance per route. */}
      <main className="pb-24 md:pb-0 md:pl-22">
        <div key={location.pathname} className="m3-page-enter">
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to={home} replace />} />
            <Route path="/patrol"    element={<Patrol />} />
            <Route path="/recon"     element={<Recon />} />
            <Route path="/dojo"      element={<Dojo />} />
            <Route path="/calendar"  element={<Calendar />} />
            <Route path="/coach-log" element={<CoachLog />} />
            <Route path="/race"      element={<Race />} />
            <Route path="/strike"    element={<Strike />} />
            <Route path="/vo2max"    element={<Vo2max />} />
            <Route path="/gear"      element={<Gear />} />
            <Route path="/shoes"     element={<Navigate to="/gear" replace />} />
            <Route path="/journal"   element={<Journal />} />
            <Route path="/profile"   element={<Profile />} />
            {/* /club route hidden — code preserved in src/routes/club/ for later */}
            <Route path="/settings"  element={<Settings />} />
            <Route path="/help"      element={<Help />} />
            <Route path="/setup/*"   element={<Setup />} />
            <Route path="*"          element={<Navigate to="/patrol" replace />} />
          </Routes>
        </Suspense>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <DbProvider>
      <AppShell />
    </DbProvider>
  );
}
