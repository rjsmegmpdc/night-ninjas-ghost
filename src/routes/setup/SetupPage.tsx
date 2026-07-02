import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { exchangeCode } from '@/lib/strava/client';
import { getStoredTokens, storeTokens, clearTokens, getLastSync, type StoredTokens } from '@/lib/db/settings';
import { syncActivities, type SyncProgress } from '@/lib/db/sync';

const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

function buildStravaAuthUrl(): string {
  const redirectUri = `${window.location.origin}/setup`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupState =
  | { status: 'loading' }
  | { status: 'not-connected' }
  | { status: 'exchanging'; code: string }
  | { status: 'connected'; tokens: StoredTokens; lastSync: string | null }
  | { status: 'syncing'; tokens: StoredTokens; progress: SyncProgress }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const { ready } = useDb();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState>({ status: 'loading' });

  // Load initial connection state from DB
  const loadState = useCallback(async () => {
    const tokens = await getStoredTokens();
    if (!tokens) {
      setState({ status: 'not-connected' });
      return;
    }
    const lastSync = await getLastSync();
    setState({ status: 'connected', tokens, lastSync });
  }, []);

  useEffect(() => {
    if (!ready) return;

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setState({ status: 'error', message: `Strava denied access: ${error}` });
      return;
    }

    if (code) {
      // OAuth callback — exchange code then auto-sync
      setState({ status: 'exchanging', code });
      return;
    }

    loadState().catch((e: unknown) => {
      setState({ status: 'error', message: `DB read failed: ${e instanceof Error ? e.message : String(e)}` });
    });
  }, [ready, searchParams, loadState]);

  // Handle the token exchange when we enter 'exchanging' state
  useEffect(() => {
    if (state.status !== 'exchanging') return;

    async function exchange() {
      if (state.status !== 'exchanging') return;
      try {
        if (!WORKER_URL) throw new Error('VITE_STRAVA_OAUTH_WORKER is not configured');
        const resp = await exchangeCode(state.code, WORKER_URL);
        await storeTokens({
          accessToken: resp.access_token,
          refreshToken: resp.refresh_token,
          expiresAt: resp.expires_at,
          athleteName: `${resp.athlete.firstname} ${resp.athlete.lastname}`.trim(),
        });
        // Clear the ?code= from the URL so back/refresh doesn't re-exchange
        navigate('/setup', { replace: true });
        // Kick off initial sync immediately
        const tokens = await getStoredTokens();
        if (!tokens) return;
        startSync(tokens);
      } catch (e) {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    }

    exchange().catch((e: unknown) => {
      setState({ status: 'error', message: `Exchange error: ${e instanceof Error ? e.message : String(e)}` });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  function startSync(tokens: StoredTokens) {
    setState({ status: 'syncing', tokens, progress: { phase: 'token', fetched: 0, inserted: 0 } });
    void syncActivities((progress) => {
      if (progress.phase === 'done' || progress.phase === 'error') {
        if (progress.phase === 'done') {
          void getLastSync().then((lastSync) => {
            setState({ status: 'connected', tokens, lastSync });
          });
        } else {
          setState({ status: 'error', message: progress.error ?? 'Sync failed' });
        }
      } else {
        setState((prev) =>
          prev.status === 'syncing' ? { ...prev, progress } : prev,
        );
      }
    });
  }

  async function handleDisconnect() {
    await clearTokens();
    setState({ status: 'not-connected' });
  }

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-2xl mx-auto space-y-10">
      <header className="space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Setup</h1>
      </header>

      {/* Config warning */}
      {!CLIENT_ID && (
        <div className="border border-signal-miss/40 p-4 space-y-1">
          <p className="font-mono text-xs text-signal-miss uppercase tracking-widest">
            Configuration missing
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            <code>VITE_STRAVA_CLIENT_ID</code> is not set. Add it to{' '}
            <code>.env.local</code> (dev) and as a GitHub secret + deploy workflow env (prod).
          </p>
        </div>
      )}

      <StravaSection state={state} onSync={() => {
        if (state.status === 'connected') startSync(state.tokens);
      }} onDisconnect={handleDisconnect} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strava connection section
// ---------------------------------------------------------------------------

function StravaSection({
  state,
  onSync,
  onDisconnect,
}: {
  state: SetupState;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="border border-ink-line p-6 space-y-6">
      <div className="space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">
          data source
        </p>
        <h2 className="font-display tracking-widest text-2xl uppercase text-bone">
          Strava
        </h2>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
          <Loader size={12} className="animate-spin" />
          Checking connection…
        </div>
      )}

      {state.status === 'not-connected' && (
        <NotConnected />
      )}

      {(state.status === 'exchanging') && (
        <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
          <Loader size={12} className="animate-spin" />
          Exchanging token with Strava…
        </div>
      )}

      {state.status === 'syncing' && (
        <SyncingView progress={state.progress} />
      )}

      {state.status === 'connected' && (
        <ConnectedView
          tokens={state.tokens}
          lastSync={state.lastSync}
          onSync={onSync}
          onDisconnect={onDisconnect}
        />
      )}

      {state.status === 'error' && (
        <ErrorView message={state.message} onDisconnect={onDisconnect} />
      )}
    </section>
  );
}

function NotConnected() {
  const redirectUri = `${window.location.origin}/setup`;
  const authUrl = CLIENT_ID ? buildStravaAuthUrl() : '#';

  return (
    <div className="space-y-4">
      <p className="font-mono text-sm text-bone-dim leading-relaxed">
        Connect your Strava account to pull your activity history into GHOST.
      </p>

      {/* Debug panel — shows exactly what will be sent to Strava */}
      <div className="border border-ink-line p-4 space-y-2 bg-ink">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-3">OAuth params</p>
        <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
          <span className="text-bone-mute">client_id</span>
          <span className={CLIENT_ID ? 'text-accent' : 'text-signal-miss'}>
            {CLIENT_ID ?? 'NOT SET — add VITE_STRAVA_CLIENT_ID secret'}
          </span>
          <span className="text-bone-mute">redirect_uri</span>
          <span className="text-bone break-all">{redirectUri}</span>
          <span className="text-bone-mute">scope</span>
          <span className="text-bone">activity:read_all</span>
          <span className="text-bone-mute">full url</span>
          <span className="text-bone-dim break-all text-[10px] leading-relaxed">{authUrl}</span>
        </div>
        <p className="font-mono text-xs text-bone-mute mt-3 leading-relaxed">
          Strava must have <strong className="text-bone">{window.location.hostname}</strong> set as the
          Authorization Callback Domain (not the full path).
        </p>
      </div>

      <a
        href={authUrl}
        className={`inline-flex items-center gap-2 px-4 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
          CLIENT_ID
            ? 'bg-accent text-ink hover:bg-accent-hover cursor-pointer'
            : 'bg-ink-line text-bone-mute cursor-not-allowed'
        }`}
        onClick={e => !CLIENT_ID && e.preventDefault()}
      >
        Connect with Strava →
      </a>
    </div>
  );
}

function ConnectedView({
  tokens,
  lastSync,
  onSync,
  onDisconnect,
}: {
  tokens: StoredTokens;
  lastSync: string | null;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CheckCircle size={14} className="text-accent flex-shrink-0" />
        <span className="font-mono text-sm text-bone">
          Connected as <strong>{tokens.athleteName || 'Strava athlete'}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line">
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            Last sync
          </p>
          <p className="font-mono text-sm text-bone">{lastSyncLabel}</p>
        </div>
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">
            Token expires
          </p>
          <p className="font-mono text-sm text-bone">
            {new Date(tokens.expiresAt * 1000).toLocaleString('en-NZ', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          className="inline-flex items-center gap-2 px-4 py-2 border border-accent text-accent hover:bg-accent hover:text-ink font-mono text-xs uppercase tracking-widest transition-colors"
        >
          <RefreshCw size={12} />
          Sync now
        </button>
        <button
          onClick={onDisconnect}
          className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function SyncingView({ progress }: { progress: SyncProgress }) {
  const phaseLabel: Record<SyncProgress['phase'], string> = {
    token:    'Refreshing token…',
    fetching: 'Fetching from Strava…',
    writing:  'Writing to database…',
    done:     'Done',
    error:    'Error',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
        <Loader size={12} className="animate-spin flex-shrink-0" />
        {phaseLabel[progress.phase]}
      </div>
      {(progress.fetched > 0 || progress.inserted > 0) && (
        <div className="font-mono text-xs text-bone-dim space-y-1">
          <p>{progress.fetched} activities fetched from Strava</p>
          <p>{progress.inserted} written to database</p>
        </div>
      )}
    </div>
  );
}

function ErrorView({ message, onDisconnect }: { message: string; onDisconnect: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-signal-miss flex-shrink-0 mt-0.5" />
        <p className="font-mono text-xs text-signal-miss leading-relaxed break-all">{message}</p>
      </div>
      <div className="flex gap-3">
        <a
          href={CLIENT_ID ? buildStravaAuthUrl() : '#'}
          className="font-mono text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Reconnect →
        </a>
        <button
          onClick={onDisconnect}
          className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors"
        >
          Clear and disconnect
        </button>
      </div>
    </div>
  );
}
