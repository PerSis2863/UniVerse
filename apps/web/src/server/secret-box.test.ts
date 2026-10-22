import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSeal, isSealed, open, seal } from './secret-box';

vi.mock('@/lib/db', () => ({ default: {} }));

const SECRET = 'a-test-session-secret-of-at-least-32-chars';

describe('secret box: school payment keys encrypted at rest', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('encrypts and decrypts, with a fresh IV each time', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    const a = await seal('rzp_live_secret'), b = await seal('rzp_live_secret');
    expect(isSealed(a)).toBe(true);
    expect(a).not.toContain('rzp_live_secret');
    expect(a).not.toBe(b);
    expect(await open(a)).toBe('rzp_live_secret');
  });

  it('reads an older plain value as it is, and nothing as null', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    expect(await open('sk_live_plain')).toBe('sk_live_plain');
    expect(await open(null)).toBeNull();
    expect(await open('')).toBeNull();
  });

  it('a changed SESSION_SECRET or a tampered value reads as missing, not as garbage', async () => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    const s = await seal('sk_live_x');
    expect(await open(s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA'))).toBeNull();
    vi.stubEnv('SESSION_SECRET', SECRET + '-rotated');
    expect(await open(s)).toBeNull();
  });

  it('refuses to store a secret without SESSION_SECRET (never plain)', async () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(canSeal()).toBe(false);
    await expect(seal('x')).rejects.toThrow('SESSION_SECRET');
  });
});
