import { TopNav } from '@/components/nav/topnav';
import { PrefetchAllRoutes } from '@/components/nav/prefetch-all-routes';
import { getStreakState } from '@/lib/analysis/streak';

/**
 * VELOCITY app layout - top horizontal nav over the page content.
 *
 * Replaces the previous Sidebar + main-flex layout. The TopNav is
 * sticky to the viewport top with a backdrop blur. Page content
 * flows underneath in a single full-width column constrained by
 * each page's own max-width container.
 *
 * Fetches the live streak here (server) and passes the count into the
 * client TopNav so the nav flame shows the real number.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let streakCount: number | null = null;
  try {
    const s = await getStreakState();
    streakCount = s && !s.isBroken ? s.count : null;
  } catch {
    streakCount = null;
  }

  return (
    <div className="min-h-screen bg-ink">
      <PrefetchAllRoutes />
      <TopNav streakCount={streakCount} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
