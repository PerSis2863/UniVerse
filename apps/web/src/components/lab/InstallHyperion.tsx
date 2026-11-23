'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Download, X } from 'lucide-react';
import { useDesktop } from '@/lib/use-desktop';

// Hyperion as a computer app: the downloads for Windows, Mac and Linux first (M450), then the browser's own install (M409:
// Chrome or Edge open their install box; Safari on a Mac is told File → Add to Dock; Firefox, which can't install apps,
// is told which browsers can). Hidden inside the computer app itself, and on phones (Hyperion is for computers, M405).
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const STANDALONE = '(display-mode: standalone), (display-mode: window-controls-overlay)';
// The computer app's installers (M412: desktop/hyperion, built and published by GitHub Actions → "Hyperion desktop" as
// the release hyperion-latest; M450: offered first, the visitor's own system first, also inside the browser-installed app).
const RELEASE = 'https://github.com/PerSis2863/UniVerse/releases/download/hyperion-latest';
const DOWNLOADS = [{ os: 'Windows', file: 'Hyperion-Setup.exe', ua: /Windows/ }, { os: 'Mac', file: 'Hyperion-mac.dmg', ua: /Mac OS X|Macintosh/ }, { os: 'Linux', file: 'Hyperion-linux.AppImage', ua: /Linux|X11/ }];
const subscribe = (cb: () => void) => { const m = window.matchMedia(STANDALONE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

export function InstallHyperion() {
  // The browser's app window, and Hyperion's computer app (its preload sets `hyperionDesktop`).
  const inWindow = useSyncExternalStore(subscribe, () => window.matchMedia(STANDALONE).matches, () => true);
  const computerApp = useSyncExternalStore(subscribe, () => 'hyperionDesktop' in window, () => true);
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
  if (computerApp || !desktop) return null;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const mine = DOWNLOADS.find((d) => d.ua.test(ua));
  const downloads = mine ? [mine, ...DOWNLOADS.filter((d) => d !== mine)] : DOWNLOADS;
  const how = /Firefox\//.test(ua)
    ? 'Firefox can’t install apps. Open this page in Chrome, Edge or Safari, then install it from there.'
    : /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)
      ? 'In Safari: File → Add to Dock. Hyperion then opens in its own window from the Dock.'
      : 'Press the install icon at the end of the address bar (a screen with an arrow), or the browser’s menu → Install Hyperion.';
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setPrompt(null);
  };
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" aria-expanded={help} onClick={() => setHelp((h) => !h)} title="Hyperion as an app for Windows, Mac or Linux">
        <Download className="h-3.5 w-3.5" aria-hidden />{inWindow ? 'Get the computer app' : 'Install Hyperion'}
      </button>
      {help && (
        <div role="dialog" aria-label="How to install Hyperion" className="absolute end-0 top-full z-40 mt-2 w-72 rounded-xl bg-white p-3 text-start text-xs leading-relaxed text-zinc-700 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10">
          <div className="flex items-start gap-2">
            <p className="flex-1 font-semibold text-zinc-900 dark:text-white">Download Hyperion for your computer</p>
            <button type="button" className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close" onClick={() => setHelp(false)}><X className="h-3.5 w-3.5" aria-hidden /></button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {downloads.map((d) => <a key={d.os} href={`${RELEASE}/${d.file}`} className={d === mine ? 'rounded-md bg-violet-600 px-2.5 py-1 font-semibold text-white hover:bg-violet-700' : 'rounded-md px-2 py-1 font-semibold text-violet-700 ring-1 ring-violet-600/40 hover:bg-violet-600/10 dark:text-violet-300'} download>{d.os}</a>)}
          </div>
          <p className="mt-1.5">Its own app with its own icon, the newest Hyperion every time, Julia, C++ and Rust with the tools on your computer. Windows and Mac may ask once whether to open an app from the internet.</p>
          {!inWindow && (
            <p className="mt-2 border-t border-zinc-200 pt-2 dark:border-white/10">
              Or install it from the browser: {prompt ? <button type="button" className="font-semibold text-violet-700 underline dark:text-violet-300" onClick={() => void install()}>Install in the browser</button> : how}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
