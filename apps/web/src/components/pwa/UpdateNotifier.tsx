'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Keeps the app on the same version as the website, without ever breaking an open tab.
 *
 * The service worker keeps a copy of every file of the version it belongs to. A new deployment
 * installs a new service worker, but it WAITS (skipWaiting is off in next.config.ts): switching
 * at once would delete the old version's files while open tabs still run the old code, and the
 * next page they open would fail to load (a blank white page until a manual refresh). Instead we
 * offer a refresh; accepting it activates the new version and reloads. Tabs that ignore it keep
 * working on the old version, and the new one takes over once they're all closed.
 */
export function UpdateNotifier() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let notified = false;
    let reloading = false;
    let reg: ServiceWorkerRegistration | undefined;

    const activate = () => {
      const waiting = reg?.waiting;
      if (!waiting) return window.location.reload();
      reloading = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 3000); // in case controllerchange never fires
    };
    const offer = () => {
      if (notified || !sw.controller) return; // the first install isn't an update
      notified = true;
      toast('A new version of UniVerse is ready', {
        description: 'Refresh to get the latest improvements.',
        duration: Infinity,
        action: { label: 'Refresh', onClick: activate },
      });
    };
    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting) offer();
      r.addEventListener('updatefound', () => {
        const next = r.installing;
        next?.addEventListener('statechange', () => { if (next.state === 'installed') offer(); });
      });
    };
    const onControllerChange = () => { if (reloading) window.location.reload(); };
    const check = () => { reg?.update().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    sw.getRegistration().then((r) => { if (r) { reg = r; watch(r); } }).catch(() => {});
    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  return null;
}
