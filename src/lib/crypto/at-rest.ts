/**
 * at-rest.ts — WebCrypto AES-256-GCM encryption for sensitive settings.
 *
 * The encryption key is non-extractable and stored in IndexedDB (separate from
 * the OPFS SQLite file). At-rest exposure of the SQLite file does not reveal
 * bearer credentials because the ciphertext is useless without the IDB key.
 */

// IndexedDB key store — separate from OPFS SQLite
const IDB_NAME  = 'ghost-keystore';
const IDB_STORE = 'keys';
const KEY_ID    = 'at-rest-v1';

/**
 * Settings keys whose values are encrypted at rest.
 * Uses the actual key names stored in the `settings` table.
 */
export const SENSITIVE_SETTINGS = new Set([
  'strava_access_token',
  'strava_refresh_token',
  'strava.client_secret',
  'ai.anthropic_key',
]);

interface EncryptedEnvelope {
  v: 1;
  iv: string;   // base64
  ct: string;   // base64
}

export function isEncryptedEnvelope(value: string): boolean {
  try {
    const p = JSON.parse(value) as Partial<EncryptedEnvelope>;
    return p.v === 1 && typeof p.iv === 'string' && typeof p.ct === 'string';
  } catch { return false; }
}

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function getOrCreateAtRestKey(): Promise<CryptoKey> {
  const db    = await openKeyStore();
  const store = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE);
  const existing: CryptoKey | undefined = await new Promise((resolve, reject) => {
    const r = store.get(KEY_ID);
    r.onsuccess = () => resolve(r.result as CryptoKey | undefined);
    r.onerror   = () => reject(r.error);
  });

  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,           // non-extractable — can't be exported or serialised
    ['encrypt', 'decrypt'],
  );

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const r  = tx.objectStore(IDB_STORE).put(key, KEY_ID);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });

  return key;
}

export async function encryptValue(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const toB64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf.buffer : buf)));
  const envelope: EncryptedEnvelope = { v: 1, iv: toB64(iv), ct: toB64(ct) };
  return JSON.stringify(envelope);
}

export async function decryptValue(key: CryptoKey, envelope: string): Promise<string> {
  const { iv: ivB64, ct: ctB64 } = JSON.parse(envelope) as EncryptedEnvelope;
  const fromB64 = (b64: string) =>
    Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) },
    key,
    fromB64(ctB64),
  );
  return new TextDecoder().decode(plain);
}

/**
 * Factory reset support: destroy the at-rest key so the next
 * getOrCreateAtRestKey() call generates a brand-new one. Deletes the key
 * entry directly (guaranteed even while other connections are open — a
 * bare indexedDB.deleteDatabase() can sit blocked forever because
 * openKeyStore() connections are never closed), then best-effort deletes
 * the whole keystore database.
 */
export async function resetAtRestKey(): Promise<void> {
  const db = await openKeyStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const r  = tx.objectStore(IDB_STORE).delete(KEY_ID);
    r.onsuccess = () => resolve();
    r.onerror   = () => reject(r.error);
  });
  db.close();
  // Best-effort full teardown; 'blocked' is fine — the key entry is gone.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
    req.onblocked = () => resolve();
  });
}
