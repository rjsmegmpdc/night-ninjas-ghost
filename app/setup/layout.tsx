import { Logo } from '@/components/brand/logo';
import { Wordmark } from '@/components/brand/wordmark';

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink flex flex-col">
      {/* Top bar — minimal, brand only */}
      <header className="border-b border-ink-line">
        <div className="max-w-5xl mx-auto px-8 py-6 flex items-center gap-4">
          <Logo size={36} className="text-bone" />
          <Wordmark />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-8 py-12 animate-slide-up">
        {children}
      </main>

      {/* Footer — utility only */}
      <footer className="border-t border-ink-line">
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between text-bone-mute font-mono text-xs">
          <span>shadow tracker · v0.1.0 · local-only</span>
          <span>nightninjas · est. 2016</span>
        </div>
      </footer>
    </div>
  );
}
