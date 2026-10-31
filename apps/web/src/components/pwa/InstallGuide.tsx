'use client';

import { BellRing, Download, Maximize2, MoreVertical, Share, SquarePlus, WifiOff } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

// How to put UniVerse on the home screen (M42), for the landing's "Get the app" and the in-app
// install banner. iPhone and iPad have no install button, so they get the three taps, drawn;
// Android and computers get the browser's own install when it offers one, else where to find it.

type Device = 'ios' | 'android' | 'computer';
const device = (): Device => {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /android/i.test(ua) ? 'android' : 'computer';
};

const STEPS: Record<Device, { icon: typeof Share; title: string; detail: string }[]> = {
  ios: [
    { icon: Share, title: 'Tap Share', detail: 'The square with an arrow, at the bottom of Safari.' },
    { icon: SquarePlus, title: 'Tap “Add to Home Screen”', detail: 'Scroll down a little if you don’t see it.' },
    { icon: Download, title: 'Tap Add', detail: 'UniVerse is on your home screen.' },
  ],
  android: [
    { icon: MoreVertical, title: 'Open the browser menu', detail: 'The three dots, top right.' },
    { icon: Download, title: 'Tap “Install app”', detail: 'Or “Add to Home screen”.' },
  ],
  computer: [
    { icon: Download, title: 'Click the install icon', detail: 'At the end of the address bar.' },
    { icon: Maximize2, title: 'Click Install', detail: 'UniVerse opens in its own window.' },
  ],
};

const PERKS = [
  { icon: Maximize2, text: 'Opens full screen, like an app' },
  { icon: BellRing, text: 'Notifications that reach you' },
  { icon: WifiOff, text: 'Works on a weak connection' },
];

export function InstallGuide({ onClose, onInstall }: {
  onClose: () => void;
  /** The browser's own install, when it offered one (beforeinstallprompt). */
  onInstall?: () => void;
}) {
  const steps = STEPS[device()];
  return (
    <Sheet title="Get the UniVerse app" onClose={onClose}
      footer={onInstall
        ? <button type="button" onClick={onInstall} className="btn-primary w-full"><Download className="w-4 h-4" aria-hidden /> Install UniVerse</button>
        : <button type="button" onClick={onClose} className="btn-secondary w-full">Done</button>}>
      <ul className="grid gap-2" aria-label="What you get">
        {PERKS.map(({ icon: Icon, text }, i) => (
          <li key={text} className="rise-in flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="karma-icon shrink-0 w-8 h-8 grid place-items-center"><Icon className="w-4 h-4" aria-hidden /></span>{text}
          </li>
        ))}
      </ul>
      {!onInstall && (
        <ol className="mt-5 grid gap-2" aria-label="How to install">
          {steps.map(({ icon: Icon, title, detail }, i) => (
            <li key={title} className="rise-in grid grid-cols-[2.25rem_1fr] gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 p-3" style={{ animationDelay: `${150 + i * 60}ms` }}>
              <span className="relative w-9 h-9 rounded-xl grid place-items-center bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                <Icon className="w-4 h-4" aria-hidden />
                <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full grid place-items-center bg-fuchsia-500 text-white text-[11px] font-bold">{i + 1}</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-snug">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
