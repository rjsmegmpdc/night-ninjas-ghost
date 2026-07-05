import { describe, it, expect } from 'vitest';
import {
  encryptProfile,
  decryptProfile,
  KDF_ITERATIONS,
  type ProfileBlob,
} from './sync-crypto-pure';

const SAMPLE: ProfileBlob = {
  v: 1,
  clientId: '123456',
  clientSecret: 'a'.repeat(40),
  prefs: { homePage: '/calendar', fontScale: '1.15', colorPreset: 'storm' },
  gearProfile: JSON.stringify({ clothing: { size: 'XL', brand: 'Arc’teryx' } }),
};

describe('sync-crypto-pure', () => {
  it('round-trips a profile blob', async () => {
    const envelope = await encryptProfile(SAMPLE, 'correct horse battery');
    const decrypted = await decryptProfile(envelope, 'correct horse battery');
    expect(decrypted).toEqual(SAMPLE);
  });

  it('produces a well-formed envelope with no plaintext leakage', async () => {
    const envelope = await encryptProfile(SAMPLE, 'correct horse battery');
    expect(envelope.v).toBe(2);
    expect(envelope.kdf).toBe('pbkdf2-sha256');
    expect(envelope.iter).toBe(KDF_ITERATIONS);
    const serialised = JSON.stringify(envelope);
    expect(serialised).not.toContain('123456');
    expect(serialised).not.toContain('a'.repeat(40));
    expect(serialised).not.toContain('calendar');
  });

  it('rejects a wrong passphrase', async () => {
    const envelope = await encryptProfile(SAMPLE, 'correct horse battery');
    await expect(decryptProfile(envelope, 'wrong passphrase')).rejects.toThrow(/wrong passphrase/i);
  });

  it('rejects tampered ciphertext', async () => {
    const envelope = await encryptProfile(SAMPLE, 'correct horse battery');
    // Flip one character of the ciphertext body
    const ct = envelope.ct;
    const flipped = (ct[10] === 'A' ? 'B' : 'A');
    const tampered = { ...envelope, ct: ct.slice(0, 10) + flipped + ct.slice(11) };
    await expect(decryptProfile(tampered, 'correct horse battery')).rejects.toThrow();
  });

  it('uses a fresh salt and iv per encryption', async () => {
    const a = await encryptProfile(SAMPLE, 'correct horse battery');
    const b = await encryptProfile(SAMPLE, 'correct horse battery');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});
