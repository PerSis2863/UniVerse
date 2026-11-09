'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { reducedMotion } from '@/lib/page-transition';
import { appFor, type AppId } from '@/lib/apps';
import { useChosenApp } from '@/lib/chosen-app';
import { backdropLoop, makeBackdrop, type BackdropOpts } from '@/lib/backdrop';
import { cn } from '@/lib/utils';

// Each app's own background behind the page (M129, the owner, 9 Nov 2026; it replaced the river of
// M9–M128). The scenes are in src/lib/backdrop.ts. Which one shows:
//   · the website and sign-in: the app picked on their tabs (`app`), fading to the next on a switch;
//   · in the app: the app the page belongs to (appFor), and on shared pages (the hub, Messages,
//     Settings…) the app the person chose last (useChosenApp).
// Smooth: drawn on a background thread where the browser can (backdrop.worker.ts), so it keeps moving
// while the page scrolls and never takes time from taps or typing; on the page otherwise, where it
// rests while the page scrolls (<html data-scrolling>, as the other decorative loops do, M97). In
// the app it starts moving once the page has loaded; one held frame for Reduce Motion; it rests while
// the tab is hidden and while a game covers the screen (<html data-arena>, M118).

const html = () => document.documentElement;

/** The landing page and sign-in draw their own (with the app from their tabs). */
const OWN = new Set(['/', '/login', '/register']);

/**
 * `app`: the scene to show (otherwise the page's app). `own`: drawn by the page itself (the landing
 * page, sign-in), which also starts it moving straight away. `tone="dark"`: always the dark look.
 */
export function AppBackdrop({ app, own = false, tone = 'auto', strength, className }: { app?: AppId; own?: boolean; tone?: 'auto' | 'dark'; strength?: number; className?: string }) {
  const pathname = usePathname();
  const chosen = useChosenApp();
  if (!own && OWN.has(pathname)) return null;
  return <Backdrop app={app ?? appFor(pathname)?.id ?? chosen} dark={tone === 'dark'} soon={own} strength={strength ?? (own ? 1 : 0.7)} className={className} />;
}

interface Driver { size(): void; theme(): void; app(id: AppId): void; rest(): void; move(): void; stop(): void }

function Backdrop({ app, dark, soon, strength, className }: { app: AppId; dark: boolean; soon: boolean; strength: number; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const drive = useRef<Driver | null>(null);
  const current = useRef(app);
  // The background thread said no (no 2D drawing there): draw on the page instead.
  const [onPage, setOnPage] = useState(false);

  useEffect(() => { current.current = app; drive.current?.app(app); }, [app]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas each time: one handed to a background thread can't be handed over again.
    const cv = document.createElement('canvas');
    cv.className = cn('app-backdrop', className);
    cv.setAttribute('aria-hidden', 'true');
    cv.setAttribute('data-no-motion', '');
    box.appendChild(cv);
    const still = reducedMotion();
    const opts: BackdropOpts = { strength, still, phone: window.innerWidth < 640 };
    const isDark = () => dark || html().classList.contains('dark');
    const dpr = () => window.devicePixelRatio || 1;
    const canWork = !onPage && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof cv.transferControlToOffscreen === 'function';
    /** Nobody needs it moving now (drawn on the page, a scroll counts too: the scroll comes first). */
    const resting = () => document.hidden || html().hasAttribute('data-arena') || (!canWork && html().hasAttribute('data-scrolling'));

    let d: Driver;
    if (canWork) {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./backdrop.worker.ts', import.meta.url));
        const off = cv.transferControlToOffscreen();
        worker.postMessage({ t: 'init', canvas: off, opts, w: window.innerWidth, h: window.innerHeight, dpr: dpr(), dark: isDark(), app: current.current, move: soon, rest: resting() }, [off]);
      } catch {
        cv.remove();
        queueMicrotask(() => setOnPage(true));
        return;
      }
      worker.onmessage = (e: MessageEvent<{ t: string }>) => { if (e.data?.t === 'unsupported') setOnPage(true); };
      worker.onerror = () => setOnPage(true);
      d = {
        size: () => worker.postMessage({ t: 'size', w: window.innerWidth, h: window.innerHeight, dpr: dpr() }),
        theme: () => worker.postMessage({ t: 'dark', dark: isDark() }),
        app: (id) => worker.postMessage({ t: 'app', app: id }),
        rest: () => worker.postMessage({ t: 'rest', rest: resting() }),
        move: () => worker.postMessage({ t: 'move' }),
        stop: () => worker.terminate(),
      };
    } else {
      // On the page (no background drawing in this browser): the same scenes, drawn here.
      const ctx = cv.getContext('2d');
      const soft = document.createElement('canvas');
      const sctx = soft.getContext('2d');
      if (!ctx || !sctx) { cv.remove(); return; }
      const b = makeBackdrop(cv, ctx, soft, sctx, opts);
      b.resize(window.innerWidth, window.innerHeight, dpr());
      b.scene(current.current, performance.now());
      const loop = backdropLoop(b, opts, isDark(), (cb) => requestAnimationFrame(cb), (id) => cancelAnimationFrame(id));
      loop.rest(resting());
      if (soon) loop.move();
      d = {
        size: () => loop.size(window.innerWidth, window.innerHeight, dpr()),
        theme: () => loop.dark(isDark()),
        app: (id) => loop.app(id, performance.now()),
        rest: () => loop.rest(resting()),
        move: () => loop.move(),
        stop: () => loop.stop(),
      };
    }
    drive.current = d;

    // In the app: the first frame now, moving once the page has loaded (on a slow phone the first
    // seconds belong to the page). The website and sign-in move straight away.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = soon ? 0 : w.requestIdleCallback ? w.requestIdleCallback(() => d.move(), { timeout: 3000 }) : window.setTimeout(() => d.move(), 1500);
    const onResize = () => d.size();
    const onVisible = () => d.rest();
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    // The theme can change (Settings → Appearance, the top bar's switch); a game or a scroll rests it.
    const watch = new MutationObserver(() => { d.theme(); d.rest(); });
    watch.observe(html(), { attributes: true, attributeFilter: ['class', 'data-arena', 'data-scrolling'] });
    return () => {
      d.stop();
      drive.current = null;
      if (!soon) { if (w.cancelIdleCallback) w.cancelIdleCallback(idle); else window.clearTimeout(idle); }
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      watch.disconnect();
      cv.remove();
    };
  }, [dark, soon, strength, className, onPage]);

  return <span ref={host} className="contents" aria-hidden />;
}
