'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Plane } from '@/lib/aircraft';
import { reducedMotion } from '@/lib/page-transition';
import { usePinchWheel } from '@/lib/use-pinch-wheel';
import { cn } from '@/lib/utils';
import { useLiveCanvas, type Frame } from './canvas';
import { MASK, drawPlanet, landLookup, planetLinks, planetPoints, planetState, type Place } from './planet-paint';

export type { Place } from './planet-paint';

// The planet (M52, after the owner's "Orbit" video and the "Globynk" picture): a globe of a few
// thousand dots on a jittered Fibonacci lattice (even, with no visible spiral), brighter where there is
// land (Natural Earth, the Trace maps' outlines, loaded after the page), lit from the top left with an
// Aqua Jade atmosphere, a teal light inside and a glint on its rim, the far side faintly showing
// through. A net of fine triangles covers it (M55, like the "Globynk" globe) with pink sparks at a few
// knots; Baby Pink arcs rise between the places, light running along them; small ripples land on it
// now and then. It turns slowly; the pointer leans it. Labels are pills on the canvas, the
// places are also a list for screen readers. Draws only while on screen (useLiveCanvas).
// M85: the planets you only look at (the hub's, the landing's) are drawn on a background thread
// where the browser can (planet.worker.ts); the globe you turn (Trace's Live globe) and browsers
// without it draw on the page. The drawing is the same code either way (planet-paint.ts).

/** The labels' font file (globals.css @font-face): a background thread loads its own copy (by its
 *  full address: a thread's own address may not be a web page's). */
const URBANIST = '/fonts/urbanist/urbanist-latin.woff2';

let landOnce: Promise<Uint8Array> | null = null;
/** Where the land is (once per visit): the Trace maps' country outlines drawn into a small picture,
 *  one byte a pixel (planet-paint.ts looks places up in it). */
function landBits(): Promise<Uint8Array> {
  landOnce ??= (async () => {
    const { loadWorld, BASE } = await import('@/components/trace/map/engine');
    const world = await loadWorld('110m');
    const k = MASK / BASE;
    const c = document.createElement('canvas');
    c.width = c.height = MASK;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.scale(k, k);
    g.fillStyle = '#fff';
    for (const country of world) g.fill(country.path);
    const px = g.getImageData(0, 0, MASK, MASK).data;
    const bits = new Uint8Array(MASK * MASK);
    for (let i = 0; i < bits.length; i++) bits[i] = px[i * 4 + 3] > 100 ? 1 : 0;
    return bits;
  })().catch((e: unknown) => { landOnce = null; throw e; });
  return landOnce;
}

interface PlanetProps {
  places: Place[];
  /** M69: many small moving dots (planes), moved along their track at their speed from `at`. */
  swarm?: { planes: Plane[]; at: number } | null;
  /** M67 (Trace's Live globe): a globe to use, not only look at. Drag to turn it, pinch / ctrl + scroll
   *  / buttons to zoom; it turns to `focus` (smoothly, the short way); no net or sparks over the land;
   *  only `selected` places (and the one pointed at) carry a name; `onPick` hears a click on a place. */
  interactive?: boolean;
  focus?: { lat: number; lon: number } | null;
  selected?: number[];
  onPick?: (i: number) => void;
  /** Pairs of indexes into places joined by an arc (default: each place to the next, in a ring). */
  arcs?: [number, number][];
  label: string;
  className?: string;
  /** Small ripples landing now and then (events arriving). */
  pings?: boolean;
}

export function Planet(props: PlanetProps) {
  // The background thread said no (or the browser has none): draw on the page instead.
  const [onPage, setOnPage] = useState(false);
  return props.interactive || onPage ? <PagePlanet {...props} /> : <WorkerPlanet {...props} onFail={setOnPage} />;
}

