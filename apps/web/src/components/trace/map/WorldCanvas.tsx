'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { BASE, clampView, easeInOut, fitView, fromBase, graticule, loadWorld, toBase, zoomAbout, type Country, type View } from './engine';
import { CITIES } from './cities';

// One canvas world map for the Trace maps: draws the land (cached until the view moves), then hands
// the frame to the page to draw its own layer on top. Drag, wheel, pinch, double-click and the
// keyboard move it; zooming eases toward its target and fly-tos glide (zooming out a little on long
// trips), so it never jumps. Frames run only while something moves, unless the page asks for `live`
// frames (its pulses); a hidden tab gets none.

export type Box = [number, number, number, number]; // west, south, east, north
export interface Frame {
  ctx: CanvasRenderingContext2D; w: number; h: number; view: View; t: number; dark: boolean; zoom: number;
  /** Longitude/latitude to screen pixels. */
  at: (lng: number, lat: number) => [number, number];
}
export interface MapHandle {
  flyTo: (box: Box, opts?: { pad?: number; maxZoom?: number }) => void;
  zoomBy: (f: number) => void;
  home: () => void;
  /** Draw one frame now (the page's data changed). */
  redraw: () => void;
}

const PAL = {
  light: { sea: '#e9eef1', deep: '#dfe6ea', land: '#fbfcfc', edge: '#c3cdd3', grat: 'rgba(37,55,69,0.07)', name: 'rgba(37,55,69,0.42)', city: 'rgba(37,55,69,0.6)' },
  dark: { sea: '#0a1721', deep: '#07111a', land: '#172a38', edge: '#2a4153', grat: 'rgba(204,208,207,0.05)', name: 'rgba(204,208,207,0.36)', city: 'rgba(204,208,207,0.55)' },
};
const K_MAX = 180; // about street-block level (0.1° ≈ 50 px)
let cityPts: { name: string; bx: number; by: number; rank: number }[] | null = null;
const cities = () => (cityPts ??= CITIES.map(([name, lat, lng, rank]) => { const [bx, by] = toBase(lng, lat); return { name, bx, by, rank }; }));
const CITY_ZOOM = [0, 2.2, 4.5, 9];

interface Props {
  label: string;
  homeBox: Box;
  dark: boolean;
  live: boolean;
  draw: (f: Frame) => void;
  /** A point under the pointer (hover) or tapped (click); null when the pointer leaves. */
  onPoint?: (p: { x: number; y: number } | null, kind: 'hover' | 'click') => void;
  /** City names the page labels itself (the base map leaves them out). */
  skipCities?: Set<string>;
  /** false: a picture that moves by itself (no dragging or wheel zoom, e.g. on the landing page). */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}

interface Live { draw: Props['draw']; onPoint: Props['onPoint']; live: boolean; dark: boolean; homeBox: Box; skipCities?: Set<string> }
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The map's state and its frame loop, outside React (React only hands it the latest props). */
class MapEngine {
  w = 0; h = 0; dpr = 1; kMin = 0.5;
  view: View = { x: 0, y: 0, k: 1 };
  target: View | null = null;
  fly: null | { from: View; to: View; start: number; dur: number } = null;
  drift = { vx: 0, vy: 0 };
  raf = 0; last = 0; visible = true; placed = false;
  land: HTMLCanvasElement | null = null; landKey = '';
  world: Country[] = []; detail: '110m' | '50m' = '110m';
  private off: (() => void)[] = [];

