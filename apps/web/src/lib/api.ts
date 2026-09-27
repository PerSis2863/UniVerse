import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken } from './auth-token';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://universe-xsku.onrender.com/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach a fresh token to every request.
api.interceptors.request.use(async (config) => {
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
