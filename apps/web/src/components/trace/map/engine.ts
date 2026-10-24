import { geoGraticule10, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

// The Trace maps' drawing engine (no map service, no tiles): Natural Earth country outlines
// (world-atlas, ISC; public/geo) projected once with Web Mercator into a 1024 × 1024 "base" square
// and kept as Path2D objects. The view is a scale and an offset over that square, so panning and
// zooming never re-project anything: the canvas just draws the same paths under a new transform.

export const BASE = 1024;
const projection = geoMercator().scale(BASE / (2 * Math.PI)).translate([BASE / 2, BASE / 2]).precision(0.2);

/** Longitude/latitude to base coordinates. */
export const toBase = (lng: number, lat: number): [number, number] => projection([lng, Math.max(-84, Math.min(84, lat))]) as [number, number];
/** Base coordinates back to longitude/latitude. */
export const fromBase = (x: number, y: number): [number, number] => projection.invert!([x, y]) as [number, number];

export interface Country { name: string; path: Path2D; box: [number, number, number, number]; label: [number, number]; area: number }
export interface View { x: number; y: number; k: number }

const cache = new Map<string, Promise<Country[]>>();
/** The countries at 1:110m (fast, for the world) or 1:50m (sharper, loaded when zoomed in). */
export function loadWorld(detail: '110m' | '50m'): Promise<Country[]> {
  if (!cache.has(detail)) {
    cache.set(detail, fetch(`/geo/world-${detail}.json`).then((r) => r.json()).then((topo: Topology) => {
      const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name?: string }>);
      const bounds = geoPath(projection);
      return fc.features.filter((f) => f.id !== '010').map((f) => {
        const path = new Path2D();
        geoPath(projection, path as unknown as CanvasRenderingContext2D)(f);
        const [[x0, y0], [x1, y1]] = bounds.bounds(f);
        // The label sits on the country's biggest piece (France's name in France, not off Guiana).
        const parts = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon' as const, coordinates })) : [f.geometry];
        const main = parts.reduce((a, b) => (bounds.area(b) > bounds.area(a) ? b : a));
        return { name: f.properties?.name ?? '', path, box: [x0, y0, x1, y1] as [number, number, number, number], label: bounds.centroid(main) as [number, number], area: bounds.area(main) };
      });
    }));
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
