import { useEffect } from 'react';

/** Pre-fills a page's search box from ?q= in the URL (used by links from the ⌘K palette). */
export function useInitialSearch(setSearch: (value: string) => void) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearch(q);
  }, [setSearch]);
}
