'use client';

import { useState, useTransition } from 'react';
import { Watch, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import {
  garminConnectAction,
  garminSubmitMfaAction,
  garminSyncAction,
  garminDisconnectAction,
} from '@/lib/actions/garmin';
import type { GarminConnectResult } from '@/lib/garmin/types';
import type { GarminSyncResult } from '@/lib/garmin/sync';

interface Props {
  connected: boolean;
  lastSyncAt: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toISOString().slice(0, 10);
}

/**
 * Garmin connection card (Phase 12, EXPERIMENTAL).
 *
 * State machine:
 *   idle -> (connect) -> connected | mfa | error
 *   mfa  -> (submit)  -> connected | error
 *   connected -> (sync) -> shows result
 */
export function GarminSection({ connected, lastSyncAt }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaSessionId, setMfaSessionId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [connectResult, setConnectResult] = useState<GarminConnectResult | null>(null);
  const [syncResult, setSyncResult] = useState<GarminSyncResult | null>(null);
  const [isConnected, setIsConnected] = useState(connected);
  const [pending, startTransition] = useTransition();

  const handleConnect = () => {
    const fd = new FormData();
    fd.set('username', username);
    fd.set('password', password);
    startTransition(async () => {
      const r = await garminConnectAction(fd);
      setConnectResult(r);
      if (r.status === 'mfa-required') setMfaSessionId(r.mfaSessionId);
      if (r.status === 'connected') {
        setIsConnected(true);
        setPassword('');
      }
    });
  };

  const handleSubmitMfa = () => {
    if (!mfaSessionId) return;
    const fd = new FormData();
    fd.set('mfa_session_id', mfaSessionId);
    fd.set('code', mfaCode);
    startTransition(async () => {
      const r = await garminSubmitMfaAction(fd);
      setConnectResult(r);
      if (r.status === 'connected') {
        setIsConnected(true);
        setMfaSessionId(null);
        setPassword('');
        setMfaCode('');
      }
    });
  };

  const handleSync = (days: number) => {
    const fd = new FormData();
    fd.set('days', String(days));
    startTransition(async () => {
      const r = await garminSyncAction(fd);
      setSyncResult(r);
    });
  };

  const handleDisconnect = () => {
    startTransition(async () => {
      await garminDisconnectAction();
      setIsConnected(false);
      setConnectResult(null);
      setSyncResult(null);
    });
  };

  return (
    <div className="bg-ink-shadow border border-ink-line rounded-xl shadow-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Watch size={20} strokeWidth={1.5} className="text-accent shrink-0 mt-1" />
        <div className="flex-1">
          <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
            biometrics
          </div>
          <h3 className="font-display tracking-wide-display uppercase text-xl text-bone mt-0.5">
            Garmin Connect
          </h3>
        </div>
        <span className="px-2 py-1 rounded-md bg-signal-warn/10 border border-signal-warn/40 text-signal-warn font-mono text-[10px] uppercase tracking-widest h-fit">
          Experimental
        </span>
      </div>

      {/* Experimental disclosure */}
      <div className="flex items-start gap-2 bg-signal-warn/10 border border-signal-warn/30 rounded-lg p-3">
        <AlertTriangle size={16} strokeWidth={1.5} className="text-signal-warn shrink-0 mt-0.5" />
        <div className="text-sm text-bone-dim leading-relaxed">
          This connects with your Garmin credentials directly via an unofficial
          route. It pulls only your own data and stores it on your machine. It
          may break if Garmin changes their service, and using it is at your own
          discretion. Your password is never stored - only a session token is
          kept in your OS keychain.
        </div>
      </div>

      {!isConnected ? (
        <>
          {/* Flow 1: credentials */}
          {!mfaSessionId && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="garmin-user" className="font-display tracking-wide-display uppercase text-xs text-bone-mute block">
                  Garmin email
                </label>
                <input
                  id="garmin-user"
                  type="email"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="garmin-pass" className="font-display tracking-wide-display uppercase text-xs text-bone-mute block">
                  Password
                </label>
                <input
                  id="garmin-pass"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone focus:border-accent focus:outline-none"
                />
                <p className="font-mono text-[10px] text-bone-mute">
                  ↳ used once to sign in; never written to disk
                </p>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={pending || !username || !password}
                className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
              >
                {pending ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          )}

          {/* Flow 2: MFA code */}
          {mfaSessionId && (
            <div className="space-y-3">
              <div className="bg-accent-faint border border-accent/30 rounded-lg p-3 text-sm text-bone-dim">
                Garmin sent a verification code to your email or phone. Enter it below.
              </div>
              <div className="space-y-2">
                <label htmlFor="garmin-mfa" className="font-display tracking-wide-display uppercase text-xs text-bone-mute block">
                  Verification code
                </label>
                <input
                  id="garmin-mfa"
                  type="text"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone tracking-widest focus:border-accent focus:outline-none"
                  placeholder="------"
                />
              </div>
              <button
                type="button"
                onClick={handleSubmitMfa}
                disabled={pending || mfaCode.trim().length === 0}
                className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
              >
                {pending ? 'Verifying...' : 'Submit code'}
              </button>
            </div>
          )}

          {connectResult?.status === 'error' && (
            <div className="bg-signal-miss/10 border border-signal-miss/40 rounded-lg p-3 text-sm text-signal-miss">
              {connectResult.error}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Connected state */}
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} strokeWidth={1.5} className="text-signal-ok" />
            <span className="text-bone-dim">
              Connected. Last sync: <span className="text-bone">{formatRelative(lastSyncAt)}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSync(7)}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              <RefreshCw size={14} strokeWidth={1.5} className={pending ? 'animate-spin' : ''} />
              Sync last 7 days
            </button>
            <button
              type="button"
              onClick={() => handleSync(90)}
              disabled={pending}
              className="px-4 py-2 bg-ink-panel border border-ink-line rounded-lg text-bone-dim hover:text-bone hover:border-ink-line-bold disabled:opacity-50 text-sm"
            >
              Backfill 90 days
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={pending}
              className="px-4 py-2 bg-signal-miss/10 border border-signal-miss/40 rounded-lg text-signal-miss hover:bg-signal-miss/20 disabled:opacity-50 text-sm"
            >
              Disconnect
            </button>
          </div>

          {syncResult && (
            <div
              className={
                'rounded-lg p-3 text-sm ' +
                (syncResult.ok
                  ? 'bg-signal-ok/10 border border-signal-ok/40 text-bone-dim'
                  : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
              }
            >
              {syncResult.ok ? (
                <span>
                  <span className="text-signal-ok font-medium">Synced</span> -{' '}
                  {syncResult.daysWritten} day{syncResult.daysWritten === 1 ? '' : 's'} written,{' '}
                  {syncResult.daysSkipped} skipped.
                </span>
              ) : (
                <span>{syncResult.error}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