  constructor(private el: HTMLDivElement, private canvas: HTMLCanvasElement, private p: { current: Live }, interactive: boolean) {
    const ro = new ResizeObserver(() => this.size());
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting && !document.hidden; this.kick(); });
    io.observe(el);
    const vis = () => { this.visible = !document.hidden; this.kick(); };
    document.addEventListener('visibilitychange', vis);
    this.off.push(() => ro.disconnect(), () => io.disconnect(), () => document.removeEventListener('visibilitychange', vis));
    this.useWorld('110m');
    if (interactive) this.listen();
  }

  destroy() { this.off.forEach((f) => f()); cancelAnimationFrame(this.raf); this.raf = 0; }

  private useWorld(detail: '110m' | '50m') {
    this.detail = detail;
    void loadWorld(detail).then((w) => { if (this.detail === detail) { this.world = w; this.landKey = ''; this.kick(); } });
  }

  private size() {
    // The layout size, not getBoundingClientRect: a page's entrance animation scales it for a moment,
    // and a map measured then stayed too small and zoomed in.
    const r = { width: this.el.clientWidth, height: this.el.clientHeight };
    if (!r.width || !r.height) return;
    const prev = { w: this.w, h: this.h };
    this.w = r.width; this.h = r.height; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.kMin = Math.max(this.w / BASE, (Math.min(this.w, this.h) / BASE) * 0.9) * 0.98;
    if (!this.placed) { this.view = clampView(fitView(this.w, this.h, this.p.current.homeBox, 24), this.w, this.h); this.placed = true; }
    else this.view = clampView({ ...this.view, x: this.view.x + (this.w - prev.w) / 2, y: this.view.y + (this.h - prev.h) / 2 }, this.w, this.h);
    this.landKey = '';
    this.kick();
  }

  // ─── Frames ───
  kick = () => { if (!this.raf && this.visible && this.w) this.raf = requestAnimationFrame(this.frame); };

  private frame = (t: number) => {
    this.raf = 0;
    const dt = this.last ? Math.min(64, t - this.last) : 16;
    this.last = t;
    let moving = true;
    if (this.fly) {
      const p = Math.min(1, (t - this.fly.start) / this.fly.dur), e = easeInOut(p), { from, to } = this.fly;
      // Glide the centre (in map units) while the zoom changes on a log scale, lifting out a bit mid-trip.
      const c0 = [(this.w / 2 - from.x) / from.k, (this.h / 2 - from.y) / from.k], c1 = [(this.w / 2 - to.x) / to.k, (this.h / 2 - to.y) / to.k];
      const dist = (Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) * Math.min(from.k, to.k)) / Math.max(this.w, this.h);
      const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e) / (1 + Math.min(1.6, dist * 0.9) * Math.sin(Math.PI * e));
      const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      this.view = { k, x: this.w / 2 - cx * k, y: this.h / 2 - cy * k };
      if (p >= 1) { this.fly = null; this.view = to; }
    } else if (this.target) {
      const a = 1 - Math.exp(-dt / 70), v = this.view, g = this.target;
      this.view = { k: v.k + (g.k - v.k) * a, x: v.x + (g.x - v.x) * a, y: v.y + (g.y - v.y) * a };
      if (Math.abs(g.k - v.k) / g.k < 0.0015 && Math.abs(g.x - v.x) < 0.3 && Math.abs(g.y - v.y) < 0.3) { this.view = g; this.target = null; }
    } else if (Math.abs(this.drift.vx) + Math.abs(this.drift.vy) > 0.02) {
      this.view = clampView({ ...this.view, x: this.view.x + this.drift.vx * dt, y: this.view.y + this.drift.vy * dt }, this.w, this.h);
      const f = Math.exp(-dt / 260);
      this.drift.vx *= f; this.drift.vy *= f;
    } else moving = false;
    if (this.view.k > 3.2 && this.detail === '110m') this.useWorld('50m');
    if (this.view.k < 2.4 && this.detail === '50m') this.useWorld('110m');
    this.paint(t);
    if ((moving || this.p.current.live) && this.visible) this.raf = requestAnimationFrame(this.frame);
    else this.last = 0;
  };

  private paintLand() {
    const { w, h, dpr, view } = this, dark = this.p.current.dark, pal = dark ? PAL.dark : PAL.light;
    const skip = this.p.current.skipCities;
    const key = `${w}x${h}@${dpr}|${view.x.toFixed(2)},${view.y.toFixed(2)},${view.k.toFixed(5)}|${dark}|${this.world.length}|${skip?.size ?? 0}`;
    if (key === this.landKey && this.land) return this.land;
    const land = this.land ?? document.createElement('canvas');
    land.width = Math.round(w * dpr); land.height = Math.round(h * dpr);
    const g = land.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sea = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    sea.addColorStop(0, pal.sea); sea.addColorStop(1, pal.deep);
    g.fillStyle = sea; g.fillRect(0, 0, w, h);
    g.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
    g.strokeStyle = pal.grat; g.lineWidth = 1 / view.k;
    g.stroke(graticule());
    // Only the countries on screen.
    const x0 = -view.x / view.k, y0 = -view.y / view.k, x1 = (w - view.x) / view.k, y1 = (h - view.y) / view.k;
    const shown = this.world.filter((c) => c.box[2] >= x0 && c.box[0] <= x1 && c.box[3] >= y0 && c.box[1] <= y1);
    g.fillStyle = pal.land;
    g.shadowColor = dark ? 'rgba(0,0,0,0.35)' : 'rgba(37,55,69,0.10)';
    g.shadowBlur = 6 * dpr; g.shadowOffsetY = 1.5 * dpr;
    for (const c of shown) g.fill(c.path);
    g.shadowColor = 'transparent';
    g.strokeStyle = pal.edge; g.lineWidth = 0.7 / view.k; g.lineJoin = 'round';
    for (const c of shown) g.stroke(c.path);
    // Country names once there's room for them, biggest first, never overlapping.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = pal.name; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '1.2px';
    const taken: [number, number, number, number][] = [[w / 2 - 70, 0, w / 2 + 70, 30]]; // the scale bar
    for (const c of [...shown].sort((a, b) => b.area - a.area)) {
      const px = c.area * view.k * view.k;
      if (px < 2200 || !c.name) continue;
      const size = Math.min(13, 8 + Math.log10(px) * 0.9);
      g.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
      const text = c.name.toUpperCase(), tw = g.measureText(text).width;
      const lx = view.x + c.label[0] * view.k, ly = view.y + c.label[1] * view.k;
      const r: [number, number, number, number] = [lx - tw / 2 - 4, ly - size, lx + tw / 2 + 4, ly + size];
      if (taken.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      taken.push(r);
      g.fillText(text, lx, ly);
    }
    g.letterSpacing = '0px';
    // Cities for orientation, the biggest first as you zoom in.
    const zoom = view.k / this.kMin;
    g.textAlign = 'left';
    g.font = '500 10px ui-sans-serif, system-ui, sans-serif';
    for (const c of cities()) {
      if (zoom < CITY_ZOOM[c.rank] || skip?.has(c.name)) continue;
      const x = view.x + c.bx * view.k, y = view.y + c.by * view.k;
      if (x < -40 || x > w + 40 || y < -10 || y > h + 10) continue;
      const tw = g.measureText(c.name).width;
      const r: [number, number, number, number] = [x - 3, y - 7, x + 6 + tw, y + 7];
      if (taken.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue;
      taken.push(r);
      g.fillStyle = pal.city;
      g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
      g.fillText(c.name, x + 5, y + 0.5);
    }
    this.land = land; this.landKey = key;
    return land;
  }

  private paint(t: number) {
    const ctx = this.canvas.getContext('2d')!, { w, h, dpr, view } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.paintLand(), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const at = (lng: number, lat: number): [number, number] => { const [bx, by] = toBase(lng, lat); return [view.x + bx * view.k, view.y + by * view.k]; };
    this.p.current.draw({ ctx, w, h, view, t, dark: this.p.current.dark, zoom: view.k / this.kMin, at });
    if (view.k / this.kMin >= 3) this.scaleBar(ctx);
  }

  /** A distance scale at the top, true at the middle of the view. */
  private scaleBar(ctx: CanvasRenderingContext2D) {
    const { w, view } = this, dark = this.p.current.dark;
    const lat = fromBase((w / 2 - view.x) / view.k, (this.h / 2 - view.y) / view.k)[1];
    const mpp = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (BASE * view.k);
    const raw = mpp * 90, p10 = 10 ** Math.floor(Math.log10(raw)), nice = [5, 2, 1].map((m) => m * p10).find((v) => v <= raw) ?? p10;
    const px = nice / mpp, x = Math.round(w / 2 - px / 2), y = 20;
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(242,244,244,0.75)' : 'rgba(6,20,27,0.7)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4); ctx.stroke();
    ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x + px / 2, y - 7);
    ctx.restore();
  }

  // ─── Moving it ───
  goTo(v: View, smooth = true) {
    const k = Math.max(this.kMin, Math.min(K_MAX, v.k));
    const to = clampView({ k, x: this.w / 2 - ((this.w / 2 - v.x) / v.k) * k, y: this.h / 2 - ((this.h / 2 - v.y) / v.k) * k }, this.w, this.h);
    this.drift = { vx: 0, vy: 0 }; this.target = null;
    if (smooth && !reduced()) {
      const far = Math.abs(Math.log(to.k / this.view.k)) + Math.hypot(to.x - this.view.x, to.y - this.view.y) / Math.max(this.w, this.h);
      this.fly = { from: this.view, to, start: performance.now(), dur: Math.min(1600, 650 + far * 260) };
    } else { this.fly = null; this.view = to; }
    this.kick();
  }
  zoomAt(f: number, px: number, py: number) {
    this.fly = null; this.drift = { vx: 0, vy: 0 };
    this.target = clampView(zoomAbout(this.target ?? this.view, f, px, py, this.kMin, K_MAX), this.w, this.h);
    this.kick();
  }
  flyTo(box: Box, opts?: { pad?: number; maxZoom?: number }) {
    const v = fitView(this.w, this.h, box, opts?.pad ?? 60);
    const k = Math.min(v.k, opts?.maxZoom ? this.kMin * opts.maxZoom : K_MAX);
    this.goTo({ k, x: this.w / 2 - ((this.w / 2 - v.x) / v.k) * k, y: this.h / 2 - ((this.h / 2 - v.y) / v.k) * k });
  }
  home() { this.goTo(fitView(this.w, this.h, this.p.current.homeBox, 24)); }

  private listen() {
    const el = this.el, pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null, moved = false, pinch = 0;
    let lastMove = { x: 0, y: 0, t: 0, vx: 0, vy: 0 };
    const local = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(), sx = el.clientWidth / (r.width || 1), sy = el.clientHeight / (r.height || 1); return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }; };
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      this.off.push(() => el.removeEventListener(type, fn));
    };

    on('wheel', (e) => {
      e.preventDefault();
      const p = local(e), d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomAt(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y);
    }, { passive: false });
    on('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      this.fly = null; this.target = null; this.drift = { vx: 0, vy: 0 };
      if (pts.size === 1) { start = p; moved = false; lastMove = { x: p.x, y: p.y, t: performance.now(), vx: 0, vy: 0 }; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
    });
    on('pointermove', (e) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) { this.p.current.onPoint?.(p, 'hover'); return; }
      const prev = pts.get(e.pointerId)!;
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const v = zoomAbout(this.view, pinch ? d / pinch : 1, mid.x, mid.y, this.kMin, K_MAX);
        this.view = clampView({ ...v, x: v.x + (p.x - prev.x) / 2, y: v.y + (p.y - prev.y) / 2 }, this.w, this.h);
        pinch = d;
        this.kick();
        return;
      }
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 4) moved = true;
      if (!moved) return;
      this.view = clampView({ ...this.view, x: this.view.x + p.x - prev.x, y: this.view.y + p.y - prev.y }, this.w, this.h);
      const now = performance.now(), dt = Math.max(1, now - lastMove.t);
      lastMove = { x: p.x, y: p.y, t: now, vx: 0.8 * ((p.x - lastMove.x) / dt) + 0.2 * lastMove.vx, vy: 0.8 * ((p.y - lastMove.y) / dt) + 0.2 * lastMove.vy };
      el.style.cursor = 'grabbing';
      this.kick();
    });
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.delete(e.pointerId);
      el.style.cursor = '';
      if (pts.size === 1) { start = [...pts.values()][0]; pinch = 0; return; }
      if (pts.size) return;
      if (!moved && start) this.p.current.onPoint?.(p, 'click');
      else if (performance.now() - lastMove.t < 60 && !reduced()) { this.drift = { vx: lastMove.vx, vy: lastMove.vy }; this.kick(); }
      start = null; pinch = 0;
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('pointerleave', () => { if (!pts.size) this.p.current.onPoint?.(null, 'hover'); });
    on('dblclick', (e) => { const p = local(e); this.zoomAt(2.2, p.x, p.y); });
    on('keydown', (e) => {
      const pan = (dx: number, dy: number) => { const v = this.target ?? this.view; this.fly = null; this.target = clampView({ ...v, x: v.x + dx, y: v.y + dy }, this.w, this.h); this.kick(); };
      const acts: Record<string, () => void> = {
        '+': () => this.zoomAt(1.6, this.w / 2, this.h / 2), '=': () => this.zoomAt(1.6, this.w / 2, this.h / 2), '-': () => this.zoomAt(1 / 1.6, this.w / 2, this.h / 2),
        ArrowLeft: () => pan(80, 0), ArrowRight: () => pan(-80, 0), ArrowUp: () => pan(0, 80), ArrowDown: () => pan(0, -80), '0': () => this.home(),
      };
      if (acts[e.key]) { e.preventDefault(); acts[e.key](); }
    });
  }
}

