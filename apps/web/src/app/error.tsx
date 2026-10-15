'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Home, Flag, Check } from 'lucide-react';
import { captureError, reportProblem } from '@/lib/error-monitor';

// Shown when a page crashes while rendering. The error is reported automatically
// (src/lib/error-monitor.ts → /console → Errors); "Report this" adds what the person was doing.
// Each part of the app (student, teacher, admin, console…) has its own error.tsx using this, so
// its menus stay on screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reporting, setReporting] = useState<'closed' | 'open' | 'sent'>('closed');
  const [note, setNote] = useState('');
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
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We’ve been told about it automatically. Try again, and if it keeps happening, go back to the home page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => reset()} className="btn-primary">
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          {/* A full page load (not client navigation) so a broken page state can't carry over. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn-secondary">
            <Home className="w-4 h-4" /> Home
          </a>
          {reporting === 'closed' && (
            <button type="button" onClick={() => setReporting('open')} className="btn-secondary">
              <Flag className="w-4 h-4" /> Report this
            </button>
          )}
        </div>
        {reporting === 'open' && (
          <form
            className="mt-5 w-full text-left space-y-2"
            onSubmit={(e) => { e.preventDefault(); reportProblem(error, note); setReporting('sent'); }}
          >
            <label htmlFor="problem-note" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">What were you doing when it happened? (optional)</label>
            <textarea id="problem-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
            <button type="submit" className="btn-primary w-full">Send report</button>
          </form>
        )}
        {reporting === 'sent' && <p role="status" className="mt-4 text-sm text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Thanks: the UniVerse team will look at it.</p>}
        {error.digest && <p className="mt-4 text-[11px] text-zinc-400">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
