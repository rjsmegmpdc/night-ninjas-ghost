import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { RefreshCw, CheckCircle, AlertCircle, Loader, Clock, Sparkles } from 'lucide-react';
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
import {
  startSyncAuth,
  consumeSyncReturn,
  uploadProfile,
  downloadAndDecryptProfile,
  applyProfileBlob,
  type SyncIntent,
} from '@/lib/sync-profile';
import { buildAssessmentContext } from '@/lib/ai/assessment-builder';
import type { AssessmentContext } from '@/lib/ai/assessment-builder';
import { streamCoachReply } from '@/lib/ai/coach-client';
import { saveCoachSession } from '@/lib/ai/coaching-memory';
import { query, exec } from '@/db/client';
import { ALL_ENGINES } from '@/lib/plans/index';

import { callGeneratePlan, saveAiPlan } from '@/lib/ai/plan-client';

const WORKER_URL    = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';
const SHARED_APP_ID = import.meta.env.VITE_STRAVA_CLIENT_ID   as string | undefined;

// ---------------------------------------------------------------------------
// Wizard helpers
// ---------------------------------------------------------------------------

function weeksUntilRace(raceDateIso: string): number {
  const days = Math.floor(
    (new Date(raceDateIso + 'T00:00:00Z').getTime() - Date.now()) / 86400000,
  );
  return Math.max(4, Math.min(20, Math.floor(days / 7)));
}

