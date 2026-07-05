/**
 * Pure E2E crypto for profile sync — PBKDF2-SHA256 → AES-256-GCM.
 * WebCrypto only (available in browsers and Node 20+), no browser-specific
 * APIs beyond globalThis.crypto — safe for Vitest node env.
 */

/** OWASP-recommended PBKDF2-SHA256 iteration floor (2023+). */
export const KDF_ITERATIONS = 310_000;

export interface ProfileBlob {
  v: 1;
  clientId?: string;
  clientSecret?: string;
  prefs?: {
    homePage?: string;
    fontScale?: string;
    colorPreset?: string;
  };
  gearProfile?: string; // opaque JSON string, as stored in localStorage
}

export interface EncryptedEnvelope {
  v: 2;
  kdf: 'pbkdf2-sha256';
  iter: number;
  salt: string; // base64
  iv: string;   // base64
  ct: string;   // base64 ciphertext (AES-GCM, tag included)
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptProfile(blob: ProfileBlob, passphrase: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(blob)),
  );
  return {
    v: 2,
    kdf: 'pbkdf2-sha256',
    iter: KDF_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

export async function decryptProfile(envelope: EncryptedEnvelope, passphrase: string): Promise<ProfileBlob> {
  const key = await deriveKey(passphrase, b64ToBytes(envelope.salt), envelope.iter);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(envelope.iv) as BufferSource },
      key,
      b64ToBytes(envelope.ct) as BufferSource,
    );
  } catch {
    // AES-GCM authentication failure — almost always a wrong passphrase
    throw new Error('Wrong passphrase — try again');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as ProfileBlob;
}
