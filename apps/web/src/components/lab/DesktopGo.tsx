'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Go = { onGo?: (cb: (path: string) => void) => () => void };

/**
 * Hyperion's computer app: its File menu (Code, Simulate, Learn) moves within the page, as a link does, instead of
 * loading the whole site again. The app's preload loads the page itself when nothing listens (an older site).
 */
export function DesktopGo() {
  const router = useRouter();
  useEffect(() => (window as Window & { hyperionDesktop?: Go }).hyperionDesktop?.onGo?.((path) => {
    if (path.startsWith('/hyperion')) router.push(path);
  }), [router]);
  return null;
}