function todayIsoWizard(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function minRaceDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const DISTANCE_OPTIONS = [
  { label: '5K',           km: 5 },
  { label: '10K',          km: 10 },
  { label: 'Half Marathon', km: 21.0975 },
  { label: 'Marathon',     km: 42.195 },
  { label: 'Custom',       km: 0 },
] as const;

const ASSESSMENT_QUESTION =
  'Give me an honest entry fitness assessment in 180–220 words. Cover: ' +
  '(1) my current training load and form in plain terms, ' +
  '(2) when I was fittest in the last year and how that compares to now, ' +
  '(3) my estimated race-ready paces for each distance I have data for, ' +
  '(4) my training consistency and any pattern you notice, ' +
  '(5) one specific thing to build on and one risk to watch. ' +
  'Be direct. Use the numbers. No generic advice.';

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
  const [syncStatus, setSyncStatus] = useState<{ type: 'ok' | 'err' | 'busy'; msg: string } | null>(null);
  const [pendingSync, setPendingSync] = useState<SyncIntent | null>(null);
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

  // Returned from Cloudflare Access with a sync token? Ask for the
  // encryption passphrase before doing anything — the passphrase is never
  // persisted, so it must be collected after the redirect round-trip.
  useEffect(() => {
    if (!ready) return;
    const intent = consumeSyncReturn();
    if (!intent) return;
    setPendingSync(intent);
    setSyncStatus(null);
  }, [ready]);

  async function executeSync(intent: SyncIntent, passphrase: string) {
    try {
      if (intent === 'backup') {
        setSyncStatus({ type: 'busy', msg: 'Encrypting and backing up…' });
        await uploadProfile(passphrase);
        setPendingSync(null);
        setSyncStatus({ type: 'ok', msg: 'Profile backed up — encrypted with your passphrase. Restore on any device with the same email + passphrase.' });
      } else {
        setSyncStatus({ type: 'busy', msg: 'Downloading and decrypting…' });
        const blob = await downloadAndDecryptProfile(passphrase);
        const { restoredCreds } = await applyProfileBlob(blob);
        setPendingSync(null);
        setSyncStatus({
          type: 'ok',
          msg: restoredCreds
            ? 'Profile restored — API credentials and preferences are in. Connect with Strava below.'
            : 'Preferences restored. This backup held no API credentials — run the wizard below.',
        });
        await loadState();
      }
    } catch (e) {
      // Wrong passphrase keeps the prompt open for a retry — the Access
      // token is still valid, no need to redo the email code.
      setSyncStatus({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  }

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
        <div className="rounded-xl bg-error-container/30 border border-error/30 p-4 space-y-1">
          <p className="font-mono text-xs text-on-error-container uppercase tracking-widest">
            Configuration missing
          </p>
          <p className="font-mono text-xs text-on-error-container/70 leading-relaxed">
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

      {/* Profile sync — optional cross-device backup/restore */}
      <ProfileSyncSection
        status={syncStatus}
        pendingSync={pendingSync}
        onExecute={(intent, passphrase) => { void executeSync(intent, passphrase); }}
        onCancelPending={() => { setPendingSync(null); setSyncStatus(null); }}
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
    <section className="m3-card p-6 space-y-6">
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
// Profile sync — optional backup/restore of setup across devices.
// Identity is Cloudflare Access (email + one-time PIN) on the worker's
// /sync path; the app itself stays account-free.
// ---------------------------------------------------------------------------

function ProfileSyncSection({
  status,
  pendingSync,
  onExecute,
  onCancelPending,
}: {
  status: { type: 'ok' | 'err' | 'busy'; msg: string } | null;
  pendingSync: SyncIntent | null;
  onExecute: (intent: SyncIntent, passphrase: string) => void;
  onCancelPending: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const busy = status?.type === 'busy';
  const passphraseOk = passphrase.length >= 8;

  function submit() {
    if (!pendingSync || !passphraseOk || busy) return;
    onExecute(pendingSync, passphrase);
  }

  return (
    <section className="m3-card p-6 space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-xs text-bone-mute uppercase tracking-widest">optional</p>
        <h2 className="font-display tracking-widest text-2xl uppercase text-bone">Profile Sync</h2>
      </div>

      <p className="font-mono text-xs text-bone-dim leading-relaxed max-w-xl">
        Move your setup between devices without redoing it. Backs up your API
        credentials, theme, font size, home page, and gear sizes — never your
        activities (those re-sync from Strava). You'll verify an email with a
        6-digit code, then choose a passphrase. Everything is{' '}
        <strong className="text-bone">encrypted on your device before upload</strong> —
        nobody, including whoever runs this site, can read your backup.
      </p>

      {!pendingSync && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => startSyncAuth('backup')}
            disabled={!WORKER_URL || busy}
            className="font-mono text-xs uppercase tracking-widest rounded-full px-5 py-2.5 bg-secondary-container text-on-secondary-container hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Back up this device
          </button>
          <button
            type="button"
            onClick={() => startSyncAuth('restore')}
            disabled={!WORKER_URL || busy}
            className="font-mono text-xs uppercase tracking-widest rounded-full px-5 py-2.5 bg-secondary-container text-on-secondary-container hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Restore to this device
          </button>
        </div>
      )}

      {/* Passphrase prompt — appears after the email code round-trip */}
      {pendingSync && (
        <div className="rounded-2xl bg-surface-container-low p-4 space-y-3 max-w-md">
          <p className="font-mono text-xs text-accent uppercase tracking-widest">
            {pendingSync === "backup" ? "Choose an encryption passphrase" : "Enter your encryption passphrase"}
          </p>
          <p className="font-mono text-xs text-bone-dim leading-relaxed">
            {pendingSync === "backup"
              ? "At least 8 characters. You’ll need it to restore on another device. There is no reset — if you lose it, just back up again from a device that’s already set up."
              : "The passphrase you chose when you backed up."}
          </p>
          <div className="relative">
            <input
              type={showPassphrase ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="passphrase"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 pr-12 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-bone-mute hover:text-bone"
              tabIndex={-1}
            >
              {showPassphrase ? "hide" : "show"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={!passphraseOk || busy}
              className="font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {busy ? "Working…" : pendingSync === "backup" ? "Encrypt & back up" : "Decrypt & restore"}
            </button>
            <button
              type="button"
              onClick={() => { setPassphrase(""); onCancelPending(); }}
              disabled={busy}
              className="font-mono text-xs rounded-full px-4 py-2 text-primary hover:bg-primary/8 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <p
          className={`font-mono text-xs leading-relaxed ${
            status.type === 'ok' ? 'text-signal-ok' : status.type === 'err' ? 'text-signal-miss' : 'text-bone-mute'
          }`}
          role="status"
          aria-live="polite"
        >
          {status.msg}
        </p>
      )}

      <p className="font-mono text-[10px] text-bone-mute leading-relaxed max-w-xl">
        Requires profile sync to be enabled on this deployment (Cloudflare
        Access + KV — see docs/ACCESS-SETUP.md). If it isn't, the buttons
        will return an error and nothing is stored.
      </p>
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
      <code className="text-bone bg-ink px-2 py-0.5 m3-card break-all">{value}</code>
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

      <p className="font-mono text-xs text-bone-mute leading-relaxed m3-card px-3 py-2">
        Already set up GHOST on another device? Skip this — use{' '}
        <strong className="text-bone">Profile Sync</strong> at the bottom of
        this page to restore your credentials here.
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
          <label htmlFor="cred-client-id" className="font-mono text-[11px] font-medium text-on-surface-variant tracking-wide">Client ID</label>
          <input
            id="cred-client-id"
            type="text"
            inputMode="numeric"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="123456"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="space-y-1 max-w-sm">
          <label htmlFor="cred-client-secret" className="font-mono text-[11px] font-medium text-on-surface-variant tracking-wide">Client Secret</label>
          <div className="relative">
            <input
              id="cred-client-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="40-character secret"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 pr-12 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
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
          className="w-full sm:w-auto font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
          Stored locally in your browser's Origin Private File System (OPFS),
          sandboxed to this browser and device — not encrypted at rest. Clearing your browser
          site data deletes it.
        </p>
        <p>
          <strong className="text-bone">In browser localStorage:</strong>{' '}
          Your display preferences (theme, font size) and your home page. These
          are lightweight settings, not your training data.
        </p>
        {!SHARED_APP_ID && (
          <p>
            <strong className="text-bone">Your Strava API app details:</strong>{' '}
            The Client ID and Secret you enter during setup are saved to this
            device's private storage. They identify your API app to Strava —
            they are not your Strava password, and GHOST never sees or stores
            your password.
          </p>
        )}
        <p>
          <strong className="text-bone">Your Strava connection:</strong>{' '}
          When you connect, Strava grants GHOST permission tokens to read your
          activities. These tokens are stored in private browser storage on
          this device only. Your Strava password is never shared with GHOST —
          you log in on strava.com directly. You can revoke access at any time
          at{' '}
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
        className="font-mono text-xs uppercase tracking-widest rounded-full bg-primary text-on-primary px-6 py-2.5 font-bold hover:shadow-md active:opacity-90 transition-all"
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

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect once',
    body: 'Tap the button below. You\'ll approve access on strava.com — your password never touches GHOST. Your last 90 days of activities sync the moment you\'re in.',
  },
  {
    step: '02',
    title: 'AI coach reads your history',
    body: 'After setup your coach assesses your current fitness: training load, best paces, patterns and risk areas. Honest, specific, no generic advice.',
  },
  {
    step: '03',
    title: 'Set a race goal',
    body: 'Lock in a race and a training style. Your calendar fills with the right sessions at the right volume for where you are right now.',
  },
  {
    step: '04',
    title: 'Coach feedback after every run',
    body: 'Each Strava sync triggers a review. Your coach checks compliance, adjusts the plan if life gets in the way, and flags recovery signals from your biometrics.',
  },
];

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
    <div className="space-y-8">
      {/* How it works — step flow */}
      <div className="space-y-4">
        <p className="font-mono text-xs text-accent uppercase tracking-widest">How it works</p>
        <ol className="space-y-4">
          {HOW_IT_WORKS.map(({ step, title, body }) => (
            <li key={step} className="flex gap-4">
              <span className="font-display text-2xl text-accent/40 leading-none w-8 shrink-0 select-none">
                {step}
              </span>
              <div className="space-y-0.5">
                <p className="font-mono text-xs font-bold text-bone uppercase tracking-wide">{title}</p>
                <p className="font-mono text-xs text-bone-dim leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Official Strava "Connect with Strava" button — Strava brand colour #FC4C02 */}
      <div className="space-y-3">
        <a
          href={authUrl}
          className={`inline-flex items-center gap-3 rounded-full px-5 py-3 font-mono text-sm font-bold transition-opacity ${
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
        <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
          One-time setup. Once connected, GHOST remembers you — no re-login needed.
        </p>
      </div>

      <details className="bg-surface-container rounded-xl">
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
          {!SHARED_APP_ID && (
            <button
              type="button"
              onClick={onChangeCredentials}
              className="font-mono text-xs text-bone-mute hover:text-accent transition-colors mt-2"
            >
              Change API credentials →
            </button>
          )}
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
    <div className="rounded-xl bg-surface-container-high border border-signal-warn/40 p-4 space-y-4">
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
      <div className="flex items-center gap-3">
        <button
          onClick={onProceed}
          className="font-mono text-xs rounded-full px-4 py-1.5 bg-secondary-container text-on-secondary-container hover:shadow-sm transition-all"
        >
          Continue anyway — mix data
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-xs rounded-full px-4 py-1.5 text-primary hover:bg-primary/8 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FitnessAssessmentCard — shown in ConnectedView after sync completes
// ---------------------------------------------------------------------------

type AssessmentCardState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

function FitnessAssessmentCard({
  athleteId,
  onComplete,
}: {
  athleteId: number;
  onComplete?: (text: string) => void;
}) {
  const [cardState, setCardState] = useState<AssessmentCardState>('idle');
  const [assessmentDone, setAssessmentDone] = useState<boolean | null>(null); // null = loading
  const [activityCount, setActivityCount] = useState(0);
  const [text, setText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetting('entry_assessment_done').then((val) => {
      if (!cancelled) setAssessmentDone(val !== null);
    }).catch(() => { if (!cancelled) setAssessmentDone(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Still loading settings — render nothing to avoid flash
  if (assessmentDone === null) return null;

  // Prior assessment exists — show compact reassess link
  if (assessmentDone) {
    return (
      <div className="rounded-2xl bg-surface-container p-6 mt-6">
        <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-2">
          fitness baseline
        </p>
        <p className="font-mono text-xs text-on-surface-variant leading-relaxed mb-3">
          Entry assessment already complete.
        </p>
        <button
          type="button"
          onClick={() => setAssessmentDone(false)}
          className="font-mono text-xs text-on-surface-variant underline underline-offset-2 hover:text-on-surface transition-colors"
        >
          Reassess my fitness baseline
        </button>
      </div>
    );
  }

  async function handleGetAssessment() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCardState('loading');
    setText('');
    setErrorMsg('');

    try {
      const ctx: AssessmentContext = await buildAssessmentContext();
      if (ctrl.signal.aborted) return;

      setActivityCount(ctx.activityCount);

      if (!ctx.hasSufficientData) {
        setCardState('error');
        setErrorMsg('Sync more runs to unlock your assessment (10+ needed)');
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      setCardState('streaming');

      const gen = streamCoachReply(
        {
          athleteId,
          context: ctx.contextText,
          question: ASSESSMENT_QUESTION,
          model: 'claude-haiku-4-5-20251001',
        },
        ctrl.signal,
      );

      let fullText = '';
      for await (const chunk of gen) {
        if (ctrl.signal.aborted) break;
        fullText += chunk;
        setText(fullText);
      }

      if (!ctrl.signal.aborted) {
        await saveCoachSession({
          sessionType: 'entry_assessment',
          referenceDate: today,
          contextSnapshot: ctx.contextText,
          response: fullText,
        });
        await setSetting('entry_assessment_done', today);
        await setSetting('entry_assessment_text', fullText);
        setCardState('done');
        onComplete?.(fullText);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setCardState('error');
      setErrorMsg((err as Error).message ?? 'Assessment failed — try again.');
    }
  }

  return (
    <div className="rounded-2xl bg-surface-container p-6 mt-6">
      <p className="text-base font-bold text-on-surface">Your fitness baseline</p>
      {cardState === 'idle' && (
        <>
          {activityCount > 0 && (
            <p className="text-sm text-on-surface-variant mt-0.5">
              {activityCount} Strava runs analysed
            </p>
          )}
          <button
            type="button"
            onClick={() => { void handleGetAssessment(); }}
            className="rounded-full bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold mt-4 hover:shadow-md active:opacity-90 transition-all"
          >
            Get my fitness assessment
          </button>
        </>
      )}

      {cardState === 'loading' && (
        <p className="text-sm text-on-surface-variant mt-4 animate-pulse font-mono">
          Building your assessment…
        </p>
      )}

      {(cardState === 'streaming' || cardState === 'done') && (
        <div>
          <p className="text-sm text-on-surface leading-relaxed mt-4 whitespace-pre-wrap">
            {text}
            {cardState === 'streaming' && (
              <span
                className="inline-block w-0.5 h-4 bg-on-surface ml-0.5 animate-pulse align-middle"
                aria-hidden="true"
              />
            )}
          </p>
          {cardState === 'done' && (
            <Link
              to="/patrol"
              className="inline-block mt-5 rounded-full bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold hover:shadow-md active:opacity-90 transition-all"
            >
              Continue to dashboard
            </Link>
          )}
        </div>
      )}

      {cardState === 'error' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {errorMsg || 'Assessment unavailable — try again.'}
          </p>
          <button
            type="button"
            onClick={() => setCardState('idle')}
            className="font-mono text-xs text-on-surface-variant underline underline-offset-2 hover:text-on-surface transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrainingWizard — post-connection setup: Goal → Dojo → Plan → Done
// Shown once; gated by wizard_complete setting.
// ---------------------------------------------------------------------------

type WizardStep = 'goal' | 'dojo' | 'plan' | 'done';

interface WizardGoalRace {
  id: number | null; // null = newly inserted
  name: string;
  date: string;
  distanceKm: number;
  goalTime: string | null;
}

function WizardStepIndicator({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string; num: string }[] = [
    { key: 'goal', label: 'Goal', num: '01' },
    { key: 'dojo', label: 'Dojo', num: '02' },
    { key: 'plan', label: 'Plan', num: '03' },
  ];

  const activeIdx = step === 'done' ? 3 : steps.findIndex(s => s.key === step);

  return (
    <nav aria-label="Wizard progress" className="flex items-center gap-0 font-mono text-xs">
      {steps.map((s, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <span key={s.key} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="mx-1.5 text-bone-mute select-none" aria-hidden="true">→</span>
            )}
            <span
              className={[
                'uppercase tracking-widest',
                isActive ? 'text-accent font-bold' : isDone ? 'text-signal-ok' : 'text-bone-mute',
              ].join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              {s.num} {s.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

function TrainingWizard({ tokens }: { tokens: StoredTokens }) {
  const [step, setStep] = useState<WizardStep>('goal');
  const [wizardLoading, setWizardLoading] = useState(true);

  // Goal state
  const [existingRace, setExistingRace] = useState<WizardGoalRace | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<WizardGoalRace | null>(null);
  const [distanceOption, setDistanceOption] = useState<number>(0); // index into DISTANCE_OPTIONS
  const [customKm, setCustomKm] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  // Dojo state
  const [selectedDojoSlug, setSelectedDojoSlug] = useState<string | null>(null);
  const [dojoSubmitting, setDojoSubmitting] = useState(false);
  const [planId, setPlanId] = useState<number | null>(null);

  // Plan generation state
  const [existingAssessment, setExistingAssessment] = useState<string | null>(null);
  const [assessmentReady, setAssessmentReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Done state
  const [todaySessionLabel, setTodaySessionLabel] = useState<string | null>(null);

  // Check wizard_complete on mount — dismiss self if already done
  const [shouldShow, setShouldShow] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const done = await getSetting('wizard_complete');
      if (cancelled) return;
      if (done !== null) {
        setShouldShow(false);
        return;
      }

      // Load existing goal race
      const rows = await query(
        'SELECT id, name, date, distance_km, goal_time FROM races WHERE is_goal = 1 ORDER BY date ASC LIMIT 1',
      );
      if (!cancelled && rows.length) {
        const r = rows[0];
        setExistingRace({
          id: r[0] as number,
          name: r[1] as string,
          date: r[2] as string,
          distanceKm: r[3] as number,
          goalTime: r[4] as string | null,
        });
      }
      setShouldShow(true);
      setWizardLoading(false);
    }
    init().catch(() => { if (!cancelled) setShouldShow(false); });
    return () => { cancelled = true; };
  }, []);

  // Pre-load assessment text when we arrive at plan step
  useEffect(() => {
    if (step !== 'plan') return;
    let cancelled = false;
    getSetting('entry_assessment_text').then((text) => {
      if (!cancelled) {
        setExistingAssessment(text);
        setAssessmentReady(text !== null);
      }
    }).catch(() => { if (!cancelled) setAssessmentReady(false); });
    return () => { cancelled = true; };
  }, [step]);

  if (shouldShow === null || wizardLoading) return null;
  if (shouldShow === false) return null;

  // ── Step 1: Goal ──────────────────────────────────────────────────────────

  async function handleUseExistingRace() {
    if (!existingRace) return;
    setSelectedGoal(existingRace);
    setStep('dojo');
  }

  async function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGoalError(null);
    const option = DISTANCE_OPTIONS[distanceOption];
    const km = option.km === 0 ? parseFloat(customKm) : option.km;
    if (!km || km <= 0) { setGoalError('Enter a valid distance'); return; }
    if (!raceDate) { setGoalError('Pick a race date'); return; }

    setGoalSubmitting(true);
    try {
      const raceName = option.km === 0 ? `${km}km Race` : `${option.label} Race`;
      const goalTimeVal = targetTime.trim() || null;
      await exec(
        `INSERT OR REPLACE INTO races (name, date, distance_km, goal_time, is_goal, level)
         VALUES (?, ?, ?, ?, 1, 'intermediate')`,
        [raceName, raceDate, km, goalTimeVal],
      );
      const rows = await query(
        'SELECT id FROM races WHERE is_goal = 1 ORDER BY id DESC LIMIT 1',
      );
      const newId = rows[0]?.[0] as number | undefined;
      setSelectedGoal({
        id: newId ?? null,
        name: raceName,
        date: raceDate,
        distanceKm: km,
        goalTime: goalTimeVal,
      });
      setStep('dojo');
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : 'Failed to save goal');
    } finally {
      setGoalSubmitting(false);
    }
  }

  // ── Step 2: Dojo ──────────────────────────────────────────────────────────

  async function handleChoosePlan() {
    if (!selectedDojoSlug || !selectedGoal) return;
    setDojoSubmitting(true);
    try {
      const weeksAvail = weeksUntilRace(selectedGoal.date);
      await exec(
        `INSERT OR IGNORE INTO plans (dojo, params_json) VALUES (?, ?)`,
        [selectedDojoSlug, JSON.stringify({ level: 'intermediate', programWeeks: weeksAvail })],
      );
      const planRows = await query(
        'SELECT id FROM plans WHERE dojo = ? ORDER BY id DESC LIMIT 1',
        [selectedDojoSlug],
      );
      const newPlanId = planRows[0]?.[0] as number;
      setPlanId(newPlanId);
      await exec(
        `INSERT OR IGNORE INTO plan_periods (plan_id, start_date) VALUES (?, date('now'))`,
        [newPlanId],
      );

      if (selectedDojoSlug === 'ai-coach') {
        setStep('plan');
      } else {
        // Template dojo path → skip to done
        await setSetting('wizard_complete', todayIsoWizard());
        setStep('done');
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setDojoSubmitting(false);
    }
  }

  // ── Step 3: Generate AI plan ──────────────────────────────────────────────

  async function handleGenerate() {
    if (!planId || !selectedGoal) return;
    setGenerating(true);
    setGenError(null);
    try {
      const weeksAvail = weeksUntilRace(selectedGoal.date);
      const assessText = existingAssessment ?? '';
      const plan = await callGeneratePlan({
        athleteId: tokens.athleteId,
        context: assessText,
        goalDistanceKm: selectedGoal.distanceKm,
        goalTimeS: selectedGoal.goalTime
          ? selectedGoal.goalTime.split(':').reduce((acc, v, i, a) =>
              acc + Number(v) * Math.pow(60, a.length - 1 - i), 0)
          : 0,
        weeksAvailable: weeksAvail,
      });
      await saveAiPlan(planId, plan);
      await setSetting('wizard_complete', todayIsoWizard());
      setStep('done');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Plan generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ── Step: Done ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'done') return;
    // Best-effort: try to find today's session from the active plan
    let cancelled = false;
    async function loadTodaySession() {
      const today = todayIsoWizard();
      const rows = await query(
        `SELECT ais.label FROM ai_plan_sessions ais
         JOIN plan_periods pp ON pp.plan_id = ais.plan_id
         WHERE pp.end_date IS NULL
           AND ais.week_number = CAST((julianday(?) - julianday(pp.start_date)) / 7 AS INTEGER) + 1
           AND ais.dow = CAST((julianday(?) - julianday(pp.start_date)) % 7 AS INTEGER)
         LIMIT 1`,
        [today, today],
      ).catch(() => [] as unknown[][]);
      if (!cancelled && rows.length) {
        setTodaySessionLabel(rows[0][0] as string);
      }
    }
    loadTodaySession().catch(() => {});
    return () => { cancelled = true; };
  }, [step]);

  // ── Render ────────────────────────────────────────────────────────────────

  const weeksAvail = selectedGoal ? weeksUntilRace(selectedGoal.date) : 16;

  return (
    <div className="rounded-2xl bg-surface-container p-6 mt-6 space-y-6" role="region" aria-label="Training setup wizard">
      {step !== 'done' && <WizardStepIndicator step={step} />}

      {/* ── Step 1: Goal ── */}
      {step === 'goal' && (
        <div className="space-y-5">
          <div>
            <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Step 1 of 3</p>
            <h3 className="font-display text-2xl tracking-widest uppercase text-on-surface">Set your goal</h3>
            <p className="font-mono text-xs text-on-surface-variant mt-1 leading-relaxed">
              Lock in a race. Your plan will be built around it.
            </p>
          </div>

          {existingRace && (
            <div className="rounded-xl bg-surface-container-high border border-primary/20 p-4 space-y-3">
              <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Your current goal race</p>
              <div>
                <p className="font-mono text-sm text-on-surface font-bold">{existingRace.name}</p>
                <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                  {new Date(existingRace.date + 'T12:00:00Z').toLocaleDateString('en-NZ', {
                    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
                  })}
                  {' · '}{existingRace.distanceKm}km
                  {existingRace.goalTime && ` · Target ${existingRace.goalTime}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { void handleUseExistingRace(); }}
                  className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-bold hover:shadow-md active:opacity-90 transition-all"
                >
                  Use this race
                </button>
                <button
                  type="button"
                  onClick={() => setExistingRace(null)}
                  className="font-mono text-xs text-on-surface-variant hover:text-on-surface transition-colors underline underline-offset-2"
                >
                  Change goal
                </button>
              </div>
            </div>
          )}

          {!existingRace && (
            <form onSubmit={(e) => { void handleGoalSubmit(e); }} className="space-y-4 max-w-sm" noValidate>
              {/* Distance picker */}
              <fieldset>
                <legend className="font-mono text-[11px] font-medium text-on-surface-variant tracking-wide block mb-1.5">
                  Race distance
                </legend>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setDistanceOption(i)}
                      aria-pressed={distanceOption === i}
                      className={[
                        'rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors',
                        distanceOption === i
                          ? 'bg-secondary-container text-on-secondary-container font-bold'
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-on-surface/8',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {DISTANCE_OPTIONS[distanceOption].km === 0 && (
                  <div className="mt-2">
                    <label htmlFor="wizard-custom-km" className="sr-only">Custom distance in km</label>
                    <input
                      id="wizard-custom-km"
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={customKm}
                      onChange={(e) => setCustomKm(e.target.value)}
                      placeholder="Distance in km"
                      className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                )}
              </fieldset>

              {/* Race date */}
              <div className="space-y-1">
                <label htmlFor="wizard-race-date" className="font-mono text-[11px] font-medium text-on-surface-variant tracking-wide block">
                  Race date
                </label>
                <input
                  id="wizard-race-date"
                  type="date"
                  value={raceDate}
                  min={minRaceDate()}
                  onChange={(e) => setRaceDate(e.target.value)}
                  required
                  className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Target time (optional) */}
              <div className="space-y-1">
                <label htmlFor="wizard-target-time" className="font-mono text-[11px] font-medium text-on-surface-variant tracking-wide block">
                  Target time <span className="text-on-surface-variant/60 normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="wizard-target-time"
                  type="text"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  placeholder="HH:MM:SS"
                  className="w-full bg-surface-container-high rounded-lg border border-transparent px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {goalError && (
                <p className="font-mono text-xs text-signal-miss" role="alert">{goalError}</p>
              )}

              <button
                type="submit"
                disabled={goalSubmitting}
                className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-bold hover:shadow-md active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {goalSubmitting ? 'Saving…' : 'Set goal →'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Step 2: Dojo ── */}
      {step === 'dojo' && (
        <div className="space-y-5">
          <div>
            <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Step 2 of 3</p>
            <h3 className="font-display text-2xl tracking-widest uppercase text-on-surface">Choose your dojo</h3>
            <p className="font-mono text-xs text-on-surface-variant mt-1 leading-relaxed">
              Pick a training methodology. Your plan will run for {weeksAvail} weeks.
            </p>
          </div>

          {/* AI Coach — recommended, distinctive card */}
          <button
            type="button"
            onClick={() => setSelectedDojoSlug(selectedDojoSlug === 'ai-coach' ? null : 'ai-coach')}
            aria-pressed={selectedDojoSlug === 'ai-coach'}
            className={[
              'w-full text-left rounded-2xl border-2 p-5 transition-all',
              selectedDojoSlug === 'ai-coach'
                ? 'border-primary ring-2 ring-primary bg-primary/5'
                : 'border-primary/30 bg-surface-container-high hover:border-primary/60 hover:bg-surface-container',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary flex-shrink-0" aria-hidden="true" />
                <span className="font-display text-lg tracking-widest uppercase text-on-surface">AI Coach</span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest rounded-full bg-primary text-on-primary px-3 py-1">
                Recommended
              </span>
            </div>
            <p className="font-mono text-xs text-on-surface-variant mt-2 leading-relaxed">
              A personalized plan built from your Strava history, race goal, and fitness assessment.
            </p>
          </button>

          {/* Template dojos — 2-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ALL_ENGINES.map((engine) => {
              const firstSentence = engine.philosophy.split(/\.\s/)[0];
              const truncated = firstSentence.length > 80
                ? firstSentence.slice(0, 77) + '…'
                : firstSentence;
              const isSelected = selectedDojoSlug === engine.dojo;
              return (
                <button
                  key={engine.dojo}
                  type="button"
                  onClick={() => setSelectedDojoSlug(isSelected ? null : engine.dojo)}
                  aria-pressed={isSelected}
                  className={[
                    'text-left rounded-xl p-4 transition-all border',
                    isSelected
                      ? 'ring-2 ring-primary border-primary bg-primary/5'
                      : 'border-ink-line bg-surface-container-high hover:bg-surface-container',
                  ].join(' ')}
                >
                  <p className="font-mono text-xs font-bold text-on-surface uppercase tracking-wide">
                    {engine.displayName}
                  </p>
                  <p className="font-mono text-[10px] text-on-surface-variant mt-1 leading-relaxed">
                    {truncated}
                  </p>
                </button>
              );
            })}
          </div>

          {genError && (
            <p className="font-mono text-xs text-signal-miss" role="alert">{genError}</p>
          )}

          <button
            type="button"
            onClick={() => { void handleChoosePlan(); }}
            disabled={!selectedDojoSlug || dojoSubmitting}
            className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-bold hover:shadow-md active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {dojoSubmitting ? 'Saving…' : 'Choose this plan →'}
          </button>
        </div>
      )}

      {/* ── Step 3: Generate AI plan ── */}
      {step === 'plan' && (
        <div className="space-y-5">
          <div>
            <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Step 3 of 3</p>
            <h3 className="font-display text-2xl tracking-widest uppercase text-on-surface">Generate your plan</h3>
            <p className="font-mono text-xs text-on-surface-variant mt-1 leading-relaxed">
              Your AI coach will build a {weeksAvail}-week plan tailored to your fitness and race goal.
            </p>
          </div>

          {/* Show existing assessment text if available */}
          {existingAssessment && (
            <div className="rounded-xl bg-surface-container-high p-4 space-y-2">
              <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">Fitness assessment</p>
              <p className="font-mono text-xs text-on-surface leading-relaxed line-clamp-6 whitespace-pre-wrap">
                {existingAssessment}
              </p>
            </div>
          )}

          {/* If no assessment yet, embed the card and wait */}
          {!existingAssessment && (
            <div className="space-y-3">
              <p className="font-mono text-xs text-on-surface-variant leading-relaxed">
                Your AI coach needs a fitness assessment before generating your plan. Complete the assessment below, then generate.
              </p>
              <FitnessAssessmentCard
                athleteId={tokens.athleteId}
                onComplete={(text) => {
                  setExistingAssessment(text);
                  setAssessmentReady(true);
                }}
              />
            </div>
          )}

          {genError && (
            <p className="font-mono text-xs text-signal-miss" role="alert">{genError}</p>
          )}

          {generating && (
            <div className="flex items-center gap-2 font-mono text-xs text-bone-mute" role="status" aria-live="polite">
              <Loader size={12} className="animate-spin flex-shrink-0" />
              Generating your {weeksAvail}-week plan… this takes about 30 seconds
            </div>
          )}

          {!generating && (assessmentReady || existingAssessment) && (
            <button
              type="button"
              onClick={() => { void handleGenerate(); }}
              className="rounded-full bg-primary text-on-primary px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-bold hover:shadow-md active:opacity-90 transition-all"
            >
              Generate my plan →
            </button>
          )}

          {genError && (
            <button
              type="button"
              onClick={() => { setGenError(null); void handleGenerate(); }}
              className="font-mono text-xs text-on-surface-variant underline underline-offset-2 hover:text-on-surface transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-signal-ok flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-display text-2xl tracking-widest uppercase text-on-surface">
                You're all set, {tokens.athleteName.split(' ')[0] || 'Athlete'}
              </h3>
              <p className="font-mono text-xs text-on-surface-variant mt-1 leading-relaxed">
                Your {weeksAvail}-week plan starts today.
              </p>
            </div>
          </div>

          {todaySessionLabel ? (
            <p className="font-mono text-xs text-on-surface leading-relaxed">
              Tonight: <strong>{todaySessionLabel}</strong>
            </p>
          ) : (
            <p className="font-mono text-xs text-on-surface-variant leading-relaxed">
              Check your Patrol page for today's session.
            </p>
          )}

          <Link
            to="/patrol"
            className="inline-block rounded-full bg-primary text-on-primary px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-bold hover:shadow-md active:opacity-90 transition-all"
          >
            Go to Patrol →
          </Link>
        </div>
      )}
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

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-container rounded-xl px-5 py-4">
          <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Last sync</p>
          <p className="font-mono text-sm text-on-surface">{lastSyncLabel}</p>
        </div>
        <div className="bg-surface-container rounded-xl px-5 py-4">
          <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Token expires</p>
          <p className="font-mono text-sm text-on-surface">
            {new Date(tokens.expiresAt * 1000).toLocaleString('en-NZ', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="bg-surface-container rounded-xl px-5 py-4">
          <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Athlete ID</p>
          <p className="font-mono text-sm text-on-surface-variant">{tokens.athleteId || '—'}</p>
        </div>
        <div className="bg-surface-container rounded-xl px-5 py-4">
          <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-1">Scope</p>
          <p className={`font-mono text-sm ${partialScope ? 'text-signal-warn' : 'text-signal-ok'}`}>
            {partialScope ? 'activity:read (partial)' : 'activity:read_all'}
          </p>
        </div>
      </div>

      {/* Partial scope notice */}
      {partialScope && (
        <div className="rounded-xl bg-surface-container-high border border-signal-warn/40 p-3 space-y-1">
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

      {/* Training setup wizard — shown once after first connect */}
      <TrainingWizard tokens={tokens} />

      {/* Entry fitness assessment — shown after sync, hidden once completed */}
      <FitnessAssessmentCard athleteId={tokens.athleteId} />

      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-secondary-container text-on-secondary-container hover:shadow-sm font-mono text-xs uppercase tracking-widest transition-all"
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
          <div className="flex items-center gap-3 rounded-xl bg-error-container/20 border border-error/20 px-3 py-2">
            <span className="font-mono text-xs text-on-error-container">
              Revoke Strava access and clear tokens?
            </span>
            <button
              onClick={() => { setConfirmingDisconnect(false); void onDisconnect(); }}
              className="font-mono text-xs rounded-full px-3 py-1 bg-error-container text-on-error-container hover:shadow-sm transition-all"
            >
              Yes, disconnect
            </button>
            <button
              onClick={() => setConfirmingDisconnect(false)}
              className="font-mono text-xs rounded-full px-3 py-1 text-primary hover:bg-primary/8 transition-colors"
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
