import { geoGraticule10, geoPath } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { BASE, projection, projectWorld, type WorldShapes } from './world-shapes';

// The Trace maps' drawing engine (no map service, no tiles): Natural Earth country outlines
// (world-atlas, ISC; public/geo) projected once with Web Mercator into a 1024 × 1024 "base" square
// and kept as Path2D objects. The view is a scale and an offset over that square, so panning and
// zooming never re-project anything: the canvas just draws the same paths under a new transform.
// M86: the projecting happens on a background thread (world.worker.ts); the page only replays it.

export { BASE } from './world-shapes';

/** Longitude/latitude to base coordinates. */
export const toBase = (lng: number, lat: number): [number, number] => projection([lng, Math.max(-84, Math.min(84, lat))]) as [number, number];
/** Base coordinates back to longitude/latitude. */
export const fromBase = (x: number, y: number): [number, number] => projection.invert!([x, y]) as [number, number];

export interface Country { name: string; path: Path2D; box: [number, number, number, number]; label: [number, number]; area: number }
export interface View { x: number; y: number; k: number }

/** The outlines worked out on a background thread (or here, where there is none). */
function shapes(url: string): Promise<WorldShapes> {
  const here = () => fetch(url).then((r) => r.json()).then((topo: Topology) => projectWorld(topo));
  if (typeof Worker === 'undefined') return here();
  return new Promise<WorldShapes>((resolve, reject) => {
    const w = new Worker(new URL('./world.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<WorldShapes | { error: string }>) => { w.terminate(); if ('error' in e.data) reject(new Error(e.data.error)); else resolve(e.data); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ url });
  }).catch(here);
}

/** The drawing steps back into one Path2D per country (the same calls d3 makes when it draws). */
function toCountries(s: WorldShapes): Country[] {
  let step = 0, pt = 0;
  return s.names.map((name, i) => {
    const path = new Path2D();
    for (; step < s.ends[i]; step++) {
      const k = s.steps[step];
      if (k === 2) path.closePath();
      else { if (k === 0) path.moveTo(s.points[pt], s.points[pt + 1]); else path.lineTo(s.points[pt], s.points[pt + 1]); pt += 2; }
    }
    return { name, path, box: [s.boxes[i * 4], s.boxes[i * 4 + 1], s.boxes[i * 4 + 2], s.boxes[i * 4 + 3]], label: [s.labels[i * 2], s.labels[i * 2 + 1]], area: s.areas[i] };
  });
}

const cache = new Map<string, Promise<Country[]>>();
/** The countries at 1:110m (fast, for the world) or 1:50m (sharper, loaded when zoomed in). */
export function loadWorld(detail: '110m' | '50m'): Promise<Country[]> {
  if (!cache.has(detail)) {
    const got = shapes(new URL(`/geo/world-${detail}.json`, location.href).href).then(toCountries);
    got.catch(() => cache.delete(detail)); // a failed download can be tried again
    cache.set(detail, got);
  }
  return cache.get(detail)!;
}

let grat: Path2D | null = null;
/** Lines every 10° of latitude and longitude. */
export function graticule() {
  if (!grat) { grat = new Path2D(); geoPath(projection, grat as unknown as CanvasRenderingContext2D)(geoGraticule10()); }
  return grat;
}

/** The view that shows a box of longitudes/latitudes, with padding in screen pixels. */
export function fitView(w: number, h: number, [lng0, lat0, lng1, lat1]: [number, number, number, number], pad = 40): View {
  const [x0, y1] = toBase(lng0, lat0), [x1, y0] = toBase(lng1, lat1);
  const bw = Math.max(1e-3, x1 - x0), bh = Math.max(1e-3, y1 - y0);
  const k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
}

/** Zooms by a factor about a screen point (the point under the cursor stays put). */
export const zoomAbout = (v: View, f: number, px: number, py: number, kMin: number, kMax: number): View => {
  const k = Math.max(kMin, Math.min(kMax, v.k * f)), r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
};

/** Keeps some of the world on screen. */
export function clampView(v: View, w: number, h: number): View {
  const size = BASE * v.k, m = Math.min(w, h) * 0.35;
  const x = size < w ? (w - size) / 2 : Math.min(m, Math.max(w - size - m, v.x));
  const y = size < h ? (h - size) / 2 : Math.min(m, Math.max(h - size - m, v.y));
  return { k: v.k, x, y };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A soft round glow of one colour, drawn once and stamped wherever it's needed (cheaper than gradients per frame). */
const sprites = new Map<string, HTMLCanvasElement>();
export function glow(color: string) {
  if (!sprites.has(color)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, color); grad.addColorStop(0.35, `${color}aa`); grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    sprites.set(color, c);
  }
  return sprites.get(color)!;
}

/** A gentle arc between two screen points (control point lifted off the straight line). */
export function arcPoints(a: [number, number], b: [number, number], lift = 0.18): [number, number, number, number, number, number] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
  return [a[0], a[1], mx - dy * lift, my + dx * lift, b[0], b[1]];
}

/** Point on a quadratic curve at t. */
export const quad = (c: [number, number, number, number, number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * c[0] + 2 * u * t * c[2] + t * t * c[4], u * u * c[1] + 2 * u * t * c[3] + t * t * c[5]];
};
