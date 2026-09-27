import { getAuthToken } from './auth-token';

/** fetch() against this app's own /api routes with the signed-in user's bearer token attached. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}

export async function authedJson<T = any>(input: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status, body });
  return body as T;
}
