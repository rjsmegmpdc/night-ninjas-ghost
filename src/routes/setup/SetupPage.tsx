import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { RefreshCw, CheckCircle, AlertCircle, Loader, Clock } from 'lucide-react';
import { useDb } from '@/db/DbContext';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { exchangeCode, revokeToken } from '@/lib/strava/client';
import {
  getStoredTokens,
  storeTokens,
  clearTokens,
  getLastSync,
  getSetting,
  setSetting,
  getAllSettings,
  getAthleteProfile,
  upsertAthleteProfile,
  getSyncCursor,
  type StoredTokens,
} from '@/lib/db/settings';
import { buildSettingsSnapshot, parseSettingsSnapshot } from '@/lib/db/settings-snapshot-pure';
import { syncActivities, type SyncProgress } from '@/lib/db/sync';
import {
  getStravaCredentials,
  getTokenCredentials,
  saveStravaCredentials,
} from '@/lib/strava/credentials';

const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

function buildStravaAuthUrl(clientId: string): string {
  // CSRF: generate a random 32-hex-char state, store single-use in sessionStorage
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('strava_oauth_state', state);

  const redirectUri = `${window.location.origin}/setup`;
  const params = new URLSearchParams({
    client_id:       clientId,
    redirect_uri:    redirectUri,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'activity:read_all',
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

function parseGrantedScope(scopeParam: string): 'full' | 'partial' | 'none' {
  if (scopeParam.includes('activity:read_all')) return 'full';
  if (scopeParam.includes('activity:read'))    return 'partial';
  return 'none';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupState =
  | { status: 'loading' }
  | { status: 'needs-credentials' }
  | { status: 'not-connected' }
  | { status: 'exchanging'; code: string; partialScope: boolean }
  | { status: 'athlete-mismatch'; newTokens: StoredTokens; partialScope: boolean; existingName: string }
  | { status: 'connected'; tokens: StoredTokens; lastSync: string | null; partialScope: boolean; welcomeBack?: string }
  | { status: 'syncing';   tokens: StoredTokens; progress: SyncProgress }
  | { status: 'error';     message: string };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const { ready } = useDb();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const [state, setState] = useState<SetupState>({ status: 'loading' });
  const [clientId, setClientId] = useState<string | null>(null);
  const retryTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadState = useCallback(async () => {
    const creds = await getStravaCredentials();
    setClientId(creds?.clientId ?? null);
    const tokens = await getStoredTokens();
    if (!tokens) {
      setState(creds ? { status: 'not-connected' } : { status: 'needs-credentials' });
      return;
    }
    const [lastSync, scope] = await Promise.all([getLastSync(), getSetting('strava_scope')]);
    setState({
      status: 'connected',
      tokens,
      lastSync,
      partialScope: scope === 'activity:read',
    });
  }, []);

  // Initial load: handle OAuth callback or check existing connection
  useEffect(() => {
    if (!ready) return;

    // Resolve the client ID for reconnect links regardless of entry path
    void getStravaCredentials().then((c) => setClientId(c?.clientId ?? null));

    const code  = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setState({ status: 'error', message: `Strava denied access: ${error}` });
      return;
    }

    if (code) {
      // Validate CSRF state before trusting the code
      const returnedState = searchParams.get('state') ?? '';
      const storedState   = sessionStorage.getItem('strava_oauth_state') ?? '';
      sessionStorage.removeItem('strava_oauth_state');

      if (!returnedState || !storedState || returnedState !== storedState) {
        setState({ status: 'error', message: 'OAuth state mismatch — possible CSRF. Please try connecting again.' });
        return;
      }

      // Validate that at least read scope was granted
      const scopeParam = searchParams.get('scope') ?? '';
      const grantedScope = parseGrantedScope(scopeParam);
      if (grantedScope === 'none') {
        setState({ status: 'error', message: 'No activity permission granted — reconnect and approve access.' });
        return;
      }

      setState({ status: 'exchanging', code, partialScope: grantedScope === 'partial' });
      return;
    }

    loadState().catch((e: unknown) => {
      setState({ status: 'error', message: `DB read failed: ${e instanceof Error ? e.message : String(e)}` });
    });
  }, [ready, searchParams, loadState]);

  // Handle token exchange
  useEffect(() => {
    if (state.status !== 'exchanging') return;

    async function exchange() {
      if (state.status !== 'exchanging') return;
      const { code, partialScope } = state;

      try {
        if (!WORKER_URL) throw new Error('VITE_STRAVA_OAUTH_WORKER is not configured');
        const resp = await exchangeCode(code, WORKER_URL, await getTokenCredentials());

        // Persist scope
        await setSetting('strava_scope', partialScope ? 'activity:read' : 'activity:read_all');

        // Check if a different athlete's data already exists locally
        const currentAthleteIdStr = await getSetting('strava_athlete_id');
        const currentAthleteId    = currentAthleteIdStr ? Number(currentAthleteIdStr) : null;
        const newAthleteId        = resp.athlete.id;
        const newAthleteName      = `${resp.athlete.firstname} ${resp.athlete.lastname}`.trim();

        if (currentAthleteId !== null && currentAthleteId !== newAthleteId) {
          const currentName = (await getSetting('strava_athlete_name')) ?? 'previous athlete';
          // Store new tokens but don't wipe existing data — let the user decide
          const newTokens: StoredTokens = {
            accessToken:  resp.access_token,
            refreshToken: resp.refresh_token,
            expiresAt:    resp.expires_at,
            athleteName:  newAthleteName,
            athleteId:    newAthleteId,
          };
          navigate('/setup', { replace: true });
          setState({ status: 'athlete-mismatch', newTokens, partialScope, existingName: currentName });
          return;
        }

        // Look up saved profile for this athlete (settings restore + incremental sync)
        const profile = await getAthleteProfile(newAthleteId);
        let welcomeBack: string | undefined;

        if (profile) {
          // Restore non-credential settings
          if (profile.settingsJson) {
            const saved = parseSettingsSnapshot(profile.settingsJson);
            for (const [k, v] of Object.entries(saved)) await setSetting(k, v);
          }
          welcomeBack = `Welcome back, ${newAthleteName} — restored your previous settings.`;
        }

        await storeTokens({
          accessToken:  resp.access_token,
          refreshToken: resp.refresh_token,
          expiresAt:    resp.expires_at,
          athleteName:  newAthleteName,
          athleteId:    newAthleteId,
        });
        localStorage.setItem('ghost.onboarded', 'true');

        navigate('/setup', { replace: true });
        const tokens = await getStoredTokens();
        if (!tokens) return;

        setState({ status: 'connected', tokens, lastSync: null, partialScope, welcomeBack });
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

  // Schedule 15-min retry when sync is paused (rate limit)
  useEffect(() => {
    if (state.status !== 'syncing' || state.progress.phase !== 'paused') return;
    const tokens = state.tokens;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      startSync(tokens);
    }, 15 * 60 * 1000);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function startSync(tokens: StoredTokens) {
    setState({ status: 'syncing', tokens, progress: { phase: 'token', fetched: 0, inserted: 0 } });
    void syncActivities((progress) => {
      if (progress.phase === 'done') {
        void getLastSync().then((lastSync) => {
          void getSetting('strava_scope').then((scope) => {
            setState({ status: 'connected', tokens, lastSync, partialScope: scope === 'activity:read' });
          });
        });
      } else if (progress.phase === 'error') {
        setState({ status: 'error', message: progress.error ?? 'Sync failed' });
      } else {
        setState((prev) =>
          prev.status === 'syncing' ? { ...prev, progress } : prev,
        );
      }
    });
  }

  async function proceedWithNewAthlete(newTokens: StoredTokens, partialScope: boolean) {
    await storeTokens(newTokens);
    localStorage.setItem('ghost.onboarded', 'true');
    setState({ status: 'connected', tokens: newTokens, lastSync: null, partialScope });
    startSync(newTokens);
  }

  async function handleDisconnect() {
    const tokens = await getStoredTokens();
    if (!tokens) {
      setState({ status: 'not-connected' });
      return;
    }

    // Snapshot current settings before clearing (never deletes, always kept)
    const allSettings = await getAllSettings();
    const snapshot    = buildSettingsSnapshot(allSettings);
    const lastSync    = await getLastSync();
    const cursor      = await getSyncCursor();
    const scope       = await getSetting('strava_scope');

    await upsertAthleteProfile({
      athleteId:    tokens.athleteId,
      athleteName:  tokens.athleteName,
      scope,
      syncCursor:   cursor,
      lastSync,
      settingsJson: snapshot,
    });

    // Revoke on Strava (best-effort — local wipe proceeds regardless)
    void revokeToken(tokens.accessToken, WORKER_URL);

    await clearTokens();
    localStorage.removeItem('ghost.onboarded');
    setState({ status: 'not-connected' });
  }

  if (!ready) return <PageSkeleton />;

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-2xl mx-auto space-y-10">
      <header className="space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">Ghost</p>
        <h1 className="font-display text-4xl tracking-widest uppercase text-bone">Setup</h1>
      </header>

      {!WORKER_URL && (
        <div className="border border-signal-miss/40 p-4 space-y-1">
          <p className="font-mono text-xs text-signal-miss uppercase tracking-widest">
            Configuration missing
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            <code>VITE_STRAVA_OAUTH_WORKER</code> is not set. Add it to{' '}
            <code>.env.local</code> (dev) and as a GitHub secret + deploy workflow env (prod).
          </p>
        </div>
      )}

      <StravaSection
        state={state}
        clientId={clientId}
        onSync={() => { if (state.status === 'connected') startSync(state.tokens); }}
        onDisconnect={handleDisconnect}
        onProceedWithNewAthlete={proceedWithNewAthlete}
        onCredentialsSaved={() => { void loadState(); }}
        onChangeCredentials={() => setState({ status: 'needs-credentials' })}
      />

      {/* Powered by Strava — required by brand guidelines */}
      <footer className="flex items-center gap-2 pt-2 border-t border-ink-line">
        <span className="font-mono text-xs text-bone-mute">Powered by</span>
        <a
          href="https://www.strava.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-[#FC4C02] hover:underline"
        >
          Strava
        </a>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strava connection section
// ---------------------------------------------------------------------------

function StravaSection({
  state,
  clientId,
  onSync,
  onDisconnect,
  onProceedWithNewAthlete,
  onCredentialsSaved,
  onChangeCredentials,
}: {
  state: SetupState;
  clientId: string | null;
  onSync: () => void;
  onDisconnect: () => void;
  onProceedWithNewAthlete: (tokens: StoredTokens, partialScope: boolean) => Promise<void>;
  onCredentialsSaved: () => void;
  onChangeCredentials: () => void;
}) {
  return (
    <section className="border border-ink-line p-6 space-y-6">
      <div className="space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">data source</p>
        <h2 className="font-display tracking-widest text-2xl uppercase text-bone">Strava</h2>
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
          <Loader size={12} className="animate-spin" />
          Checking connection…
        </div>
      )}

      {state.status === 'needs-credentials' && (
        <CredentialsWizard onSaved={onCredentialsSaved} />
      )}

      {state.status === 'not-connected' && (
        <NotConnected clientId={clientId} onChangeCredentials={onChangeCredentials} />
      )}

      {state.status === 'exchanging' && (
        <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
          <Loader size={12} className="animate-spin" />
          Exchanging token with Strava…
        </div>
      )}

      {state.status === 'athlete-mismatch' && (
        <AthleteMismatchView
          state={state}
          onProceed={() => void onProceedWithNewAthlete(state.newTokens, state.partialScope)}
          onCancel={() => void onDisconnect()}
        />
      )}

      {state.status === 'syncing' && <SyncingView progress={state.progress} />}

      {state.status === 'connected' && (
        <ConnectedView
          tokens={state.tokens}
          lastSync={state.lastSync}
          partialScope={state.partialScope}
          welcomeBack={state.welcomeBack}
          clientId={clientId}
          onSync={onSync}
          onDisconnect={onDisconnect}
        />
      )}

      {state.status === 'error' && (
        <ErrorView message={state.message} clientId={clientId} onDisconnect={onDisconnect} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Credentials wizard — guided, per-user Strava API app setup.
// Strava has no password login for apps: every user creates their own free
// API app once, and GHOST stores its ID + secret locally on this device.
// ---------------------------------------------------------------------------

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <code className="text-bone bg-ink px-2 py-0.5 border border-ink-line break-all">{value}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="font-mono text-[10px] uppercase tracking-widest text-bone-mute hover:text-accent transition-colors shrink-0"
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </span>
  );
}

function CredentialsWizard({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idOk = /^\d{4,}$/.test(id.trim());
  const secretOk = secret.trim().length >= 20;

  async function handleSave() {
    if (!idOk || !secretOk) return;
    setSaving(true);
    setError(null);
    try {
      await saveStravaCredentials(id, secret);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        GHOST talks to Strava through your own free API app — a one-time,
        two-minute setup. Your details are stored only on this device.
      </p>

      {/* Step 1 — create the app on Strava */}
      <div className="space-y-3">
        <p className="font-mono text-xs text-accent uppercase tracking-widest">Step 1 — create your API app</p>
        <ol className="space-y-2.5 font-mono text-xs text-bone-dim leading-relaxed list-decimal list-inside">
          <li>
            Open{' '}
            <a
              href="https://www.strava.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              strava.com/settings/api
            </a>{' '}
            and log in if asked.
          </li>
          <li>
            Fill in the form — any values work, but these are sensible:
            <div className="mt-2 ml-1 grid grid-cols-1 gap-y-2 font-mono text-xs">
              <div><span className="text-bone-mute">Application Name:</span> <code className="text-bone">GHOST</code></div>
              <div><span className="text-bone-mute">Category:</span> <code className="text-bone">Data Importer</code></div>
              <div className="flex flex-wrap items-center gap-x-2"><span className="text-bone-mute">Website:</span> <CopyValue value={window.location.origin} /></div>
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-bone-mute">Authorization Callback Domain:</span>{' '}
                <CopyValue value={window.location.hostname} />
              </div>
            </div>
          </li>
          <li>Upload any image as the app icon (Strava requires one — a photo of your shoes works).</li>
          <li>After saving, Strava shows your <strong className="text-bone">Client ID</strong> and <strong className="text-bone">Client Secret</strong> — copy them into Step 2.</li>
        </ol>
      </div>

      {/* Step 2 — paste the credentials */}
      <div className="space-y-3">
        <p className="font-mono text-xs text-accent uppercase tracking-widest">Step 2 — paste them here</p>

        <div className="space-y-1 max-w-sm">
          <label htmlFor="cred-client-id" className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Client ID</label>
          <input
            id="cred-client-id"
            type="text"
            inputMode="numeric"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="123456"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1 max-w-sm">
          <label htmlFor="cred-client-secret" className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">Client Secret</label>
          <div className="relative">
            <input
              id="cred-client-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="40-character secret"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-ink-shadow border border-ink-line px-3 py-2 pr-12 font-mono text-sm text-bone placeholder:text-bone-mute focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-bone-mute hover:text-bone"
              tabIndex={-1}
            >
              {showSecret ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        <p className="font-mono text-[10px] text-bone-mute leading-relaxed max-w-sm">
          Both are saved to this device's private storage only. They identify your
          API app, not your Strava account — you still approve access on strava.com next.
        </p>

        {error && (
          <p className="font-mono text-xs text-signal-miss" role="alert">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!idOk || !secretOk || saving}
          className="w-full sm:w-auto font-mono text-xs uppercase tracking-widest px-5 py-2.5 border border-accent text-accent hover:bg-accent hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save & continue'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy notice — shown once, before the first OAuth redirect.
// Plain language on what GHOST stores and where. Dismissal is remembered in
// localStorage so returning users go straight to the connect button.
// ---------------------------------------------------------------------------

function PrivacyNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <div className="space-y-5">
      <p className="font-mono text-xs text-accent uppercase tracking-widest">
        What GHOST stores on your device
      </p>

      <div className="space-y-4 font-mono text-xs text-bone-dim leading-relaxed">
        <p>
          GHOST runs entirely in your browser. Nothing you enter or sync leaves your
          device except the requests GHOST makes directly to Strava on your behalf.
        </p>
        <p>
          <strong className="text-bone">In your browser's private storage:</strong>{' '}
          All your activities, shoes, journal entries, plans, and race calendar.
          This storage is tied to this browser and device. Clearing your browser
          site data deletes it.
        </p>
        <p>
          <strong className="text-bone">In browser localStorage:</strong>{' '}
          Your display preferences (theme, font size) and your home page. These
          are lightweight settings, not your training data.
        </p>
        <p>
          <strong className="text-bone">Your Strava API app details:</strong>{' '}
          The Client ID and Secret you enter during setup are saved to this
          device's private storage. They identify your API app to Strava —
          they are not your Strava password, and GHOST never sees or stores
          your password.
        </p>
        <p>
          <strong className="text-bone">Your Strava connection:</strong>{' '}
          Stored in private browser storage after you connect. GHOST uses it to
          pull your activities. You can revoke access at any time at{' '}
          <a
            href="https://www.strava.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            strava.com/settings/apps
          </a>
          {' '}— GHOST will need to reconnect if you do.
        </p>
        <p className="text-bone">
          No accounts. No servers. No analytics. Your data stays yours.
        </p>
      </div>

      <button
        type="button"
        onClick={onAcknowledge}
        className="font-mono text-xs uppercase tracking-widest px-5 py-3 border border-accent text-accent hover:bg-accent hover:text-ink transition-colors"
      >
        Got it — let's go
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not connected — login-style first-run screen.
// Privacy notice gates the connect button on the very first visit; the
// technical OAuth params live in a collapsed details block.
// Official Strava brand: #FC4C02 orange, 48px height, white text.
// ---------------------------------------------------------------------------

function NotConnected({
  clientId,
  onChangeCredentials,
}: {
  clientId: string | null;
  onChangeCredentials: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState<boolean>(
    () => localStorage.getItem('ghost.privacy_acknowledged') === 'true',
  );
  const redirectUri = `${window.location.origin}/setup`;
  const authUrl = clientId ? buildStravaAuthUrl(clientId) : '#';

  if (!acknowledged) {
    return (
      <PrivacyNotice
        onAcknowledge={() => {
          localStorage.setItem('ghost.privacy_acknowledged', 'true');
          setAcknowledged(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-sm text-bone-dim leading-relaxed">
        Connect your Strava account and GHOST will pull in your activity history
        automatically — your last 90 days sync the moment you're in.
      </p>

      {/* Official Strava "Connect with Strava" button — Strava brand colour #FC4C02 */}
      <a
        href={authUrl}
        className={`inline-flex items-center gap-3 px-5 py-3 font-mono text-sm font-bold transition-opacity ${
          clientId ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-50'
        }`}
        style={{ backgroundColor: '#FC4C02', color: '#fff', height: 48 }}
        onClick={(e) => !clientId && e.preventDefault()}
        aria-label="Connect with Strava"
      >
        {/* Strava S-logo mark */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        Connect with Strava
      </a>

      <details className="border border-ink-line bg-ink">
        <summary className="px-4 py-3 font-mono text-xs text-bone-mute uppercase tracking-widest cursor-pointer select-none hover:text-bone transition-colors">
          Connection details
        </summary>
        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
            <span className="text-bone-mute">client_id</span>
            <span className={clientId ? 'text-accent' : 'text-signal-miss'}>
              {clientId ?? 'NOT SET'}
            </span>
            <span className="text-bone-mute">redirect_uri</span>
            <span className="text-bone break-all">{redirectUri}</span>
            <span className="text-bone-mute">scope</span>
            <span className="text-bone">activity:read_all</span>
          </div>
          <p className="font-mono text-xs text-bone-mute mt-3 leading-relaxed">
            Strava must have <strong className="text-bone">{window.location.hostname}</strong> set as
            the Authorization Callback Domain.
          </p>
          <button
            type="button"
            onClick={onChangeCredentials}
            className="font-mono text-xs text-bone-mute hover:text-accent transition-colors mt-2"
          >
            Change API credentials →
          </button>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Athlete mismatch — different athlete detected
// ---------------------------------------------------------------------------

function AthleteMismatchView({
  state,
  onProceed,
  onCancel,
}: {
  state: { newTokens: StoredTokens; existingName: string };
  onProceed: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 border border-signal-warn/40 p-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-signal-warn flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-mono text-xs text-signal-warn uppercase tracking-widest">
            Different athlete detected
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            This device has activity data for <strong className="text-bone">{state.existingName}</strong>.
            Connecting as <strong className="text-bone">{state.newTokens.athleteName}</strong> will mix
            both athletes' data in the same database.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onProceed}
          className="font-mono text-xs text-signal-warn border border-signal-warn/40 hover:border-signal-warn px-3 py-1.5 transition-colors"
        >
          Continue anyway — mix data
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-xs text-bone-mute hover:text-bone transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connected
// ---------------------------------------------------------------------------

function ConnectedView({
  tokens,
  lastSync,
  partialScope,
  welcomeBack,
  clientId,
  onSync,
  onDisconnect,
}: {
  tokens: StoredTokens;
  lastSync: string | null;
  partialScope: boolean;
  welcomeBack?: string;
  clientId: string | null;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Never';

  return (
    <div className="space-y-5">
      {welcomeBack && (
        <div className="flex items-center gap-2 font-mono text-xs text-signal-ok">
          <CheckCircle size={12} className="flex-shrink-0" />
          {welcomeBack}
        </div>
      )}

      <div className="flex items-center gap-2">
        <CheckCircle size={14} className="text-accent flex-shrink-0" />
        <span className="font-mono text-sm text-bone">
          Connected as <strong>{tokens.athleteName || 'Strava athlete'}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-ink-line border border-ink-line">
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">Last sync</p>
          <p className="font-mono text-sm text-bone">{lastSyncLabel}</p>
        </div>
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">Token expires</p>
          <p className="font-mono text-sm text-bone">
            {new Date(tokens.expiresAt * 1000).toLocaleString('en-NZ', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">Athlete ID</p>
          <p className="font-mono text-sm text-bone-dim">{tokens.athleteId || '—'}</p>
        </div>
        <div className="bg-ink px-5 py-4">
          <p className="font-mono text-xs text-bone-mute uppercase tracking-widest mb-1">Scope</p>
          <p className={`font-mono text-sm ${partialScope ? 'text-signal-warn' : 'text-signal-ok'}`}>
            {partialScope ? 'activity:read (partial)' : 'activity:read_all'}
          </p>
        </div>
      </div>

      {/* Partial scope notice */}
      {partialScope && (
        <div className="border border-signal-warn/40 p-3 space-y-1">
          <p className="font-mono text-xs text-signal-warn uppercase tracking-widest">Limited access</p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            Private activities won't sync. Reconnect and tick the privacy checkbox to include them.
          </p>
          <a
            href={clientId ? buildStravaAuthUrl(clientId) : '#'}
            className="font-mono text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Reconnect with full access →
          </a>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          className="inline-flex items-center gap-2 px-4 py-2 border border-accent text-accent hover:bg-accent hover:text-ink font-mono text-xs uppercase tracking-widest transition-colors"
        >
          <RefreshCw size={12} />
          Sync now
        </button>

        {!confirmingDisconnect ? (
          <button
            onClick={() => setConfirmingDisconnect(true)}
            className="font-mono text-xs text-bone-mute hover:text-signal-miss transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <div className="flex items-center gap-3 border border-signal-miss/30 px-3 py-1.5">
            <span className="font-mono text-xs text-signal-miss">
              Revoke Strava access and clear tokens?
            </span>
            <button
              onClick={() => { setConfirmingDisconnect(false); void onDisconnect(); }}
              className="font-mono text-xs text-signal-miss border border-signal-miss/40 hover:border-signal-miss px-2 py-0.5 transition-colors"
            >
              Yes, disconnect
            </button>
            <button
              onClick={() => setConfirmingDisconnect(false)}
              className="font-mono text-xs text-bone-mute hover:text-bone transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] text-bone-mute">
        Disconnecting revokes Strava access and clears tokens. Your activity data is kept locally —
        delete it separately in Settings if needed.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Syncing — handles 'paused' phase calmly
// ---------------------------------------------------------------------------

function SyncingView({ progress }: { progress: SyncProgress }) {
  const phaseLabel: Record<SyncProgress['phase'], string> = {
    token:    'Refreshing token…',
    fetching: 'Fetching from Strava…',
    writing:  'Writing to database…',
    paused:   'Rate limit reached — importing gradually. Be patient.',
    done:     'Done',
    error:    'Error',
  };

  const isPaused = progress.phase === 'paused';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-mono text-xs text-bone-mute">
        {isPaused ? (
          <Clock size={12} className="flex-shrink-0 text-signal-warn" />
        ) : (
          <Loader size={12} className="animate-spin flex-shrink-0" />
        )}
        <span className={isPaused ? 'text-signal-warn' : undefined}>
          {phaseLabel[progress.phase]}
        </span>
      </div>
      {isPaused && (
        <p className="font-mono text-xs text-bone-mute leading-relaxed">
          Strava's rate limit was reached. GHOST will automatically resume in ~15 minutes.
          You can safely navigate away — the next time you visit Setup the sync will continue.
        </p>
      )}
      {(progress.fetched > 0 || progress.inserted > 0) && (
        <div className="font-mono text-xs text-bone-dim space-y-1">
          <p>{progress.fetched} activities fetched from Strava</p>
          <p>{progress.inserted} written to database</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

function ErrorView({ message, clientId, onDisconnect }: { message: string; clientId: string | null; onDisconnect: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-signal-miss flex-shrink-0 mt-0.5" />
        <p className="font-mono text-xs text-signal-miss leading-relaxed break-all">{message}</p>
      </div>
      <div className="flex gap-3">
        <a
          href={clientId ? buildStravaAuthUrl(clientId) : '#'}
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
