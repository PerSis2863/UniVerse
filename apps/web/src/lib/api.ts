/* eslint-disable @typescript-eslint/no-explicit-any -- response data is untyped by default, like axios */
import { getAuthToken, twoStepPass } from './auth-token';
import { isSampleMode } from './sample-mode';
import { fromBootstrap, inBootstrap } from './bootstrap';

/** The platform API, served by this app on Cloudflare (src/app/api/core, src/server). */
export const API_URL = '/api/core';

// A small fetch-based client with the same shape as the axios instance it replaces
// (api.get / post / put / patch / delete → { data, status }, errors with .response.{status,data}),
// about 18 kB less JavaScript on every page. It attaches a fresh sign-in token, answers from
// sample data in sample mode and from the startup bundle when it can, and refreshes an expired
// token once before giving up.

export interface ApiResponse<T = any> { data: T; status: number; headers: Headers }
export interface ApiConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  onUploadProgress?: (e: { loaded: number; total?: number }) => void;
}

/** Thrown for non-2xx answers. `response` mirrors axios so existing error handling keeps working. */
export class ApiError extends Error {
  readonly isAxiosError = true;
  constructor(message: string, readonly response: { status: number; data: any }) {
    super(message);
    this.name = 'ApiError';
  }
  get status() { return this.response.status; }
}

const errorFrom = (status: number, data: any) =>
  new ApiError((data && typeof data === 'object' && (data.message || data.error)) || `Request failed with status code ${status}`, { status, data });

function buildUrl(url: string, params?: ApiConfig['params']) {
  const full = /^https?:\/\//.test(url) ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  if (!params) return full;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `${full}${full.includes('?') ? '&' : '?'}${s}` : full;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json().catch(() => null);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Upload with progress events (fetch can't report upload progress). */
function xhrSend(method: string, url: string, headers: Record<string, string>, body: XMLHttpRequestBodyInit, onProgress: NonNullable<ApiConfig['onUploadProgress']>) {
  return new Promise<{ status: number; data: any; headers: Headers }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : undefined });
    xhr.onload = () => {
      let data: any = xhr.responseText;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      resolve({ status: xhr.status, data, headers: new Headers({ 'content-type': xhr.getResponseHeader('content-type') ?? '' }) });
    };
    xhr.onerror = () => reject(new TypeError('Network error'));
    xhr.send(body);
  });
}

async function request<T>(method: string, url: string, body: unknown, config: ApiConfig = {}, retried = false): Promise<ApiResponse<T>> {
  // Sample mode: answer from example data instead of the server (loaded only when needed).
  if (isSampleMode()) {
    const { resolveSample } = await import('./sample/router');
    const hit = resolveSample(method.toLowerCase(), url, body);
    if (hit) {
      if (hit.status >= 400) throw errorFrom(hit.status, hit.data);
      return { data: hit.data as T, status: hit.status, headers: new Headers() };
    }
  }
  // Answered by the startup bundle already (see lib/bootstrap.ts)?
  if (method === 'GET' && !config.params && inBootstrap(`${API_URL}${url}`)) {
    const hit = await fromBootstrap<T>(`${API_URL}${url}`);
    if (hit !== undefined) return { data: hit, status: 200, headers: new Headers() };
  }

  const token = await getAuthToken();
  const headers: Record<string, string> = { ...config.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const pass = twoStepPass();
  if (pass) headers['X-UV-Pass'] = pass;
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    payload = body as BodyInit;
    if (body instanceof FormData) delete headers['Content-Type']; // the browser adds the boundary
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] ??= 'application/json';
  }

  const target = buildUrl(url, config.params);
  let status: number, data: any, resHeaders: Headers;
  if (config.onUploadProgress && payload !== undefined) {
    ({ status, data, headers: resHeaders } = await xhrSend(method, target, headers, payload as XMLHttpRequestBodyInit, config.onUploadProgress));
  } else {
    const res = await fetch(target, { method, headers, body: payload, signal: config.signal });
    ({ status } = res);
    resHeaders = res.headers;
    data = await parse(res);
  }

  // UniVerse is paused or in maintenance (cloudflare/usage-guard.ts): stop asking the server and
  // show the "back soon" page, so open tabs don't keep using Cloudflare.
  if (status === 503 && resHeaders.get('x-universe-paused') && typeof window !== 'undefined') {
    window.location.replace('/');
    return new Promise<never>(() => {});
  }
  // An admin or the owner who hasn't typed the emailed sign-in code yet: finish signing in.
  if (status === 403 && (data as { code?: string } | null)?.code === 'TWO_STEP_REQUIRED' && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?step=code&next=${encodeURIComponent(window.location.pathname)}`;
    return new Promise<never>(() => {});
  }
  if (status === 401 && !retried) {
    const fresh = await getAuthToken(true);
    if (fresh && !fresh.startsWith('mock-token-') && !fresh.startsWith('ut1.')) return request<T>(method, url, body, config, true);
    // A leftover demo / LMS session the server no longer accepts: clear it and send the user to
    // sign in instead of showing a broken dashboard.
    if (fresh && typeof window !== 'undefined') {
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('universe-auth');
      } catch {
        /* storage unavailable */
      }
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
  }
  if (status < 200 || status >= 300) throw errorFrom(status, data);
  return { data: data as T, status, headers: resHeaders };
}

export const api = {
  get: <T = any>(url: string, config?: ApiConfig) => request<T>('GET', url, undefined, config),
  delete: <T = any>(url: string, config?: ApiConfig) => request<T>('DELETE', url, undefined, config),
  post: <T = any>(url: string, data?: unknown, config?: ApiConfig) => request<T>('POST', url, data, config),
  put: <T = any>(url: string, data?: unknown, config?: ApiConfig) => request<T>('PUT', url, data, config),
  patch: <T = any>(url: string, data?: unknown, config?: ApiConfig) => request<T>('PATCH', url, data, config),
};
