'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { useLowData } from '@/store/low-data';

// App-wide data fetching settings.
// - Switching back to the tab refreshes data at most once every 30 seconds (it was every 5).
// - Identical requests made within 5 seconds share one answer.
// - "Not allowed / not found / bad request" answers aren't retried; network errors retry 3 times.
// - Pages keep showing what they had while new data loads.
// - Low-data mode: switching back to the tab doesn't refresh anything.
export function DataConfig({ children }: { children: ReactNode }) {
  const lowData = useLowData((s) => s.enabled);
  return (
    <SWRConfig
      value={{
        focusThrottleInterval: 30_000,
        ...(lowData ? { revalidateOnFocus: false } : {}),
        dedupingInterval: 5_000,
        keepPreviousData: true,
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
          const status = (error as { status?: number; response?: { status?: number } })?.status ?? (error as { response?: { status?: number } })?.response?.status;
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), Math.min(30_000, 2000 * 2 ** retryCount));
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
