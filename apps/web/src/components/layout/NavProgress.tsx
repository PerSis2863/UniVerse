'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { setPendingNav } from '@/lib/nav-pending';
import { motionFor, startPageTransition } from '@/lib/page-transition';

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
      // Another page: menus switch to it now and the content area shows it loading (see nav-pending),
      // and the page moves like iOS: menus crossfade, deeper pages push in, going up pops back.
      if (url.pathname !== location.pathname) {
        startPageTransition(motionFor(location.pathname, url.pathname, a.dataset.vt));
        setPendingNav(url.pathname);
      }
    };
    // Back/forward (and anything else that changes the address without a tap) cancels it; going
    // back slides the page in from the left, like iOS.
    // Back/forward: the page moves like iOS (back slides in from the left, forward from the right).
    // Where the browser has the Navigation API, its "traverse" event comes before the router
    // replaces the page (the old page is still on screen to animate from); popstate is the fallback.
    // A traversal that only changes the query (closing a chat) keeps the same page: no transition.
    const onScreen = () => document.querySelector('[data-page-path]')?.getAttribute('data-page-path');
    type Nav = EventTarget & { currentEntry?: { index: number } };
    type NavigateEvent = Event & { navigationType: string; destination: { url: string; index: number } };
    const nav = (window as Window & { navigation?: Nav }).navigation;
    const onNavigate = (e: Event) => {
      const n = e as NavigateEvent;
      if (n.navigationType !== 'traverse') return;
      setPendingNav(null);
      const to = new URL(n.destination.url).pathname;
      const here = onScreen();
      if (here && here !== to) startPageTransition(n.destination.index < (nav?.currentEntry?.index ?? 0) ? 'pop' : 'push');
    };
    const onPop = () => {
      setPendingNav(null);
      const here = onScreen();
      if (!nav && here && here !== location.pathname) startPageTransition('pop');
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop, true);
    nav?.addEventListener('navigate', onNavigate);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop, true);
      nav?.removeEventListener('navigate', onNavigate);
    };
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
    setPendingNav(null);
  }, [route]);
  useEffect(() => {
    if (state === 'loading') { const t = setTimeout(() => { setState('done'); setPendingNav(null); }, 10_000); return () => clearTimeout(t); } // never stuck
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 350);
    return () => clearTimeout(t);
  }, [state]);

  if (state === 'idle') return null;
  return (
    <div aria-hidden className="fixed top-0 inset-x-0 z-[200] h-[2px] pointer-events-none">
      <div className={state === 'loading' ? 'nav-progress-run h-full bg-tint' : 'nav-progress-done h-full bg-tint'} />
    </div>
  );
}
