'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { AvatarMenu } from './avatar-menu';
import { cn } from '@/lib/utils';

/**
 * TopNav - VELOCITY's primary navigation.
 *
 * Replaces the previous 9-item left sidebar with a 4-item horizontal top
 * navigation. Per BRAND.md, the four buckets are:
 *
 *   Dashboard   -> /patrol            (this week's view)
 *   Training    -> /dojo, /calendar   (planning surfaces)
 *   Analytics   -> /strike, /recon    (state + trends)
 *   Profile     -> /settings, /help, /shoes, /journal (config + reference)
 *
 * The top-level nav lights up based on which sub-route is active. Inside
 * each section, secondary navigation (tabs, pills) is the page's job.
 *
 * Right side has a streak indicator (flame icon + count) and avatar
 * placeholder. Streak count wiring is deferred to the page-restyle pass.
 */

interface NavBucket {
  label: string;
  href: string;       // primary route the nav item links to
  match: string[];    // routes that should activate this bucket
}

const NAV: NavBucket[] = [
  { label: 'Dashboard', href: '/patrol',   match: ['/patrol'] },
  { label: 'Training',  href: '/dojo',     match: ['/dojo', '/calendar', '/race'] },
  { label: 'Analytics', href: '/strike',   match: ['/strike', '/recon', '/vo2max', '/coach-log'] },
  { label: 'Club',      href: '/club',     match: ['/club'] },
  { label: 'Profile',   href: '/profile',  match: ['/profile', '/settings', '/help', '/shoes', '/journal'] },
];

export function TopNav({ streakCount }: { streakCount?: number | null }) {
  const pathname = usePathname() ?? '';

  return (
    <header className="sticky top-0 z-50 bg-ink/95 backdrop-blur-sm border-b border-ink-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3 sm:gap-8">
        {/* Wordmark */}
        <Link href="/patrol" className="shrink-0">
          <Wordmark variant="accent" size="nav" />
        </Link>

        {/* Centre nav */}
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.match.some((m) => pathname.startsWith(m));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'relative px-4 py-2 rounded-lg font-sans text-sm transition-colors duration-150',
                  active
                    ? 'text-accent'
                    : 'text-bone-dim hover:text-bone'
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute left-4 right-4 -bottom-[13px] h-0.5 bg-accent rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster - streak + avatar */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/patrol"
            aria-label={streakCount ? `Streak: ${streakCount} days` : 'Streak'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors',
              streakCount ? 'text-accent' : 'text-bone-dim hover:text-accent'
            )}
          >
            <Flame size={18} strokeWidth={1.5} />
            {streakCount != null && streakCount > 0 && (
              <span className="font-mono text-sm tabular-nums">{streakCount}</span>
            )}
          </Link>
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}
