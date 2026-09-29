'use client';

import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi } from 'lucide-react';
import { mutate } from 'swr';

export function OfflineBar() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
    } else if (wasOffline) {
      // Show the "back online" message briefly, and refetch whatever is on screen.
      setVisible(true);
      void mutate(() => true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isOnline, wasOffline]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[140] flex items-center justify-center gap-2 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-xs font-semibold transition-all duration-500 ${
        isOnline
          ? 'bg-emerald-500 text-white'
          : 'bg-orange-500 text-white'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          Back online
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          You&apos;re offline — pages you&apos;ve opened still work
        </>
      )}
    </div>
  );
}
