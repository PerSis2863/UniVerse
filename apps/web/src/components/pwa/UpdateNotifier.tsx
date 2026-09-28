'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Keeps the installed app (PWA) on the same version as the website. The service worker switches to
 * a new deployment on its own, but an open app keeps running the old code until it reloads, so
 * offer a refresh as soon as the new version takes over. Also checks for new versions when the
 * app comes back to the foreground.
 */
export function UpdateNotifier() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = !!sw.controller; // first install isn't an "update"
    let notified = false;

    const onControllerChange = () => {
      if (!hadController || notified) return;
      notified = true;
      toast('UniVerse has been updated', {
        description: 'Refresh to use the latest version.',
        duration: Infinity,
        action: { label: 'Refresh', onClick: () => window.location.reload() },
      });
    };
    const check = () => {
      sw.getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

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
