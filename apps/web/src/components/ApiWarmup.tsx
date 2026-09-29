'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';

/**
 * On the sign-in pages: wakes the API (Worker, database client, Google sign-in keys) while the
 * visitor is still typing, so signing in doesn't pay for a cold start.
 */
export function ApiWarmup() {
  useEffect(() => {
    fetch(`${API_URL}/health`, { cache: 'no-store' }).catch(() => {});
  }, []);
  return null;
}
