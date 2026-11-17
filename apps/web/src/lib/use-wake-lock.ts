'use client';

import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };
type WakeLockNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };

/**
 * Keeps the screen awake while `active` (M234: a call on a phone, whose screen dimmed and locked when nobody
 * touched it, stopping the camera and the sound). The browser drops the lock when the tab is hidden, so it is
 * asked for again when the tab comes back. Where the browser can't, the screen sleeps as before.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !(navigator as WakeLockNav).wakeLock) return;
    let lock: Sentinel | null = null, gone = false;
    const take = async () => {
      if (gone || document.visibilityState !== 'visible' || lock) return;
      try {
        const got = await (navigator as WakeLockNav).wakeLock!.request('screen');
        if (gone) void got.release().catch(() => {}); else { lock = got; (got as Sentinel & EventTarget).addEventListener?.('release', () => { lock = null; }); }
      } catch { /* not allowed now (battery saver): the screen may sleep */ }
    };
    void take();
    document.addEventListener('visibilitychange', take);
    return () => { gone = true; document.removeEventListener('visibilitychange', take); void lock?.release().catch(() => {}); };
  }, [active]);
}
