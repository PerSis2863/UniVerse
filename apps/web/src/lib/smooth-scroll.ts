'use client';

// M326: scrolling with a mouse wheel or a trackpad glides, like tripist.app (the owner, 18 Nov 2026: "it takes time
// to scroll and it feels really good"). That site's smooth-scroll part runs Lenis with a duration of intensity / 10
// and sets 25: each turn of the wheel moves a target, and the page eases from where it is to the target over 2.5 s
// on an expo-out curve (half the way in a quarter of a second, then a long soft stop), so a run of turns keeps
// gliding. Native everywhere else: touch (phones keep their own momentum), keys, the scroll bar, links to
// #sections, pinch zoom, Shift / Ctrl / Alt / ⌘ + wheel, anything that already took the wheel (maps, canvases,
// games), a part that scrolls by itself (a list, a chat, a textarea, the side menu) until it reaches its end, fixed
// bars and sheets, a page locked under a viewer, and `data-scroll-native`. Off with Reduce Motion (the device's or
// the app's) and with Settings → Appearance → Smooth scrolling.

import { SMOOTH_EVENT, smoothScrollOn } from './display-prefs';

export const GLIDE_MS = 2500;
/** Lenis's default curve. */
export const glideEase = (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t));
/** A wheel's delta in pixels: lines are 100/6 px (as Lenis), pages a screen. */
export const wheelPx = (delta: number, mode: number, page: number) => (mode === 1 ? delta * (100 / 6) : mode === 2 ? delta * page : delta);

type Seen = { at: number; scrolls: boolean; contain: boolean; fixed: boolean };
const seen = new WeakMap<Element, Seen>();
const NATIVE = '[data-scroll-native],[aria-modal="true"],dialog,canvas,iframe,video,select,textarea,.maplibregl-map';

function look(el: Element, now: number): Seen {
  const s = seen.get(el);
  if (s && now - s.at < 1000) return s;
  const cs = getComputedStyle(el);
  const v = { at: now, scrolls: /auto|scroll|overlay/.test(cs.overflowY), contain: cs.overscrollBehaviorY !== 'auto', fixed: cs.position === 'fixed' };
  seen.set(el, v);
  return v;
}

/** Whether something between the pointer and the page takes this wheel itself. */
function takenBelow(target: EventTarget | null, dy: number, now: number) {
  const top = document.body;
  for (let n = target instanceof Element ? target : null; n && n !== top && n !== document.documentElement; n = n.parentElement) {
    if (n.matches(NATIVE)) return true;
    const s = look(n, now);
    if (s.fixed) return true;
    if (s.scrolls && n.scrollHeight > n.clientHeight + 1) {
      const can = dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0;
      if (can || s.contain) return true;
    }
  }
  return false;
}

const locked = () => [document.documentElement, document.body].some((el) => /hidden|clip/.test(getComputedStyle(el).overflowY));

/** Starts the glide for the whole app (once, from ScrollMotion). Returns a stop function. */
export function startSmoothScroll(): () => void {
  if (typeof window === 'undefined') return () => {};
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let on = smoothScrollOn();
  let raf = 0, from = 0, pos = 0, target = 0, start = 0;
  const root = () => document.scrollingElement ?? document.documentElement;
  const maxY = () => Math.max(0, root().scrollHeight - window.innerHeight);
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const frame = (now: number) => {
    // Keys, the scroll bar, a link or a new page moved it: let go.
    if (Math.abs(window.scrollY - pos) > 1.5) return stop();
    const t = Math.min(1, Math.max(0, now - start) / GLIDE_MS);
    pos = Math.min(maxY(), Math.max(0, from + (target - from) * glideEase(t)));
    window.scrollTo({ top: pos, behavior: 'instant' });
    if (t >= 1 || Math.abs(target - pos) < 0.5) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
  };

  const onWheel = (e: WheelEvent) => {
    if (!on || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (still.matches || document.documentElement.classList.contains('reduce-motion')) return;
    const now = performance.now();
    if (takenBelow(e.target, e.deltaY, now)) return;
    const max = maxY();
    if (max <= 0 || locked()) return;
    if (!raf || Math.abs(window.scrollY - pos) > 1.5) { stop(); pos = target = window.scrollY; }
    const next = Math.min(max, Math.max(0, target + wheelPx(e.deltaY, e.deltaMode, window.innerHeight)));
    if (next === target && !raf) return; // at the top or the end: the device's own bounce
    e.preventDefault();
    from = pos; target = next; start = now;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onPref = () => { on = smoothScrollOn(); if (!on) stop(); };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener(SMOOTH_EVENT, onPref);
  return () => { stop(); window.removeEventListener('wheel', onWheel); window.removeEventListener(SMOOTH_EVENT, onPref); };
}
