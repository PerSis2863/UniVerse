'use client';

import { useEffect, useRef, useState } from 'react';
import { useIdle } from '@/lib/use-idle';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';
import type { EarthScene, Facing } from './earth-scene';

// M328: the landing's Earth as tripist shows it: a real-looking planet rising out of a bank of clouds, turning
// slowly. It starts when it nears the screen (its pictures and three.js load then), draws on a background thread
// where the browser can (earth.worker.ts; else on the page), only while on screen and someone is there (useIdle),
// 30 frames a second at most. A drag turns it; `face` turns it to a place (the app chosen beside it).

type Port = { post: (m: object) => void; stop: () => void };
// M337: it rests while the page scrolls (<html data-scrolling>, as every decorative loop does, M97): reading a WebGL frame
// back for the page took the graphics chip from the scroll on a phone (the landing's only slow scroll frames).
const live = (on: boolean) => on && document.visibilityState === 'visible' && !document.documentElement.hasAttribute('data-scrolling');

export function EarthGlobe({ face, label, className }: { face: Facing | null; label: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), port = useRef<Port | null>(null);
  const [near, setNear] = useState(false), [seen, setSeen] = useState(false), [ready, setReady] = useState(false);
  const idle = useIdle();
  const faceRef = useRef(face);
  useEffect(() => { faceRef.current = face; port.current?.post({ t: 'face', face }); }, [face]);

  // Near the screen: start (once); on screen: draw.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const far = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); far.disconnect(); } }, { rootMargin: '600px 0px' });
    const on = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { rootMargin: '80px 0px' });
    far.observe(el); on.observe(el);
    return () => { far.disconnect(); on.disconnect(); };
  }, []);
  const runRef = useRef(false);
  useEffect(() => { runRef.current = seen && !idle; port.current?.post({ t: 'run', run: live(runRef.current) }); }, [seen, idle]);
  useEffect(() => {
    const vis = () => port.current?.post({ t: 'run', run: live(runRef.current) });
    document.addEventListener('visibilitychange', vis);
    const scrolling = new MutationObserver(vis);
    scrolling.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scrolling'] });
    return () => { document.removeEventListener('visibilitychange', vis); scrolling.disconnect(); };
  }, []);

  useEffect(() => {
    const c = cv.current, el = box.current;
    if (!near || !c || !el) return;
    let stopped = false;
    const dims = () => { const r = c.getBoundingClientRect(); return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)), dpr: Math.min(2, window.devicePixelRatio || 1) }; };
    const d = dims(), still = reducedMotion();
    void import('./earth-scene').then(({ earthPicture, WATER_PICTURE, bitmap, earthScene }) => {
      if (stopped) return;
      const map = new URL(earthPicture(d.w, d.dpr), location.href).href, water = new URL(WATER_PICTURE, location.href).href;
      if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof c.transferControlToOffscreen === 'function') {
        const wk = new Worker(new URL('./earth.worker.ts', import.meta.url));
        const off = c.transferControlToOffscreen();
        wk.onmessage = (e: MessageEvent<{ t: string }>) => { if (e.data.t === 'ready') setReady(true); };
        wk.postMessage({ t: 'init', canvas: off, ...d, still, map, water }, [off]);
        port.current = { post: (m) => wk.postMessage(m), stop: () => wk.terminate() };
      } else {
        // On the page: the same scene, frames from requestAnimationFrame.
        let scene: EarthScene | null = null, run = true, raf = 0, last = 0;
        const loop = (ms: number) => {
          raf = 0;
          if (!scene || !run) return;
          const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
          if (ms - last >= 32 || !last) { last = ms; if (!scene.frame(dt)) { last = 0; return; } }
          raf = requestAnimationFrame(loop);
        };
        const wake = () => { if (!raf && run) raf = requestAnimationFrame(loop); };
        void Promise.all([bitmap(map), bitmap(water).catch(() => null)]).then(([m, w]) => {
          if (stopped) return;
          scene = earthScene({ canvas: c, ...d, still, map: m, water: w });
          scene.face(faceRef.current);
          setReady(true); wake();
        }).catch(() => undefined);
        port.current = {
          post: (m: { t: string; [k: string]: unknown }) => {
            if (!scene) return;
            if (m.t === 'size') scene.size(m.w as number, m.h as number, m.dpr as number);
            else if (m.t === 'drag') scene.drag(m.dx as number, m.dy as number, m.px as number);
            else if (m.t === 'release') scene.release();
            else if (m.t === 'face') scene.face(m.face as Facing | null);
            else if (m.t === 'run') { run = m.run as boolean; if (!run) last = 0; }
            wake();
          },
          stop: () => { if (raf) cancelAnimationFrame(raf); scene?.dispose(); },
        };
      }
      port.current.post({ t: 'face', face: faceRef.current });
      port.current.post({ t: 'run', run: live(runRef.current) });
    });
    const ro = new ResizeObserver(() => port.current?.post({ t: 'size', ...dims() }));
    ro.observe(c);
    return () => { stopped = true; ro.disconnect(); port.current?.stop(); port.current = null; };
  }, [near]);

  // A drag turns it (a mouse, a pen or a finger held on it); a page scroll on a phone still scrolls (touch-action).
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  return (
    <div ref={box} data-no-arrange className={cn('relative select-none', className)}>
      <canvas ref={cv} role="img" aria-label={label}
        className={cn('block aspect-square w-full cursor-grab touch-pan-y transition-opacity duration-700 active:cursor-grabbing', ready ? 'opacity-100' : 'opacity-0')}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const g = drag.current; if (!g || g.id !== e.pointerId) return; port.current?.post({ t: 'drag', dx: e.clientX - g.x, dy: e.clientY - g.y, px: e.currentTarget.clientWidth }); g.x = e.clientX; g.y = e.clientY; }}
        onPointerUp={() => { drag.current = null; port.current?.post({ t: 'release' }); }}
        onPointerCancel={() => { drag.current = null; port.current?.post({ t: 'release' }); }} />
    </div>
  );
}
