'use client';

import { useEffect, useSyncExternalStore } from 'react';

// iOS navigation chrome. The phone's navigation bar shows the current page's title once the page's
// large title has scrolled away underneath it: Topbar announces the title here and the shell
// reads it. The scroll position only toggles two attributes on <html>, and CSS does the rest, so
// scrolling never re-renders React.

let title = '';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setPageTitle(next: string) {
  if (next === title) return;
  title = next;
  listeners.forEach((l) => l());
}

export function usePageTitle() {
  return useSyncExternalStore(subscribe, () => title, () => '');
}

/**
 * <html data-scrolled>: content has scrolled under the bars (they turn frosted).
 * <html data-collapsed>: the large title has gone under the bar (the bar shows the title).
 * `resetKey` (e.g. the pathname) re-reads the position after a navigation.
 */
export function useScrollEdges(resetKey: string, collapseAt = 52) {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      root.toggleAttribute('data-scrolled', y > 2);
      root.toggleAttribute('data-collapsed', y > collapseAt);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      root.removeAttribute('data-scrolled');
      root.removeAttribute('data-collapsed');
    };
  }, [resetKey, collapseAt]);
}

// A page that belongs to a tab bar section (it shows SectionTabs with one of the tab bar's pages,
// e.g. Timetable next to Overview) is a top-level screen too: no back button there.
let sectionRoot: string | null = null;
const rootListeners = new Set<() => void>();
const subscribeRoot = (l: () => void) => { rootListeners.add(l); return () => { rootListeners.delete(l); }; };

export function setSectionRoot(path: string | null) {
  if (path === sectionRoot) return;
  sectionRoot = path;
  rootListeners.forEach((l) => l());
}

export function useSectionRoot() {
  return useSyncExternalStore(subscribeRoot, () => sectionRoot, () => null);
}
