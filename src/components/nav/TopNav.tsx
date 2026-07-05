import { NavLink } from 'react-router';

const NAV = [
  { to: '/patrol',    label: 'Patrol'    },
  { to: '/recon',     label: 'Recon'     },
  { to: '/dojo',      label: 'Dojo'      },
  { to: '/calendar',  label: 'Calendar'  },
  { to: '/gear',      label: 'Gear'      },
  { to: '/settings',  label: 'Settings'  },
];

export function TopNav() {
  return (
    <header className="h-16 bg-ink border-b border-ink-line sticky top-0 z-50 flex items-center px-4 sm:px-8 gap-1">
      <span className="font-display tracking-widest text-lg text-accent mr-4 select-none">GHOST</span>
      <nav className="flex items-center gap-1 overflow-x-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              [
                'px-3 py-1.5 rounded font-mono text-xs uppercase tracking-widest transition-colors',
                isActive
                  ? 'text-accent bg-accent/10 shadow-[inset_0_1px_0_0_rgba(255,95,0,0.15)]'
                  : 'text-bone-mute hover:text-bone hover:bg-ink-panel',
              ].join(' ')
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
