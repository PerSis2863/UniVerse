'use client';

import { useEffect } from 'react';
import { installErrorMonitor } from '@/lib/error-monitor';
import { installRequestGuard } from '@/lib/request-guard';
import { startVitals } from '@/lib/web-vitals';

export default function ErrorMonitorBootstrap() {
  useEffect(() => {
    // Page speed for real people, from 10% of page loads (src/lib/web-vitals.ts).
    startVitals();
    installErrorMonitor();
    installRequestGuard();
  }, []);

  return null;
}