/** The look-only planet, drawn on a background thread. */
function WorkerPlanet({ places, arcs, label, className, pings = true, onFail }: PlanetProps & { onFail: (onPage: boolean) => void }) {
  const host = useRef<HTMLSpanElement>(null);
  const worker = useRef<Worker | null>(null);
  // The hub makes a new list on every render: send the places only when they really change.
  const key = JSON.stringify([places, arcs ?? null]);
  const shown = useMemo(() => JSON.parse(key) as [Place[], [number, number][] | null], [key]);
  const latest = useRef(shown);
  const land = useRef<Uint8Array | null>(null);
  useEffect(() => {
    latest.current = shown;
    worker.current?.postMessage({ t: 'places', places: shown[0], arcs: shown[1] ?? undefined });
  }, [shown]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas each time: one handed to a background thread can't be handed over again.
    const cv = document.createElement('canvas');
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof cv.transferControlToOffscreen !== 'function') { queueMicrotask(() => onFail(true)); return; }
    cv.className = 'absolute inset-0 h-full w-full touch-pan-y';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', label);
    box.appendChild(cv);
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    let wk: Worker;
    try {
      wk = new Worker(new URL('./planet.worker.ts', import.meta.url));
      const off = cv.transferControlToOffscreen();
      const [ps, pa] = latest.current;
      wk.postMessage({ t: 'init', canvas: off, still: reducedMotion(), gap: window.matchMedia?.('(hover: none)').matches ? 30 : 0, pings, places: ps, arcs: pa ?? undefined, bits: land.current, font: new URL(URBANIST, location.href).href }, [off]);
    } catch {
      cv.remove();
      queueMicrotask(() => onFail(true));
      return;
    }
    worker.current = wk;
    wk.onmessage = (e: MessageEvent<{ t: string }>) => { if (e.data?.t === 'unsupported') onFail(true); };
    wk.onerror = () => onFail(true);
    let live = true;
    landBits().then((bits) => { land.current = bits; if (live) wk.postMessage({ t: 'land', bits }); }).catch(() => { /* no land: an even planet */ });
    // Its layout size, as on the page (useLiveCanvas): not mid-way through the page's entrance.
    const ro = new ResizeObserver(([e]) => wk.postMessage({ t: 'size', w: e.contentRect.width, h: e.contentRect.height, dpr: dpr() }));
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => wk.postMessage({ t: 'seen', seen: e.isIntersecting }));
    io.observe(cv);
    const onVisible = () => wk.postMessage({ t: 'hidden', hidden: document.hidden });
    const move = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); wk.postMessage({ t: 'pointer', x: e.clientX - b.left, y: e.clientY - b.top }); };
    const leave = () => wk.postMessage({ t: 'leave' });
    document.addEventListener('visibilitychange', onVisible);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerleave', leave);
    return () => {
      live = false;
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      wk.terminate();
      worker.current = null;
      cv.remove();
    };
  }, [pings, label, onFail]);

  return (
    <div className={cn('relative', className)}>
      <span ref={host} className="contents" />
      {places.length > 0 && (
        <ul className="sr-only">
          {places.map((p, i) => <li key={`${p.label}-${i}`}>{p.value ? `${p.label}: ${p.value}` : p.label}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The planet drawn on the page: the globe you turn, and browsers without background drawing. */
function PagePlanet({ places, arcs, label, className, pings = true, interactive = false, focus = null, selected, onPick, swarm }: PlanetProps) {
  const [land, setLand] = useState<((lat: number, lon: number) => boolean) | null>(null);
  useEffect(() => {
    let live = true;
    landBits().then((bits) => { if (live) { const f = landLookup(bits); setLand(() => f); } }).catch(() => { /* no land: an even planet */ });
    return () => { live = false; };
  }, []);
  const pts = useMemo(() => planetPoints(places), [places]);
  const links = useMemo(() => planetLinks(places, arcs), [arcs, places]);
  const st = useRef(planetState());
  const [wake, setWake] = useState(0);
  const ref = useLiveCanvas((f: Frame) => drawPlanet(st.current, f, { pts, links, land, interactive, focus, selected, pings, swarm }, Math.min(2, window.devicePixelRatio || 1)), `${String(!!land)}${wake}`);

  // Turning it by hand, zooming, picking a place (interactive only).
  const down = useRef<{ x: number; y: number; moved: number; id: number } | null>(null);
  const zoomBy = (f: number) => { const s = st.current; s.tz = Math.max(1, Math.min(3.2, s.tz * f)); setWake((n) => n + 1); };
  const handlers = interactive ? {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { if ((e.target as HTMLElement).closest('button')) return; down.current = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = down.current, s = st.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy); d.x = e.clientX; d.y = e.clientY;
      if (d.moved < 4) return;
      if (!s.drag) e.currentTarget.setPointerCapture(e.pointerId);
      // A finger turns it sideways only (the page still scrolls up and down); a mouse both ways.
      const k = 1 / Math.max(80, s.r * s.zoom);
      s.drag = true; s.cy -= dx * k;
      if (e.pointerType === 'mouse') s.cp = Math.max(-1.2, Math.min(1.2, s.cp + dy * k));
      s.idleAt = s.lastT + 5;
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = down.current, s = st.current;
      down.current = null;
      if (!d || d.moved >= 4 || !onPick) { setWake((n) => n + 1); return; }
      const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = 18, pick = -1;
      for (let i = 0; i < s.xy.length / 2; i++) { const dd = Math.hypot(s.xy[i * 2] - x, s.xy[i * 2 + 1] - y); if (dd < best) { best = dd; pick = i; } }
      if (pick >= 0) onPick(pick);
    },
  } : {};
  const box = useRef<HTMLDivElement>(null);
  usePinchWheel(box, (e) => zoomBy(Math.exp(-e.deltaY * 0.01)), interactive);

  return (
    <div ref={box} className={cn('relative', interactive && 'cursor-grab active:cursor-grabbing select-none', className)} {...handlers}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full touch-pan-y" />
      {interactive && (
        <div className="absolute end-3 bottom-3 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomBy(1.35)} className="w-9 h-9 grid place-items-center rounded-full bg-[#171f44]/85 text-white ring-1 ring-white/15 hover:bg-[#232d5c]" aria-label="Zoom in on the globe"><Plus className="w-4 h-4" aria-hidden /></button>
          <button type="button" onClick={() => zoomBy(1 / 1.35)} className="w-9 h-9 grid place-items-center rounded-full bg-[#171f44]/85 text-white ring-1 ring-white/15 hover:bg-[#232d5c]" aria-label="Zoom out of the globe"><Minus className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
      {places.length > 0 && (
        <ul className="sr-only">
          {places.map((p, i) => <li key={`${p.label}-${i}`}>{p.value ? `${p.label}: ${p.value}` : p.label}</li>)}
        </ul>
      )}
    </div>
  );
}
