/**
 * Factory reset — force a full re-login and regeneration of keys, auth,
 * and data. Ordered so nothing holds a lock on what comes next:
 *
 *   1. Best-effort revoke the Strava token (before we destroy the local
 *      copy of it — after this the old grant is dead server-side too).
 *   2. Terminate the SQLite worker (releases OPFS sync access handles).
 *   3. Delete the OPFS database directory — activities, settings,
 *      encrypted secrets, everything.
 *   4. Destroy the at-rest AES key (regenerated fresh on next use).
 *   5. Clear all ghost.* localStorage flags + sessionStorage.
 *   6. Hard-navigate to /setup — fresh worker, fresh DB via migrations,
 *      fresh key on demand, not connected → user re-authorises Strava.
 *
 * Every step is fail-open: a failure in one never blocks the rest — the
 * reset must always end in a usable, disconnected app.
 */
import { resetDbStorage, terminateWorker } from '@/db/client';
import { getStoredTokens } from '@/lib/db/settings';
import { revokeToken } from '@/lib/strava/client';
import { resetAtRestKey } from '@/lib/crypto/at-rest';

const WORKER_URL = (import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined) ?? '';
const OPFS_DB_DIR = 'ghost-db'; // must match AccessHandlePoolVFS dir in src/db/worker.ts

export async function factoryReset(): Promise<void> {
  // 1. Revoke Strava access while we can still read the token.
  try {
    const tokens = await getStoredTokens();
    if (tokens) await revokeToken(tokens.accessToken, WORKER_URL);
  } catch { /* fail-open */ }

  // 2+3. Ask the worker to close the DB, release its OPFS handles, and
  // delete the database directory (the worker is the one context guaranteed
  // to have OPFS when the app persists at all), then kill the worker.
  try { await resetDbStorage(); } catch { /* fail-open — MemoryVFS sessions have no OPFS dir */ }
  try { terminateWorker(); } catch { /* fail-open */ }

  // Belt-and-braces: main-thread delete too, where the API exists.
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_DB_DIR, { recursive: true });
  } catch { /* fail-open */ }

  // 4. Regenerate encryption keys on next use.
  try { await resetAtRestKey(); } catch { /* fail-open */ }

  // 5. Clear app flags (onboarded, home page, display prefs, latches).
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ghost.')) localStorage.removeItem(key);
    }
    sessionStorage.clear();
  } catch { /* fail-open */ }

  // 6. Fresh start.
  window.location.href = '/setup';
}
