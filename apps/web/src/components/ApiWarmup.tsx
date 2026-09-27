'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';

/**
 * The API runs on a host that sleeps when idle. Ping its health check once per page load,
 * in the background, so it is already awake by the time the visitor signs in.
 */
export function ApiWarmup() {
  useEffect(() => {
    const ping = () => {
      fetch(`${API_URL}/health`, { cache: 'no-store', keepalive: true }).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(ping, { timeout: 3000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(ping, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
