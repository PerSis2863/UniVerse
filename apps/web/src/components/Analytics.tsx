'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pageview } from '@/lib/analytics';
import { CHOICE_EVENT } from '@/lib/cookie-consent';

/** M137: one page view per page shown (src/lib/analytics.ts), and the current one once "Accept all" is chosen. */
export function Analytics() {
  const path = usePathname();
  useEffect(() => { pageview(path); }, [path]);
  useEffect(() => {
    const on = () => pageview(location.pathname);
    window.addEventListener(CHOICE_EVENT, on);
    return () => window.removeEventListener(CHOICE_EVENT, on);
  }, []);
  return null;
}
