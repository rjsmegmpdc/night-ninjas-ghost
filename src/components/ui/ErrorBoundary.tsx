import { Component, type ReactNode } from 'react';

/**
 * Route-level error boundary. Without one, any render error — including a
 * rejected lazy() chunk import after a deploy (see the vite:preloadError
 * self-heal in main.tsx, which handles the common case first) — unmounts
 * the entire React tree to a blank page with no way back. This catches
 * whatever the reload latch didn't fix and offers an explicit reload.
 *
 * `resetKey` (the route pathname) auto-clears the error on navigation so a
 * crash on one screen doesn't wedge the whole app.
 */
interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="m3-card p-6 max-w-md space-y-4 text-center">
          <p className="font-display tracking-widest text-2xl text-accent uppercase">GHOST</p>
          <p className="font-mono text-sm text-bone">This screen hit an error.</p>
          <p className="font-mono text-xs text-bone-mute leading-relaxed break-words">
            {this.state.error.message}
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            Usually a stale version after an update — reloading fetches the current one.
            Your data is unaffected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 bg-primary text-on-primary font-mono text-xs font-bold uppercase tracking-widest"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
