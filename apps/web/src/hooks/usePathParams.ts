'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { matchPath } from '@/lib/path-params';

const noop = () => () => {};

/**
 * The page's [params] from the address (src/lib/path-params.ts). Null while the page is being built
 * or hydrated (it was built with a placeholder, so anything that depends on the values waits until
 * the browser has the real address), then the values.
 */
export function usePathParams(pattern: string): Record<string, string> | null {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const pathname = usePathname();
  return useMemo(() => (mounted ? matchPath(pattern, pathname) : null), [mounted, pattern, pathname]);
}
