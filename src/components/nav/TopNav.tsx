import { NavLink, Link } from 'react-router';
import {
  Shield,
  TrendingUp,
  Swords,
  Calendar,
  Backpack,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Material 3 navigation:
 *  - Mobile (< md): small top app bar (brand + secondary actions) and a
 *    fixed bottom navigation bar with the four primary destinations.
 *  - Desktop (md+): a left navigation rail with everything.
 * App.tsx pads <main> to clear both (pb on mobile, pl on desktop).
 *
 * Nav flow: Setup → Strava Sync → AI Coach Feedback
 * Destination order: Patrol · Calendar · Gear · Recon · Strike · Settings (last, always)
 */

interface Destination {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Primary nav destinations — BottomNavBar (mobile) and NavigationRail body (desktop).
 *
 * Order is intentional and matches the Setup → Sync → Coach Feedback flow:
 *   0  Patrol    — daily dashboard + AI coach feedback hub (default / first tab)
 *   1  Calendar  — workout commitments, life events
 *   2  Gear      — shoe intelligence + kit tracking
 *   3  Recon     — training analysis
 *   4  Strike    — PMC / fitness chart
 *
 * Settings is pinned separately: rail foot on desktop, top-bar icon on mobile.
 */
const PRIMARY: Destination[] = [
  { to: '/patrol',   label: 'Patrol',   icon: Shield },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/gear',     label: 'Gear',     icon: Backpack },
  { to: '/recon',    label: 'Recon',    icon: TrendingUp },
  { to: '/dojo',     label: 'Strike',   icon: Swords },
];

function homeHref(): string {
  return localStorage.getItem('ghost.home_page') ?? '/patrol';
}

// ---------------------------------------------------------------------------
// Mobile: top app bar
// ---------------------------------------------------------------------------

function TopAppBar() {
  return (
    <header className="md:hidden sticky top-0 z-50 h-14 flex items-center justify-between px-4 bg-surface-container border-b border-outline-variant/40">
      <Link
        to={homeHref()}
        className="font-display tracking-widest text-xl text-brand select-none leading-none"
      >
        GHOST
      </Link>
      <div className="flex items-center gap-1">
        <NavLink
          to="/settings"
          aria-label="Settings"
          className={({ isActive }) =>
            `p-2.5 rounded-full transition-colors ${
              isActive
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant hover:bg-on-surface/8'
            }`
          }
        >
          <Settings size={20} />
        </NavLink>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Mobile: bottom navigation bar (M3 spec — active pill indicator + label)
// ---------------------------------------------------------------------------

function BottomNavBar() {
  return (
    <nav
      aria-label="Main navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container border-t border-outline-variant/40 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch justify-around h-20">
        {PRIMARY.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 pt-3 pb-4 group"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex items-center justify-center w-16 h-8 rounded-full transition-colors ${
                    isActive
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'text-on-surface-variant group-active:bg-on-surface/8'
                  }`}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span
                  className={`text-[11px] leading-none tracking-wide ${
                    isActive ? 'text-on-surface font-bold' : 'text-on-surface-variant font-medium'
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Desktop: navigation rail
// ---------------------------------------------------------------------------

function NavigationRail() {
  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-22 flex-col items-center bg-surface-container py-5 gap-2"
    >
      <Link
        to={homeHref()}
        className="font-display tracking-widest text-lg text-brand select-none mb-4"
      >
        GHOST
      </Link>

      <div className="flex flex-col items-center gap-3 flex-1">
        {PRIMARY.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="flex flex-col items-center gap-1 group">
            {({ isActive }) => (
              <>
                <span
                  className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors ${
                    isActive
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'text-on-surface-variant group-hover:bg-on-surface/8'
                  }`}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span
                  className={`text-[11px] leading-none tracking-wide ${
                    isActive ? 'text-on-surface font-bold' : 'text-on-surface-variant font-medium'
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Settings pinned to the rail foot */}
      <NavLink to="/settings" aria-label="Settings" className="flex flex-col items-center gap-1 group">
        {({ isActive }) => (
          <span
            className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors ${
              isActive
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant group-hover:bg-on-surface/8'
            }`}
          >
            <Settings size={22} />
          </span>
        )}
      </NavLink>
    </nav>
  );
}

export function TopNav() {
  return (
    <>
      <TopAppBar />
      <BottomNavBar />
      <NavigationRail />
    </>
  );
}
