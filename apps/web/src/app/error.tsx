'use client';

import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { captureError } from '@/lib/error-monitor';

// Shown when a page crashes while rendering. The error is reported automatically
// (src/lib/error-monitor.ts → /console → Errors), so people don't need to describe it.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, 'render', error.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center p-6 text-center">
      <div className="flex max-w-md flex-col items-center rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">This page hit a problem</h2>
        <p className="mt-2 text-sm text-zinc-500">
          We’ve been told about it automatically. Try again, and if it keeps happening, go back to the home page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => reset()} className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          {/* A full page load (not client navigation) so a broken page state can't carry over. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            <Home className="w-4 h-4" /> Home
          </a>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-zinc-400">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
