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
 * fetch() that tries a read (GET / HEAD) once more when Cloudflare cut it off rather than the app
 * answering: on the free plan a fresh server instance can go over its CPU limit while starting up,
 * and the requests on it fail ("exceeded resources", a non-JSON 5xx or a dropped connection). The
 * second try a moment later lands on a warm instance. Writes are never repeated.
 */
export async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init);
  const cutOff = (r: Response) => r.status >= 500 && !(r.headers.get('content-type') ?? '').includes('json') && !r.headers.get('x-universe-paused');
  try {
    const first = await fetch(input, init);
    if (!cutOff(first)) return first;
  } catch (e) {
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || (e as Error).name === 'AbortError') throw e;
  }
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
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
