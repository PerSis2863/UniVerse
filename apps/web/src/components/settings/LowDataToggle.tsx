'use client';

import { useEffect, useState } from 'react';
import { Gauge, X } from 'lucide-react';
import { connectionIsSlow, useLowData } from '@/store/low-data';
import { cn } from '@/lib/utils';

/** The low-data mode switch (Settings). */
export function LowDataToggle() {
  const { enabled, setEnabled } = useLowData();
  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-zinc-200 dark:border-white/10">
      <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0"><Gauge className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">Low-data mode</p>
        <p className="text-sm text-zinc-500">For slow or expensive mobile data: photos in chats load only when you tap them, videos don’t preload, pages refresh less often in the background, and effects are lighter. Saved on this device.</p>
      </div>
      <button role="switch" aria-checked={enabled} aria-label="Low-data mode" onClick={() => setEnabled(!enabled)}
        className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1', enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-white/20')}>
        <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', enabled ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

/**
 * Applies low-data mode to the page, and offers it once when the browser reports a slow
 * connection or data saver.
 */
export function LowDataSync() {
  const { enabled, suggestedAt, setEnabled, markSuggested } = useLowData();
  const [offer, setOffer] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('low-data', enabled); }, [enabled]);
  useEffect(() => {
    if (enabled || suggestedAt || !connectionIsSlow()) return;
    const t = setTimeout(() => setOffer(true), 1500);
    return () => clearTimeout(t);
  }, [enabled, suggestedAt]);
  if (!offer) return null;
  const close = () => { markSuggested(); setOffer(false); };
  return (
    <div role="dialog" aria-label="Low-data mode" className="fixed left-3 right-3 sm:left-auto sm:right-4 sm:w-96 bottom-[calc(var(--mobile-tabbar-h,3.5rem)+env(safe-area-inset-bottom)+12px)] md:bottom-4 z-[120] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161b2e] shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <Gauge className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-zinc-900 dark:text-white text-sm">Your connection looks slow</p>
          <p className="text-xs text-zinc-500 mt-0.5">Turn on low-data mode to load photos only when you tap them and refresh less often. You can change it in Settings.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setEnabled(true); close(); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Turn on</button>
            <button onClick={close} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500">Not now</button>
          </div>
        </div>
        <button onClick={close} aria-label="Close" className="p-1 text-zinc-400"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