export const WorldCanvas = forwardRef<MapHandle, Props>(function WorldCanvas({ label, homeBox, dark, live, draw, onPoint, skipCities, interactive = true, className, children }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const latest = useRef<Live>({ draw, onPoint, live, dark, homeBox, skipCities });
  useEffect(() => { latest.current = { draw, onPoint, live, dark, homeBox, skipCities }; engine.current?.kick(); });
  useEffect(() => {
    const e = new MapEngine(wrap.current!, canvas.current!, latest, interactive);
    engine.current = e;
    return () => { e.destroy(); engine.current = null; };
  }, [interactive]);
  useEffect(() => { if (engine.current) { engine.current.landKey = ''; engine.current.kick(); } }, [dark]);
  useImperativeHandle(ref, () => ({
    flyTo: (box, opts) => engine.current?.flyTo(box, opts),
    zoomBy: (f) => engine.current?.zoomAt(f, (engine.current?.w ?? 0) / 2, (engine.current?.h ?? 0) / 2),
    home: () => engine.current?.home(),
    redraw: () => engine.current?.kick(),
  }), []);

  return (
    <div className={className} style={{ position: 'relative' }}>
      {interactive ? (
        <div
          ref={wrap}
          tabIndex={0}
          role="application"
          aria-label={`${label}. Drag or use the arrow keys to move, plus and minus to zoom, 0 to see everything.`}
          className="absolute inset-0 touch-none select-none cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 rounded-[inherit] overflow-hidden"
        >
          <canvas ref={canvas} aria-hidden className="block w-full h-full" />
        </div>
      ) : (
        <div ref={wrap} role="img" aria-label={label} className="absolute inset-0 rounded-[inherit] overflow-hidden">
          <canvas ref={canvas} aria-hidden className="block w-full h-full" />
        </div>
      )}
      {children}
    </div>
  );
});
