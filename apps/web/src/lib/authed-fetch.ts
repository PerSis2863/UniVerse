import { getAuthToken, twoStepPass } from './auth-token';
import { isSampleMode } from './sample-mode';
import { fromBootstrap, inBootstrap } from './bootstrap';

/** fetch() against this app's own /api routes with the signed-in user's bearer token attached. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (isSampleMode()) {
    const { resolveSample } = await import('./sample/router');
    const hit = resolveSample(init.method ?? 'GET', input, init.body);
    if (hit) return new Response(JSON.stringify(hit.data), { status: hit.status, headers: { 'Content-Type': 'application/json' } });
  }
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const pass = twoStepPass();
  if (pass) headers.set('X-UV-Pass', pass);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetchWithRetry(input, { ...init, headers });
}

/**
 * fetch() that tries a read (GET / HEAD) again when Cloudflare cut it off rather than the app
 * answering: on the free plan a fresh server instance can go over its CPU limit while starting up,
 * and every request on it fails ("exceeded resources", a non-JSON 5xx or a dropped connection).
 * A try a moment later usually lands on a warm instance; when several instances are starting at
 * once (the live logs showed a retry after 1 s failing too), a last try waits 2–3 s more. Writes
 * are never repeated.
 */
const RETRY_WAITS: [number, number][] = [[700, 1300], [2000, 3000]];
export async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init);
  const cutOff = (r: Response) => r.status >= 500 && !(r.headers.get('content-type') ?? '').includes('json') && !r.headers.get('x-universe-paused');
  for (const [min, max] of RETRY_WAITS) {
    try {
      const res = await fetch(input, init);
      if (!cutOff(res)) return res;
    } catch (e) {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || (e as Error).name === 'AbortError') throw e;
    }
    await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
  }
  return fetch(input, init);
}

export async function authedJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  // Answered by the startup bundle already (see lib/bootstrap.ts)?
  if ((!init?.method || init.method === 'GET') && inBootstrap(input)) {
    const hit = await fromBootstrap<T>(input);
    if (hit !== undefined) return hit;
  }
  const res = await authedFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status, body });
  return body as T;
}
