import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { available, finishConnection, listConnections, startConnection } from './connections';

// M182: a connection is finished only by the browser that started it, with a state sealed here, in time.
vi.mock('@/lib/db', () => ({ default: { oAuthConnection: { findMany: vi.fn(async () => []), upsert: vi.fn() } } }));
const db = prisma as unknown as { oAuthConnection: { upsert: ReturnType<typeof vi.fn> } };
const teacher = { id: 't1', name: 'T', email: 't@x', role: 'TEACHER' };
const student = { ...teacher, id: 's1', role: 'STUDENT' };
const ORIGIN = 'https://universe.example';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'x'.repeat(40));
  vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
  vi.stubEnv('MICROSOFT_CLIENT_ID', '');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ access_token: 'PLAIN-ACCESS-TOKEN', refresh_token: 'PLAIN-REFRESH', expires_in: 3600 }), { status: 200 })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('connections', () => {
  it('is off until the owner sets the service’s keys', () => {
    expect(available('gmail')).toBe(true);
    expect(available('outlook')).toBe(false);
  });
  it('offers Google Classroom to teachers only', async () => {
    expect((await listConnections(student)).services.map((s) => s.id)).not.toContain('classroom');
    expect((await listConnections(teacher)).services.map((s) => s.id)).toContain('classroom');
  });
  it('asks Google with PKCE and a sealed state, and keeps the tokens sealed', async () => {
    const { url, nonce } = await startConnection(teacher, 'gmail', ORIGIN, '/teacher/inbox?space=connections');
    const q = new URL(url).searchParams;
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('redirect_uri')).toBe(`${ORIGIN}/api/connections/callback`);
    expect(q.get('state')).toMatch(/^enc:v1:/);
    const to = await finishConnection(new URLSearchParams({ code: 'c', state: q.get('state')! }), nonce, ORIGIN);
    expect(to).toBe('/teacher/inbox?space=connections&connected=gmail');
    const saved = db.oAuthConnection.upsert.mock.calls[0][0];
    expect(saved.where.userId_service).toEqual({ userId: 't1', service: 'gmail' });
    expect(saved.create.access).toMatch(/^enc:v1:/);
    expect(saved.create.access).not.toContain('PLAIN-ACCESS-TOKEN');
    expect(saved.create.refresh).not.toContain('PLAIN-REFRESH');
  });
  it('refuses another browser, a forged state and an outside return address', async () => {
    const { url } = await startConnection(teacher, 'gmail', ORIGIN, 'https://evil.example');
    const state = new URL(url).searchParams.get('state')!;
    await expect(finishConnection(new URLSearchParams({ code: 'c', state }), 'someone-else', ORIGIN)).rejects.toThrow();
    const forged = JSON.stringify({ u: 'victim', s: 'gmail', n: 'n', v: 'v', t: Date.now(), b: null });
    await expect(finishConnection(new URLSearchParams({ code: 'c', state: forged }), 'n', ORIGIN)).rejects.toThrow();
    expect(db.oAuthConnection.upsert).not.toHaveBeenCalled();
  });
});
