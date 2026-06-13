/**
 * Garmin client orchestration (Phase 12) - server-only.
 *
 * ⚠ EXPERIMENTAL - the unofficial Garmin route is ToS-grey and depends on
 * undocumented endpoints that can change without notice. Pulls the
 * athlete's OWN data using their OWN credentials. Local-first: tokens live
 * in the OS keychain, data in the local SQLite DB. Nothing leaves the box.
 *
 * Two auth flows:
 *   Flow 1 (no MFA): library login() handles everything.
 *   Flow 2 (MFA):    native ssoLogin/ssoSubmitMfa obtains a ticket, then
 *                    the library's getOauth1Token + exchange complete OAuth.
 */

import 'server-only';
import type { GarminDailySnapshot, GarminConnectResult } from './types';
import {
  extractSleep,
  extractDailySummary,
  extractHrv,
  extractVo2max,
  extractWeight,
} from './mapper';
import { ssoLogin, ssoSubmitMfa, type MfaPendingSession } from './mfa-auth';
import {
  getGarminSessionTokens,
  setGarminSessionTokens,
} from '@/lib/store/secrets';

// In-memory store of pending MFA sessions, keyed by a generated id.
// Lives only for the life of the dev-server process - acceptable because
// MFA codes expire in minutes anyway.
const pendingMfa = new Map<string, MfaPendingSession>();

// Lazy import - garmin-connect is heavy and only needed when syncing.
async function loadLib() {
  const mod = await import('garmin-connect');
  return mod.GarminConnect;
}

/**
 * Flow 1 + entry to Flow 2. Attempt login with username/password.
 */
export async function connectGarmin(
  username: string,
  password: string
): Promise<GarminConnectResult> {
  try {
    const result = await ssoLogin(username, password);

    if (result.kind === 'error') return { status: 'error', error: result.error };

    if (result.kind === 'mfa-required') {
      const mfaSessionId = `mfa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingMfa.set(mfaSessionId, result.session);
      // Clean up stale sessions (>10 min)
      for (const [k, v] of pendingMfa) {
        if (Date.now() - v.createdAt > 600_000) pendingMfa.delete(k);
      }
      return { status: 'mfa-required', mfaSessionId };
    }

    // kind === 'ticket' -> complete OAuth exchange via the library
    return await completeWithTicket(result.ticket);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Flow 2 completion - submit the MFA code, finish OAuth, persist tokens.
 */
export async function submitGarminMfa(
  mfaSessionId: string,
  code: string
): Promise<GarminConnectResult> {
  const session = pendingMfa.get(mfaSessionId);
  if (!session) {
    return { status: 'error', error: 'MFA session expired. Reconnect to request a new code.' };
  }
  try {
    const result = await ssoSubmitMfa(session, code);
    pendingMfa.delete(mfaSessionId);
    if (result.kind === 'error') return { status: 'error', error: result.error };
    return await completeWithTicket(result.ticket);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Given an SSO ticket, use the library's OAuth exchange and persist the
 * resulting session tokens to the keychain.
 */
async function completeWithTicket(ticket: string): Promise<GarminConnectResult> {
  const GarminConnect = await loadLib();
  const gc = new GarminConnect({ username: '', password: '' });

  // Access the library's internal HttpClient to run the public exchange.
  // The library exposes client on the instance.
  const client = (gc as unknown as { client: {
    getOauth1Token: (t: string) => Promise<unknown>;
    exchange: (o: unknown) => Promise<void>;
    fetchOauthConsumer: () => Promise<void>;
  } }).client;

  await client.fetchOauthConsumer();
  const oauth1 = await client.getOauth1Token(ticket);
  await client.exchange(oauth1);

  const tokens = gc.exportToken();
  await setGarminSessionTokens(JSON.stringify(tokens));

  let displayName: string | null = null;
  try {
    const profile = (await (gc as unknown as { getUserProfile: () => Promise<{ displayName?: string }> }).getUserProfile());
    displayName = profile?.displayName ?? null;
  } catch {
    /* profile is best-effort */
  }

  return { status: 'connected', displayName };
}

/**
 * Restore an authenticated client from stored tokens, or null if none.
 */
async function restoreClient() {
  const tokensJson = await getGarminSessionTokens();
  if (!tokensJson) return null;
  try {
    const GarminConnect = await loadLib();
    const gc = new GarminConnect({ username: '', password: '' });
    const tokens = JSON.parse(tokensJson);
    gc.loadToken(tokens.oauth1, tokens.oauth2);
    return gc;
  } catch {
    return null;
  }
}

/**
 * Fetch one day's wellness data, reduced to a normalized snapshot.
 * Each sub-fetch is independent and failure-tolerant - a device that
 * doesn't record HRV simply yields hrvMs=null rather than failing the day.
 */
export async function fetchDailySnapshot(dateIso: string): Promise<GarminDailySnapshot | null> {
  const gc = await restoreClient();
  if (!gc) return null;

  const date = new Date(dateIso + 'T12:00:00');
  const raw: Record<string, unknown> = {};

  let sleepDurationS: number | null = null;
  let sleepScore: number | null = null;
  let rhrBpm: number | null = null;
  let stressScore: number | null = null;
  let bodyBattery: number | null = null;
  let hrvMs: number | null = null;
  let vo2maxDevice: number | null = null;
  let weightKg: number | null = null;

  const anyGc = gc as unknown as {
    getSleepData: (d: Date) => Promise<unknown>;
    getDailyWeightData: (d: Date) => Promise<unknown>;
    client: { get: <T>(url: string) => Promise<T> };
  };

  try {
    const sleep = await anyGc.getSleepData(date);
    raw.sleep = sleep;
    ({ sleepDurationS, sleepScore } = extractSleep(sleep));
  } catch { /* tolerate */ }

  try {
    const weight = await anyGc.getDailyWeightData(date);
    raw.weight = weight;
    ({ weightKg } = extractWeight(weight));
  } catch { /* tolerate */ }

  // Endpoints not wrapped by the library - hit directly via authed client.
  try {
    const summary = await anyGc.client.get(
      `/usersummary-service/usersummary/daily?calendarDate=${dateIso}`
    );
    raw.summary = summary;
    ({ rhrBpm, stressScore, bodyBattery } = extractDailySummary(summary));
  } catch { /* tolerate */ }

  try {
    const hrv = await anyGc.client.get(`/hrv-service/hrv/${dateIso}`);
    raw.hrv = hrv;
    ({ hrvMs } = extractHrv(hrv));
  } catch { /* tolerate */ }

  try {
    const maxmet = await anyGc.client.get(
      `/metrics-service/metrics/maxmet/daily/${dateIso}/${dateIso}`
    );
    raw.maxmet = maxmet;
    ({ vo2maxDevice } = extractVo2max(maxmet));
  } catch { /* tolerate */ }

  return {
    date: dateIso,
    rhrBpm,
    hrvMs,
    sleepDurationS,
    sleepScore,
    stressScore,
    bodyBattery,
    vo2maxDevice,
    weightKg,
    raw,
  };
}

export function hasStoredGarminSession(): Promise<boolean> {
  return getGarminSessionTokens().then((t) => t !== null);
}
