import { describe, it, expect } from 'vitest';
import { encryptValue, decryptValue, isEncryptedEnvelope, SENSITIVE_SETTINGS } from './at-rest';

describe('at-rest crypto', () => {
  async function testKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  it('round-trips a plaintext value', async () => {
    const key = await testKey();
    const enc = await encryptValue(key, 'secret-token');
    const dec = await decryptValue(key, enc);
    expect(dec).toBe('secret-token');
  });

  it('produces a valid envelope', async () => {
    const key = await testKey();
    const enc = await encryptValue(key, 'x');
    expect(isEncryptedEnvelope(enc)).toBe(true);
    const parsed = JSON.parse(enc);
    expect(parsed.v).toBe(1);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ct).toBe('string');
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await testKey();
    const a = await encryptValue(key, 'same');
    const b = await encryptValue(key, 'same');
    expect(a).not.toBe(b);
  });

  it('rejects decryption with a different key', async () => {
    const key1 = await testKey();
    const key2 = await testKey();
    const enc  = await encryptValue(key1, 'secret');
    await expect(decryptValue(key2, enc)).rejects.toThrow();
  });

  it('isEncryptedEnvelope rejects plaintext', () => {
    expect(isEncryptedEnvelope('plaintext-token')).toBe(false);
    expect(isEncryptedEnvelope('')).toBe(false);
    expect(isEncryptedEnvelope('{}')).toBe(false);
  });

  it('SENSITIVE_SETTINGS covers all token keys', () => {
    expect(SENSITIVE_SETTINGS.has('strava_access_token')).toBe(true);
    expect(SENSITIVE_SETTINGS.has('strava_refresh_token')).toBe(true);
    expect(SENSITIVE_SETTINGS.has('strava.client_secret')).toBe(true);
    expect(SENSITIVE_SETTINGS.has('ai.anthropic_key')).toBe(true);
    expect(SENSITIVE_SETTINGS.has('wizard_complete')).toBe(false);
  });
});
