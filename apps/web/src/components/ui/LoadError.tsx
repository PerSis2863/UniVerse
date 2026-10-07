'use client';

import { useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// What a page or section shows when its data couldn't be loaded: a short reason and Retry.
// (Offline? Say so: the request will work again once the connection is back.)

export function LoadError({ onRetry, message = 'Couldn’t load this.', className }: { onRetry: () => unknown; message?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const retry = async () => {
    setBusy(true);
    try { await onRetry(); } finally { setBusy(false); }
  };
  return (
    <div role="alert" className={cn('panel p-6 flex flex-col items-center text-center gap-3', className)}>
      <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center"><WifiOff className="w-5 h-5" aria-hidden /></div>
      <div>
        <p className="font-semibold text-zinc-900 dark:text-white">{message}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{offline ? 'You’re offline. It loads again when you’re back online.' : 'Please check your connection and try again.'}</p>
      </div>
      <button type="button" onClick={() => void retry()} disabled={busy} className="btn-secondary btn-sm">
        <RefreshCw className={cn('w-4 h-4', busy && 'animate-spin')} /> Retry
      </button>
    </div>
  );
}
