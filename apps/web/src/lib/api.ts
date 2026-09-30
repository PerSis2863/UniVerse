import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken } from './auth-token';
import { isSampleMode } from './sample-mode';
import { fromBootstrap, inBootstrap } from './bootstrap';

/** The platform API, served by this app on Cloudflare (src/app/api/core, src/server). */
export const API_URL = '/api/core';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach a fresh token to every request.
api.interceptors.request.use(async (config) => {
  // Sample mode: answer from example data instead of the server (loaded only when needed).
  if (isSampleMode()) {
    const { resolveSample } = await import('./sample/router');
    const hit = resolveSample(config.method ?? 'get', config.url ?? '', config.data);
    if (hit) {
      config.adapter = async () => {
        if (hit.status >= 400) {
          throw new AxiosError(hit.data?.message ?? 'Request failed', String(hit.status), config, null, { data: hit.data, status: hit.status, statusText: 'Error', headers: {}, config } as any);
        }
        return { data: hit.data, status: hit.status, statusText: 'OK', headers: {}, config, request: null };
      };
      return config;
    }
  }
  // Answered by the startup bundle already (see lib/bootstrap.ts)?
  const key = `${API_URL}${config.url ?? ''}`;
  if ((config.method ?? 'get').toLowerCase() === 'get' && !config.params && inBootstrap(key)) {
    const hit = await fromBootstrap(key);
    if (hit !== undefined) {
      config.adapter = async () => ({ data: hit, status: 200, statusText: 'OK', headers: {}, config, request: null });
      return config;
    }
  }
  const token = await getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the API says the token is invalid/expired, force-refresh it once and retry.
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const fresh = await getAuthToken(true);
      if (fresh && !fresh.startsWith('mock-token-')) {
        original.headers.Authorization = `Bearer ${fresh}`;
        return api(original);
      }
      // A leftover demo session that the server no longer accepts (demo login is off on the
      // live site): clear it and send the user to sign in instead of showing a broken dashboard.
      if (fresh && fresh.startsWith('mock-token-') && typeof window !== 'undefined') {
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
    return Promise.reject(error);
  }
);
