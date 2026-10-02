'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Parts of the app shell that aren't needed for the first view — the help assistant, the command
// palette (Ctrl+K), the first-time tour and the push-notification prompt — load once the page is idle, so they don't
// compete with the page itself. Opening the palette before then loads it right away.

const CommandPalette = dynamic(() => import('@/components/ui/CommandPalette').then((m) => m.CommandPalette), { ssr: false });
const AIStudyAssistant = dynamic(() => import('@/components/ui/AIStudyAssistant').then((m) => m.AIStudyAssistant), { ssr: false });
const WelcomeTour = dynamic(() => import('@/components/layout/WelcomeTour').then((m) => m.WelcomeTour), { ssr: false });
const PushNotificationManager = dynamic(() => import('@/components/pwa/PushNotificationManager').then((m) => m.PushNotificationManager), { ssr: false });

declare global {
  interface Window { __universePalettePending?: boolean }
}

function useIdle(timeout = 2500) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setIdle(true), 1200);
    return () => clearTimeout(t);
  }, [timeout]);
  return idle;
}

export function DeferredShell({ role, showAssistant, signedIn }: { role?: string; showAssistant: boolean; signedIn: boolean }) {
  const idle = useIdle();
  const [wantPalette, setWantPalette] = useState(false);

  // Before the palette has loaded: Ctrl/⌘+K or the search button load it and open it.
  useEffect(() => {
    if (idle || wantPalette) return;
    const request = () => { window.__universePalettePending = true; setWantPalette(true); };
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); request(); } };
    document.addEventListener('keydown', onKey);
    window.addEventListener('universe:open-palette', request);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('universe:open-palette', request); };
  }, [idle, wantPalette]);

  return (
    <>
      {(idle || wantPalette) && <CommandPalette role={role} />}
      {idle && showAssistant && <AIStudyAssistant />}
      {idle && signedIn && <WelcomeTour role={role} />}
      {idle && signedIn && <PushNotificationManager />}
    </>
  );
}
