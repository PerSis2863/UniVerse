'use client';

import { useEffect } from 'react';
import { startRealtime } from '@/lib/realtime-client';

/** Keeps the live-updates connection open while the dashboard is shown. */
export function RealtimeSync() {
  useEffect(() => startRealtime(), []);
  return null;
}
