'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A slim bar at the top of the screen while a page is opening, so every tap on a link gets
 * instant feedback (pages open without prefetching, to keep requests low). Starts on a click on
 * an internal link, finishes when the new page is shown.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search) || url.pathname.startsWith('/api/')) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('loading'), 80); // quick pages don't flash the bar
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // The new page is shown: finish the bar.
  const route = `${pathname}?${search}`;
  const [shown, setShown] = useState(route);
  if (shown !== route) {
    setShown(route);
    if (state === 'loading') setState('done');
  }
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, [route]);
  useEffect(() => {
    if (state === 'loading') { const t = setTimeout(() => setState('done'), 10_000); return () => clearTimeout(t); } // never stuck
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 350);
    return () => clearTimeout(t);
  }, [state]);

  if (state === 'idle') return null;
  return (
    <div aria-hidden className="fixed top-0 inset-x-0 z-[200] h-[2px] pointer-events-none">
      <div className={state === 'loading' ? 'nav-progress-run h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500' : 'nav-progress-done h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500'} />
    </div>
  );
}
