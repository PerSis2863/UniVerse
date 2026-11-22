'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Download, X } from 'lucide-react';
import { useDesktop } from '@/lib/use-desktop';

// Install Hyperion as a computer app (M409): with Chrome or Edge the browser's own install box opens; Safari on a Mac
// is told how (File → Add to Dock); Firefox, which can't install apps, is told which browsers can. Hidden inside the
// installed app itself, and on phones (Hyperion is for computers, M405).
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const STANDALONE = '(display-mode: standalone), (display-mode: window-controls-overlay)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(STANDALONE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

export function InstallHyperion() {
  const installed = useSyncExternalStore(subscribe, () => window.matchMedia(STANDALONE).matches, () => true);
  const desktop = useDesktop();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setPrompt(null); toast.success('Hyperion is installed: open it from your desktop, dock or start menu.'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  useEffect(() => {
    if (!help) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setHelp(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [help]);
  if (installed || !desktop) return null;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const how = /Firefox\//.test(ua)
    ? 'Firefox can’t install apps. Open this page in Chrome, Edge or Safari, then install it from there.'
    : /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)
      ? 'In Safari: File → Add to Dock. Hyperion then opens in its own window from the Dock.'
      : 'Press the install icon at the end of the address bar (a screen with an arrow), or the browser’s menu → Install Hyperion.';
  const install = async () => {
    if (!prompt) { setHelp((h) => !h); return; }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setPrompt(null);
  };
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" aria-expanded={prompt ? undefined : help} onClick={() => void install()} title="Hyperion in its own window, with its own icon">
        <Download className="h-3.5 w-3.5" aria-hidden />Install Hyperion
      </button>
      {help && (
        <div role="dialog" aria-label="How to install Hyperion" className="absolute end-0 top-full z-40 mt-2 w-72 rounded-xl bg-white p-3 text-start text-xs leading-relaxed text-zinc-700 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10">
          <div className="flex items-start gap-2">
            <p className="flex-1">{how} It keeps your scripts and files on this computer.</p>
            <button type="button" className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close" onClick={() => setHelp(false)}><X className="h-3.5 w-3.5" aria-hidden /></button>
          </div>
        </div>
      )}
    </div>
  );
}
