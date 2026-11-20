import { describe, expect, it, vi } from 'vitest';

// M302: "Download my data" reaches the tables that name their person by a plain column too.
const findMany = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/db', () => ({ default: new Proxy({}, { get: (_t, k) => (k === 'user' ? { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) } : { findMany }) }) }));
import { exportUserData } from './export';

describe('download my data', () => {
  it('asks every table that holds the person’s rows, not others’ reports about them', async () => {
    await exportUserData('u1');
    const wheres = findMany.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres).toContain('{"userId":"u1"}');
    expect(wheres).toContain('{"studentId":"u1"}');
    expect(findMany.mock.calls.length).toBeGreaterThan(200);
    expect(findMany.mock.calls.some((c) => 'totpSecret' in c[0].select)).toBe(false);
    // M337: connected accounts' keys never leave the server.
    expect(findMany.mock.calls.some((c) => 'access' in c[0].select && 'service' in c[0].select)).toBe(false);
    expect(wheres.filter((w) => w === '{"senderId":"u1"}').length).toBeGreaterThan(0); // chat messages they sent
  });
});
