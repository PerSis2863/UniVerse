import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }));
const { personalRoomId } = await import('./calls');

// M342: a personal room is the same link every time, different for each person, and unguessable without the secret.
afterEach(() => vi.unstubAllEnvs());
describe('personalRoomId', () => {
  it('is steady per person and needs the secret', () => {
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(40));
    const a = personalRoomId('user-a');
    expect(a).toMatch(/^l_[A-Za-z0-9_-]{20,}$/);
    expect(personalRoomId('user-a')).toBe(a);
    expect(personalRoomId('user-b')).not.toBe(a);
    vi.stubEnv('SESSION_SECRET', 'y'.repeat(40));
    expect(personalRoomId('user-a')).not.toBe(a);
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => personalRoomId('user-a')).toThrow();
  });
});
