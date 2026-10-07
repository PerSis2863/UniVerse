'use client';

import { useEffect, useState } from 'react';
import { Gauge, SignalLow, X } from 'lucide-react';
import { connectionIs2G, connectionIsSlow, useLowData } from '@/store/low-data';
import { Switch } from '@/components/ui/Switch';

/** The low-data mode and 2G mode switches (Settings). */
export function LowDataToggle() {
  const { enabled, twoG, setEnabled, setTwoG } = useLowData();
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 divide-y divide-zinc-200 dark:divide-white/10">
      <div className="flex items-start gap-4 p-4">
        <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0"><Gauge className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white">Low-data mode</p>
          <p className="text-sm text-zinc-500">For slow or expensive mobile data: photos in chats load only when you tap them, videos don’t preload, pages refresh less often in the background, and effects are lighter. Saved on this device.</p>
        </div>
        <Switch checked={enabled} label="Low-data mode" onChange={setEnabled} className="mt-1" />
      </div>
      <div className="flex items-start gap-4 p-4">
        <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0"><SignalLow className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white">2G mode</p>
          <p className="text-sm text-zinc-500">For the weakest connections: calls are voice only at 16 kbps (about 7 MB an hour), cameras aren’t sent or received, and shared screens still show. Turns on low-data mode too. You can change it during a call.</p>
        </div>
        <Switch checked={twoG} label="2G mode" onChange={setTwoG} className="mt-1" />
      </div>
    </div>
  );
}

/**
 * Applies low-data mode to the page, and offers it once when the browser reports a slow
 * connection or data saver.
 */
export function LowDataSync() {
  const { enabled, suggestedAt, setEnabled, setTwoG, markSuggested } = useLowData();
  const [offer, setOffer] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('low-data', enabled); }, [enabled]);
  useEffect(() => {
    if (enabled || suggestedAt || !connectionIsSlow()) return;
    const t = setTimeout(() => setOffer(true), 1500);
    return () => clearTimeout(t);
  }, [enabled, suggestedAt]);
  if (!offer) return null;
  const close = () => { markSuggested(); setOffer(false); };
  // A 2G connection is offered 2G mode (voice-only calls); anything else slow, low-data mode.
  const is2G = connectionIs2G();
  return (
    <div role="dialog" aria-label="Low-data mode" className="fixed left-3 right-3 sm:left-auto sm:right-4 sm:w-96 bottom-[calc(var(--mobile-tabbar-h,3.5rem)+env(safe-area-inset-bottom)+12px)] md:bottom-4 z-[120] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121830] shadow-2xl p-4">
      <div className="flex items-start gap-3">
        <Gauge className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-zinc-900 dark:text-white text-sm">Your connection looks slow</p>
          <p className="text-xs text-zinc-500 mt-0.5">{is2G
            ? 'Turn on 2G mode: calls become voice only at 16 kbps, photos load only when you tap them, and pages refresh less often. You can change it in Settings.'
            : 'Turn on low-data mode to load photos only when you tap them and refresh less often. You can change it in Settings.'}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { if (is2G) setTwoG(true); else setEnabled(true); close(); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">{is2G ? 'Turn on 2G mode' : 'Turn on'}</button>
            <button onClick={close} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500">Not now</button>
          </div>
        </div>
        <button onClick={close} aria-label="Close" className="p-1 text-zinc-400"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
