'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { reducedMotion } from '@/lib/page-transition';
import { makeRiver, riverGap, type RiverOpts, type RiverState } from '@/lib/river-paint';
import { makeRiverGL } from '@/lib/river-gl';
import { cn } from '@/lib/utils';

// The river of light behind every page, website and app (M9/M10, the owner's Relay video in
// UniVerse's two tones): one continuous river from the top of the page to the very bottom.
//   · soft bands: wide, out-of-focus ribbons of light that drift and sway (drawn at a quarter of the
//     size and stretched: a free, smooth blur that also works in Safari);
//   · fine strands: a dense bundle, tight and white-hot at each bend, fanning out in between;
//   · pulses: light running down the strands; and sparks drifting along them;
//   · it answers the pointer (or a finger): the strands part round it and glow there (M11).
// On the landing page it pours in from the top right when the page opens, bends in the gap between
// the hero's words and its card, and carries on down the page. It belongs to the page: it moves with
// whatever scrolls (the window, or the app's own panel; not menus or dialogs).
// Cheap on purpose: one canvas the size of the screen (≤2.2 M pixels), only the visible stretch is
// drawn; 60 frames a second on computers, 30 on phones; in the app it starts moving once the page
// has loaded; still only for Reduce Motion (the person's own setting); nothing while the tab is
// hidden. The owner (M56a, 31 Oct): nothing may slow or stop it by itself (M46's "lighter, then
// still" when frames came late, and the low-memory check, froze it on a fast laptop), so don't add one.
// M84: where the browser can, every frame is drawn on a background thread (river.worker.ts, the page
// hands its canvas over), so the river never takes time from taps, typing or scrolling; elsewhere
// the same drawing runs on the page as before.
// M125: drawn with WebGL 2 (src/lib/river-gl.ts: soft glowing fibres, depth of field, glitter, after
// the owner's Relay recording); the 2D painter (src/lib/river-paint.ts) only where WebGL 2 isn't there.
// M118: it also rests while a game covers the whole screen (<html data-arena>, Play's arena), as in a
// hidden tab: nobody can see it then, and the game needs the graphics chip. It carries on when the
// game closes (this isn't M56a's "slow or stop by itself": it never stops while it can be seen).

/** Nobody can see the river: a hidden tab, or a game over the whole screen. */
const unseen = () => document.hidden || document.documentElement.hasAttribute('data-arena');

const OWN_RIVER = new Set(['/', '/login', '/register']);

/**
 * `tone="dark"`: always the dark look (sign-in). `hero`: the landing page's opening (the first bend
 * between the hero's words and card, drawn in on arrival). `own`: the river a page draws for itself
 * (the landing page, sign-in). `strength`: 0–1.
 */
export function LightTrail({ tone = 'auto', hero = false, own = false, strength = 1, className }: { tone?: 'auto' | 'dark'; hero?: boolean; own?: boolean; strength?: number; className?: string }) {
  const pathname = usePathname();
  // The landing page and sign-in draw their own river: the root one would sit hidden under it.
  if (!own && OWN_RIVER.has(pathname)) return null;
  return <River tone={tone} hero={hero} strength={strength} className={className} path={pathname} />;
}

/** What drives a river, wherever it's drawn (here or on the background thread). */
interface Driver { size(): void; scroll(): void; pointer(x: number, y: number): void; leave(): void; theme(): void; visible(): void; move(): void; stop(): void }

