'use client';

import { useEffect } from 'react';

// M521: Hyperion's pages are cross-origin isolated (security-headers.ts, isolationHeaders), which a browser decides
// only when it loads a page. Entered from the rest of the site by an in-app link, the page reloads once to get it;
// left the same way, it reloads so the other pages run without it (their popups and framed pages need that). A browser
// that can't isolate (Safari) is tried once a tab, then left as it is: Hyperion runs, its waits as before M521.
const KEY = 'uv-isolation';
const read = () => { try { return sessionStorage.getItem(KEY); } catch { return 'failed'; } };
const write = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode: no retry is kept */ } };

export function Isolated() {
  useEffect(() => {
    if (typeof SharedArrayBuffer === 'undefined' && self.crossOriginIsolated === undefined) return;
    if (self.crossOriginIsolated) write('ok');
    else if (read() === 'trying') write('failed');
    else if (read() !== 'failed') { write('trying'); location.reload(); }
    return () => {
      // The layout leaves only when the person goes to a page outside Hyperion.
      setTimeout(() => { if (self.crossOriginIsolated && !location.pathname.startsWith('/hyperion')) location.reload(); }, 0);
    };
  }, []);
  return null;
}
