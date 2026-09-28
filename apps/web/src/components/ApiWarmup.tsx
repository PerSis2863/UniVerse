'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';

/**
 * On the sign-in pages: wakes the API (Worker, database client, Google sign-in keys) and preloads
 * the dashboards while the visitor is still typing, so signing in doesn't pay for a cold start.
 */
export function ApiWarmup() {
  const router = useRouter();
  useEffect(() => {
    fetch(`${API_URL}/health`, { cache: 'no-store' }).catch(() => {});
    for (const path of ['/student', '/teacher', '/admin']) router.prefetch(path);
  }, [router]);
  return null;
}
