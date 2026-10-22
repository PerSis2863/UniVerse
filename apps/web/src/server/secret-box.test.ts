import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSeal, isSealed, open, seal } from './secret-box';

vi.mock('@/lib/db', () => ({ default: {} }));

const SECRET = 'a-test-session-secret-of-at-least-32-chars';

describe('secret box: school payment keys encrypted at rest', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('encrypts and decrypts, with a fresh IV each time', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    const a = await seal('rzp_live_secret', 'org1:razorpayKeySecret'), b = await seal('rzp_live_secret', 'org1:razorpayKeySecret');
    expect(isSealed(a)).toBe(true);
    expect(a).not.toContain('rzp_live_secret');
    expect(a).not.toBe(b);
    expect(await open(a, 'org1:razorpayKeySecret')).toBe('rzp_live_secret');
    // Copied to another school (or field), it doesn't open.
    expect(await open(a, 'org2:razorpayKeySecret')).toBeNull();
    expect(await open(a, 'org1:stripeSecretKey')).toBeNull();
  });

  it('reads an older plain value as it is, and nothing as null', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    expect(await open('sk_live_plain', 'c')).toBe('sk_live_plain');
    expect(await open(null, 'c')).toBeNull();
    expect(await open('', 'c')).toBeNull();
  });

  it('a changed SESSION_SECRET or a tampered value reads as missing, not as garbage', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    const s = await seal('sk_live_x', 'c');
    expect(await open(s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA'), 'c')).toBeNull();
    vi.stubEnv('SESSION_SECRET', SECRET + '-rotated');
    expect(await open(s, 'c')).toBeNull();
  });

  it('refuses to store a secret without SESSION_SECRET (never plain)', async () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(canSeal()).toBe(false);
    await expect(seal('x', 'c')).rejects.toThrow('SESSION_SECRET');
  });
});
