import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './authed-fetch';

// Reads cut off by Cloudflare (a fresh server instance over its CPU limit) are tried again; writes never.
const cut = () => new Response('Worker exceeded CPU time limit.', { status: 503, headers: { 'content-type': 'text/plain' } });
const ok = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('fetchWithRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const run = async (answers: (() => Response | Promise<never>)[], init: RequestInit = {}) => {
    const fetch = vi.fn(async () => answers.shift()!());
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { onLine: true }); // Node has a navigator without onLine
    const p = fetchWithRetry('/api/core/users/me', init);
    await vi.runAllTimersAsync();
    return { res: await p, calls: fetch.mock.calls.length };
  };

  it('answers at once when the server does', async () => {
    const { res, calls } = await run([ok]);
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('tries a cut-off read twice more, then gives up with the last answer', async () => {
    let r = await run([cut, cut, ok]);
    expect([r.res.status, r.calls]).toEqual([200, 3]);
    r = await run([cut, () => Promise.reject(new TypeError('Failed to fetch')), cut]);
    expect([r.res.status, r.calls]).toEqual([503, 3]);
  });

  it('never repeats a write, and keeps the app’s own errors (JSON) as they are', async () => {
    let r = await run([cut], { method: 'POST' });
    expect([r.res.status, r.calls]).toEqual([503, 1]);
    r = await run([() => new Response('{"error":"Nope"}', { status: 500, headers: { 'content-type': 'application/json' } })]);
    expect([r.res.status, r.calls]).toEqual([500, 1]);
  });
});
