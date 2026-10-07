'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  /** True for 3 s after coming back online, so a "reconnected" state can show. */
  wasOffline: boolean;
}

const onNetworkChange = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};

export function useNetworkStatus(): NetworkStatus {
  const isOnline = useSyncExternalStore(onNetworkChange, () => navigator.onLine, () => true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const handleOnline = () => { clearTimeout(t); t = setTimeout(() => setWasOffline(false), 3000); };
    const handleOffline = () => { clearTimeout(t); setWasOffline(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
