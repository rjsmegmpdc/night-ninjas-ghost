import { Routes, Route, Navigate } from 'react-router';
import { Suspense, lazy } from 'react';
import { DbProvider, useDb } from './db/DbContext';
import { TopNav } from './components/nav/TopNav';
import { PageSkeleton } from './components/ui/PageSkeleton';

// Route-level code-split — each screen loads on demand
const Patrol    = lazy(() => import('./routes/patrol/PatrolPage'));
const Recon     = lazy(() => import('./routes/recon/ReconPage'));
const Dojo      = lazy(() => import('./routes/dojo/DojoPage'));
const Calendar  = lazy(() => import('./routes/calendar/CalendarPage'));
const CoachLog  = lazy(() => import('./routes/coach-log/CoachLogPage'));
const Race      = lazy(() => import('./routes/race/RacePage'));
const Strike    = lazy(() => import('./routes/strike/StrikePage'));
const Vo2max    = lazy(() => import('./routes/vo2max/Vo2maxPage'));
const Shoes     = lazy(() => import('./routes/shoes/ShoesPage'));
const Journal   = lazy(() => import('./routes/journal/JournalPage'));
const Profile   = lazy(() => import('./routes/profile/ProfilePage'));
const Club      = lazy(() => import('./routes/club/ClubPage'));
const Settings  = lazy(() => import('./routes/settings/SettingsPage'));
const Help      = lazy(() => import('./routes/help/HelpPage'));
const Setup     = lazy(() => import('./routes/setup/SetupPage'));

function AppShell() {
  const { ready, error: dbError } = useDb();

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

  return (
    <div className="min-h-screen bg-ink text-bone">
      <TopNav />
      <main>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to="/patrol" replace />} />
            <Route path="/patrol"    element={<Patrol />} />
            <Route path="/recon"     element={<Recon />} />
            <Route path="/dojo"      element={<Dojo />} />
            <Route path="/calendar"  element={<Calendar />} />
            <Route path="/coach-log" element={<CoachLog />} />
            <Route path="/race"      element={<Race />} />
            <Route path="/strike"    element={<Strike />} />
            <Route path="/vo2max"    element={<Vo2max />} />
            <Route path="/shoes"     element={<Shoes />} />
            <Route path="/journal"   element={<Journal />} />
            <Route path="/profile"   element={<Profile />} />
            <Route path="/club"      element={<Club />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="/help"      element={<Help />} />
            <Route path="/setup/*"   element={<Setup />} />
            <Route path="*"          element={<Navigate to="/patrol" replace />} />
          </Routes>
        </Suspense>
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
