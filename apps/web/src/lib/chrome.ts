'use client';

import { useEffect, useSyncExternalStore } from 'react';

// iOS navigation chrome. The scroll position only toggles two attributes on <html>, and CSS does the
// rest, so scrolling never re-renders React. (Pages no longer show their titles, M210: the bar's inline
// title that took over from the large one went with them.)

/**
 * <html data-scrolled>: content has scrolled under the bars (they turn frosted).
 * `resetKey` (e.g. the pathname) re-reads the position after a navigation.
 */
export function useScrollEdges(resetKey: string) {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      root.toggleAttribute('data-scrolled', y > 2);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      root.removeAttribute('data-scrolled');
    };
  }, [resetKey]);
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
