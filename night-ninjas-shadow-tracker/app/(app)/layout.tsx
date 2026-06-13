import { TopNav } from '@/components/nav/topnav';

/**
 * VELOCITY app layout - top horizontal nav over the page content.
 *
 * Replaces the previous Sidebar + main-flex layout. The TopNav is
 * sticky to the viewport top with a backdrop blur. Page content
 * flows underneath in a single full-width column constrained by
 * each page's own max-width container.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink">
      <TopNav />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
