'use client';

import { useEffect } from 'react';
import { installErrorMonitor } from '@/lib/error-monitor';
import { installRequestGuard } from '@/lib/request-guard';

export default function ErrorMonitorBootstrap() {
  useEffect(() => {
    installErrorMonitor();
    installRequestGuard();
  }, []);

  return null;
}
