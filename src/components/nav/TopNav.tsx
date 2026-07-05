import { NavLink, Link } from 'react-router';

const NAV = [
  { to: '/patrol',   label: 'Patrol'   },
  { to: '/recon',    label: 'Recon'    },
  { to: '/dojo',     label: 'Dojo'     },
  { to: '/calendar', label: 'Calendar' },
  { to: '/gear',     label: 'Gear'     },
  { to: '/settings', label: 'Settings' },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    'shrink-0 px-3 py-1.5 rounded font-mono text-xs uppercase tracking-widest transition-colors',
    isActive
      ? 'text-accent bg-accent/10 shadow-[inset_0_1px_0_0_rgba(255,95,0,0.15)]'
      : 'text-bone-mute hover:text-bone hover:bg-ink-panel',
  ].join(' ');
}

export function TopNav() {
  const HOME = localStorage.getItem('ghost.home_page') ?? '/calendar';

  return (
    <header className="bg-ink border-b border-ink-line sticky top-0 z-50">

      {/* ── Desktop (sm+): single row, unchanged ────────────────── */}
      <div className="hidden sm:flex items-center h-16 px-8 gap-1">
        <Link
          to={HOME}
          className="font-display tracking-widest text-lg text-accent mr-4 select-none"
        >
          GHOST
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navLinkClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Mobile (<sm): compact two-row layout ────────────────── */}
      <div className="sm:hidden">
        {/* Brand strip — tiny GHOST label, home tap target */}
        <div className="px-3 pt-1.5 pb-0">
          <Link
            to={HOME}
            className="font-display tracking-widest text-[10px] text-accent select-none leading-none"
          >
            GHOST
          </Link>
        </div>
        {/* Swipeable nav strip — scrolls horizontally, no visible scrollbar */}
        <nav
          className="flex items-center gap-0.5 overflow-x-auto px-2 pt-1 pb-2 no-scrollbar"
          aria-label="Main navigation"
        >
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navLinkClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

    </header>
  );
}
