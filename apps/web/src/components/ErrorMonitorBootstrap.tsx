'use client';

import { useEffect } from 'react';
import { installErrorMonitor } from '@/lib/error-monitor';

export default function ErrorMonitorBootstrap() {
  useEffect(() => {
    installErrorMonitor();
  }, []);

  return null;
}
