'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { installErrorMonitor } from '@/lib/error-monitor';
import { installRequestGuard } from '@/lib/request-guard';
import { recordVital } from '@/lib/web-vitals';

export default function ErrorMonitorBootstrap() {
  // Page speed for real people, from 10% of page loads (src/lib/web-vitals.ts).
  useReportWebVitals(recordVital);
  useEffect(() => {
    installErrorMonitor();
    installRequestGuard();
  }, []);

  return null;
}