function River({ tone, hero, strength, className, path }: { tone: 'auto' | 'dark'; hero: boolean; strength: number; className?: string; path: string }) {
  const host = useRef<HTMLSpanElement>(null);
  // The background thread said no (no 2D drawing there): draw on the page instead.
  const [onPage, setOnPage] = useState(false);
  const resync = useRef<() => void>(() => {});
  // A new page may scroll in a new panel (or not at all): tell the river where the page is now.
  useEffect(() => { resync.current(); }, [path]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas each time: one handed to a background thread can't be handed over again.
    let cv = document.createElement('canvas');
    cv.className = cn('light-river', className);
    cv.setAttribute('aria-hidden', 'true');
    cv.setAttribute('data-no-motion', '');
    box.appendChild(cv);
    const still = reducedMotion();
    const phone = window.innerWidth < 640;
    const opts: RiverOpts = { tone, hero, strength, still, phone };
    let scroller: Element | null = null;
    const scrollY = () => {
      if (scroller && !scroller.isConnected) scroller = null; // that page's panel is gone
      return scroller ? scroller.scrollTop : window.scrollY;
    };
    const dark = () => tone === 'dark' || document.documentElement.classList.contains('dark');
    const canWork = !onPage && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof cv.transferControlToOffscreen === 'function';

    let drive: Driver;
    if (canWork) {
      // On a background thread: the worker draws; this side only tells it what changed.
      let worker: Worker;
      try {
        worker = new Worker(new URL('./river.worker.ts', import.meta.url));
        const off = cv.transferControlToOffscreen();
        worker.postMessage({ t: 'init', canvas: off, opts, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1, sy: scrollY(), dark: dark(), move: hero || still }, [off]);
      } catch {
        cv.remove();
        queueMicrotask(() => setOnPage(true));
        return;
      }
      worker.onmessage = (e: MessageEvent<{ t: string }>) => { if (e.data?.t === 'unsupported') setOnPage(true); };
      worker.onerror = () => setOnPage(true);
      let lastSy = NaN;
      drive = {
        size: () => worker.postMessage({ t: 'size', w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 }),
        scroll: () => { const sy = scrollY(); if (sy !== lastSy) { lastSy = sy; worker.postMessage({ t: 'scroll', sy }); } },
        pointer: (x, y) => worker.postMessage({ t: 'pointer', x, y }),
        leave: () => worker.postMessage({ t: 'leave' }),
        theme: () => worker.postMessage({ t: 'dark', dark: dark() }),
        visible: () => worker.postMessage({ t: 'hidden', hidden: unseen() }),
        move: () => worker.postMessage({ t: 'move' }),
        stop: () => worker.terminate(),
      };
    } else {
      // On the page (no background drawing in this browser): the same river, drawn here.
      // draw returns true while the river is still gliding after a scroll (another frame wanted).
      let river: { resize: (w: number, h: number, r: number) => void; draw: (ms: number, s: RiverState) => boolean | void } | null = makeRiverGL(cv, opts, performance.now());
      if (!river) {
        // WebGL 2 may have taken the canvas before failing: draw in 2D on a fresh one.
        let ctx = cv.getContext('2d');
        if (!ctx) { const fresh = cv.cloneNode() as HTMLCanvasElement; cv.replaceWith(fresh); cv = fresh; ctx = cv.getContext('2d'); }
        const soft = document.createElement('canvas');
        const sctx = soft.getContext('2d');
        if (!ctx || !sctx) { cv.remove(); return; }
        river = makeRiver(cv, ctx, soft, sctx, opts, performance.now());
      }
      river.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      const state: RiverState = { sy: 0, dark: dark(), px: -9999, py: -9999, pAt: -1e9 };
      let frame = 0, last = 0, moving = false;
      const draw = (ms: number) => { state.sy = scrollY(); state.dark = dark(); return river.draw(ms, state); };
      // As on the background thread: whether it keeps moving is decided when the frame runs.
      const tick = (ms: number) => {
        frame = 0;
        if (unseen()) return;
        if (still || !moving) { if (draw(ms)) frame = requestAnimationFrame(tick); return; }
        if (ms - last >= riverGap(phone)) { last = ms; draw(ms); }
        frame = requestAnimationFrame(tick);
      };
      const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };
      drive = {
        size: () => { river.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); kick(); },
        scroll: () => { if (still || !moving) kick(); },
        pointer: (x, y) => { state.px = x; state.py = y; state.pAt = performance.now(); },
        leave: () => { state.pAt = -1e9; },
        theme: kick,
        visible: () => { if (!unseen()) kick(); },
        move: () => { moving = !still; kick(); },
        stop: () => cancelAnimationFrame(frame),
      };
      kick();
    }

    // Whatever scrolls the page (the window, or the app's panel: scroll events don't bubble, so
    // listen on the way down). A panel counts if it's at least half the screen tall.
    const onScroll = (e: Event) => {
      const el = e.target;
      if (el === document || el === document.documentElement || el === document.body) scroller = null;
      // Not the side menu, a dialog or a sheet: only the page itself moves the river.
      else if (el instanceof Element && el.clientHeight > window.innerHeight * 0.5 && !el.closest('aside, nav, [role="dialog"], [aria-modal="true"]')) scroller = el;
      else return;
      drive.scroll();
    };
    // After a page change: the river follows the new page's scroll (once it's on screen).
    resync.current = () => { requestAnimationFrame(() => drive.scroll()); };
    const onPointer = (e: PointerEvent) => { if (!unseen()) drive.pointer(e.clientX, e.clientY); };
    const onLeave = () => drive.leave();
    if (!still) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerdown', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    // In the app: one frame now, moving once the page has loaded (on a slow phone the first seconds
    // belong to the page). The landing's opening pours in straight away.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = hero || still ? (drive.move(), 0) : w.requestIdleCallback ? w.requestIdleCallback(() => drive.move(), { timeout: 3000 }) : window.setTimeout(() => drive.move(), 1500);
    const onResize = () => drive.size();
    const onVisible = () => drive.visible();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    // The theme can change (Settings → Appearance): redraw then too. A game opening or closing over
    // the page (data-arena) rests or wakes it.
    const themeWatch = new MutationObserver(() => { drive.theme(); drive.visible(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-arena'] });
    return () => {
      drive.stop();
      resync.current = () => {};
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle); else window.clearTimeout(idle);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      themeWatch.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cv.remove();
    };
  }, [tone, hero, strength, className, onPage]);

  return <span ref={host} className="contents" aria-hidden />;
}
