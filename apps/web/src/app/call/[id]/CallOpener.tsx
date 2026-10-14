'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCalls } from '@/store/calls';

/**
 * Opens the call named in the address (/call/<id>?kind=audio|video) full screen. The id comes from the
 * address, not the route's params: every call is served the same page built ahead of time
 * (/call/open, see cloudflare/worker.ts).
 */
export function CallOpener() {
  const id = decodeURIComponent(usePathname().split('/')[2] ?? '');
  const kind = useSearchParams().get('kind');
  useEffect(() => {
    if (!id || id === 'open') return;
    useCalls.getState().open(id, kind === 'audio' ? 'audio' : kind === 'video' ? 'video' : undefined);
  }, [id, kind]);
  return null;
}
