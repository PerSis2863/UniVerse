'use client';

import { useEffect, useEffectEvent, useImperativeHandle, useMemo, useReducer, useRef, useState, type Ref } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { bandColors, bandPaths, levels, legendNum, BANDS } from '@/lib/sim/contour';
import type { Edge, Part, Pt } from '@/lib/sim/part';
import type { Load, Support } from '@/lib/sim/structure';
import type { MeshOut } from './sim.worker';

// Hyperion Simulate (M404): the graphics window. The part (light grey), its mesh, the result in bands of colour on the
// bent shape, the supports (blue) and loads (red) where they act, the largest and smallest values flagged. Wheel or the
// buttons zoom, dragging moves it, a press on an edge picks it, the pointer reads the value under it.

export interface SimView { png: () => Promise<Blob | null> }
/** What is drawn on the part: how it moves (mm, or a mode's shape) and a value per node in colour. */
export interface Shown {
  ux: Float64Array; uy: Float64Array; values: Float64Array; name: string; unit: string;
  /** Low is the danger (a safety factor): the colours turn round. */
  reverse?: boolean;
  /** A vibration mode: it swings both ways when animated, and isn't drawn at true size. */
  swing?: boolean;
}
interface Props {
  part: Part; edges: Edge[]; mesh: MeshOut | null; shown: Shown | null;
  deform: 'auto' | 'true' | 'none'; showMesh: boolean; playing: boolean;
  supports: Support[]; loads: Load[]; chosen: string[]; picking: boolean; onPick: (edgeId: string) => void;
  /** Plain coloured edges with a letter (Heat's conditions, M407). */
  marks?: { id: string; edges: string[]; colour: string; letter: string }[];
  dark: boolean; label: string; ref?: Ref<SimView>;
}

/** Each edge as points along it (a circle as 72). */
function edgeLines(part: Part, edges: Edge[]): Map<string, Pt[]> {
  const loops = [part.outer, ...part.holes], out = new Map<string, Pt[]>();
  for (const e of edges) {
    const l = loops[e.loop];
    if (l.kind === 'circle') out.set(e.id, Array.from({ length: 73 }, (_, k) => [l.c[0] + l.r * Math.cos((k * Math.PI) / 36), l.c[1] + l.r * Math.sin((k * Math.PI) / 36)] as Pt));
    else out.set(e.id, [l.pts[e.seg!], l.pts[(e.seg! + 1) % l.pts.length]]);
  }
  return out;
}
const distSeg = (px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

export function SimCanvas({ part, edges, mesh, shown, deform, showMesh, playing, supports, loads, marks = [], chosen, picking, onPick, dark, label, ref }: Props) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ s: 1, ox: 0, oy: 0, fitted: '' });
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The value under the pointer is written straight into its label (no redraw for it).
  const tip = useRef<HTMLDivElement>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const phase = useRef(1);
  const swing = !!shown?.swing;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const lineMap = useMemo(() => edgeLines(part, edges), [part, edges]);
  const lines = { current: lineMap };

  const values = shown?.values ?? null, result = shown;
  const fieldInfo = { name: shown?.name ?? '', unit: shown?.unit ?? '' };
  const maxU = useMemo(() => { if (!shown) return 0; let m = 0; for (let i = 0; i < shown.ux.length; i++) m = Math.max(m, Math.hypot(shown.ux[i], shown.uy[i])); return m; }, [shown]);
  const xs = part.outer.kind === 'poly' ? part.outer.pts.map((p) => p[0]) : [0], ys = part.outer.kind === 'poly' ? part.outer.pts.map((p) => p[1]) : [0];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const autoScale = maxU > 0 ? (0.07 * span) / maxU : 1;
  const scale = !result || deform === 'none' ? 0 : deform === 'true' && !shown?.swing ? 1 : autoScale;

  // A narrow window gets the legend as a strip along the bottom; a wide one beside the part.
  const compact = size.w < 560;
  // Fit the part in view (beside the legend) when it first shows and when its size changes a lot.
  const fit = () => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const left = values && !compact ? 190 : 0, bottom = values && compact ? 52 : 0, top = 44;
    const W = size.w - left, H = size.h - bottom - top;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 0.1;
    const s = Math.min(W / ((x1 - x0) * (1 + 2 * pad) || 1), H / ((y1 - y0) * (1 + 2 * pad) || 1));
    view.current = { ...view.current, s, ox: left + W / 2 - ((x0 + x1) / 2) * s, oy: top + H / 2 + ((y0 + y1) / 2) * s };
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useEffectEvent(() => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const key = `${part.outer.kind === 'poly' ? part.outer.pts.length : 0}:${Math.round(span)}:${size.w}x${size.h}:${!!values}`;
    if (view.current.fitted !== key) { fit(); view.current.fitted = key; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(size.w * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const { s, ox, oy } = view.current, X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s;
    const ink = dark ? '#e4e4e7' : '#27272a', grey = dark ? '#52525b' : '#c9ccd3', lineCol = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
    const k = scale * (playing ? phase.current : 1);
    if (mesh) {
      const n = mesh.x.length, sx = new Float32Array(n), sy = new Float32Array(n);
      for (let i = 0; i < n; i++) { sx[i] = X(mesh.x[i] + (result ? k * result.ux[i] : 0)); sy[i] = Y(mesh.y[i] + (result ? k * result.uy[i] : 0)); }
      if (values) {
        const lv = levels(Math.min(...values), Math.max(...values)), cols = bandColors(shown?.reverse);
        bandPaths(mesh.tri, sx, sy, values, lv).forEach((p, b) => { g.fillStyle = cols[b]; g.fill(p); g.strokeStyle = cols[b]; g.lineWidth = 0.6; g.stroke(p); });
      } else {
        const p = new Path2D();
        for (let e = 0; e < mesh.tri.length; e += 6) { const t = mesh.tri; p.moveTo(sx[t[e]], sy[t[e]]); p.lineTo(sx[t[e + 1]], sy[t[e + 1]]); p.lineTo(sx[t[e + 2]], sy[t[e + 2]]); p.closePath(); }
        g.fillStyle = grey; g.fill(p);
      }
      if (showMesh) {
        const p = new Path2D(), t = mesh.tri;
        for (let e = 0; e < t.length; e += 6) {
          // Each side through its middle node (a curved side stays curved).
          const a = t[e], b = t[e + 1], cc = t[e + 2], ab = t[e + 3], bc = t[e + 4], ca = t[e + 5];
          p.moveTo(sx[a], sy[a]); p.lineTo(sx[ab], sy[ab]); p.lineTo(sx[b], sy[b]); p.lineTo(sx[bc], sy[bc]); p.lineTo(sx[cc], sy[cc]); p.lineTo(sx[ca], sy[ca]); p.closePath();
        }
        g.strokeStyle = lineCol; g.lineWidth = 0.6; g.stroke(p);
      }
    }
    // The outline as it was (dashed when the shape shown is bent).
    g.setLineDash(k > 0 ? [5, 4] : []);
    g.strokeStyle = ink; g.lineWidth = k > 0 ? 1 : 1.4;
    for (const pts of lines.current.values()) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); }
    g.setLineDash([]);
    // Chosen and hovered edges.
    const mark = (id: string, colour: string, w: number) => { const pts = lines.current.get(id); if (!pts) return; g.strokeStyle = colour; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); };
    // Supports: blue, with short hatches outside (fixed) or small rollers (sliding).
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let letter = 0;
    const badge = (x: number, y: number, text: string, bg: string) => {
      g.font = '600 11px Inter, system-ui, sans-serif';
      const w = g.measureText(text).width + 10;
      g.fillStyle = bg; g.beginPath(); g.roundRect(x - w / 2, y - 9, w, 18, 5); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
    };
    for (const sp of supports) {
      const L = letters[letter++ % 26];
      let at: Pt | null = null;
      for (const id of sp.edges) {
        const pts = lines.current.get(id);
        if (!pts) continue;
        mark(id, '#2563eb', 4);
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay) * s, nx = (by - ay) * s / len, ny = (bx - ax) * s / len;
          const steps = Math.max(1, Math.floor(len / 9));
          g.strokeStyle = '#2563eb'; g.lineWidth = 1.2;
          for (let q = 0; q <= steps; q++) {
            const px = X(ax + ((bx - ax) * q) / steps), py = Y(ay + ((by - ay) * q) / steps);
            if (sp.kind === 'fixed') { g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * 7 + ny * 4, py + ny * 7 - nx * 4); g.stroke(); }
            else if (q % 2 === 0) { g.beginPath(); g.arc(px + nx * 4, py + ny * 4, 3, 0, 2 * Math.PI); g.stroke(); }
          }
        }
        if (!at) at = pts[Math.floor(pts.length / 2)];
      }
      if (at) badge(X(at[0]), Y(at[1]) - 16, L, '#2563eb');
    }
    // Loads: red arrows.
    const arrow = (x: number, y: number, dx: number, dy: number, len: number) => {
      const ex = x - dx * len, ey = y - dy * len;
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(x, y); g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx * 7 + dy * 4, y - dy * 7 - dx * 4); g.lineTo(x - dx * 7 - dy * 4, y - dy * 7 + dx * 4); g.closePath(); g.fill();
    };
    for (const ld of loads) {
      const L = letters[letter++ % 26];
      g.strokeStyle = '#dc2626'; g.fillStyle = '#dc2626'; g.lineWidth = 1.6;
      let at: Pt | null = null;
      for (const id of ld.edges) {
        const pts = lines.current.get(id);
        if (!pts) continue;
        mark(id, '#dc2626', 3);
        g.strokeStyle = '#dc2626';
        const e = edges.find((x) => x.id === id);
        if (ld.kind === 'bearing' && e && pts.length > 2) {
          const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
          const a = (ld.angle * Math.PI) / 180;
          arrow(X(cx) + Math.cos(a) * 26, Y(cy) - Math.sin(a) * 26, Math.cos(a), -Math.sin(a), 40);
          at = [cx, cy];
          continue;
        }
        for (let i = 0; i + 1 < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay) * s, steps = Math.max(1, Math.round(len / 28));
          for (let q = 0; q <= steps; q++) {
            if (pts.length > 2 && q === steps) continue;
            const px = X(ax + ((bx - ax) * q) / steps), py = Y(ay + ((by - ay) * q) / steps);
            if (ld.kind === 'force') { const a = (ld.angle * Math.PI) / 180; arrow(px, py, Math.cos(a), -Math.sin(a), 26); }
            else if (ld.kind === 'pressure') { const nx = (by - ay) * s / len, ny = (bx - ax) * s / len, d = ld.p >= 0 ? -1 : 1; arrow(px + (d < 0 ? nx * 2 : nx * 24), py + (d < 0 ? ny * 2 : ny * 24), nx * d, ny * d, 22); }
          }
        }
        if (!at) at = pts[Math.floor(pts.length / 2)];
      }
      if (at) badge(X(at[0]), Y(at[1]) + 18, L, '#dc2626');
    }
    for (const mk of marks) {
      let at: Pt | null = null;
      for (const id of mk.edges) { mark(id, mk.colour, 4); const pts = lines.current.get(id); if (pts && !at) at = pts[Math.floor(pts.length / 2)]; }
      if (at) badge(X(at[0]), Y(at[1]) - 16, mk.letter, mk.colour);
    }
    for (const id of chosen) mark(id, '#7c3aed', 5);
    if (hoverEdge && picking) mark(hoverEdge, dark ? '#c4b5fd' : '#a78bfa', 6);
    // Largest and smallest values flagged.
    if (mesh && values && result) {
      const flag = (n: number, text: string, bg: string) => badge(X(mesh.x[n] + k * result.ux[n]), Y(mesh.y[n] + k * result.uy[n]) - 14, text, bg);
      let lo = 0, hi = 0;
      for (let i = 1; i < values.length; i++) { if (values[i] < values[lo]) lo = i; if (values[i] > values[hi]) hi = i; }
      if (!shown?.swing) flag(lo, `Min ${legendNum(values[lo])}`, shown?.reverse ? '#dc2626' : '#1d4ed8');
      flag(hi, `Max ${legendNum(values[hi])}`, shown?.reverse ? '#1d4ed8' : '#dc2626');
    }
  });

  useEffect(() => { draw(); });
  // The bent shape breathing in and out while playing.
  useEffect(() => {
    if (!playing) { phase.current = 1; return; }
    let raf = 0;
    const t0 = performance.now();
    // A load: bending in and back out; a vibration mode: swinging both ways.
    const tick = (t: number) => { const a = ((t - t0) / 1400) * Math.PI * 2; phase.current = swing ? Math.sin(a) : 0.5 - 0.5 * Math.cos(a); draw(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, swing]);

  useImperativeHandle(ref, () => ({ png: () => new Promise((res) => { if (!canvas.current) { res(null); return; } canvas.current.toBlob((b) => res(b), 'image/png'); }) }), []);

  const world = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect(), { s, ox, oy } = view.current;
    return { px: e.clientX - r.left, py: e.clientY - r.top, x: (e.clientX - r.left - ox) / s, y: (oy - (e.clientY - r.top)) / s };
  };
  const nearestEdge = (x: number, y: number) => {
    let best: string | null = null, d = 10 / view.current.s;
    for (const [id, pts] of lines.current) for (let i = 0; i + 1 < pts.length; i++) { const q = distSeg(x, y, pts[i], pts[i + 1]); if (q < d) { d = q; best = id; } }
    return best;
  };
  const zoom = (f: number, px = size.w / 2, py = size.h / 2) => {
    const v = view.current;
    view.current = { ...v, s: v.s * f, ox: px - (px - v.ox) * f, oy: py - (py - v.oy) * f };
    redraw();
  };
  const showTip = (t: { x: number; y: number; text: string } | null) => {
    const el = tip.current;
    if (!el) return;
    el.hidden = !t;
    if (t) { el.textContent = t.text; el.style.left = `${Math.max(4, Math.min(t.x + 12, size.w - 236))}px`; el.style.top = `${t.y + 14}px`; }
  };
  // Wheel zoom without the page scrolling (a passive listener can't stop that).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = c.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  const unit = fieldInfo.unit ? ` ${fieldInfo.unit}` : '';
  const lv = values ? levels(Math.min(...values), Math.max(...values)) : null, cols = bandColors(shown?.reverse);
  const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-white dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-white/10';
  return (
    <div ref={box} className="relative h-full min-h-[18rem] w-full touch-none select-none overflow-hidden" data-no-arrange data-no-motion>
      <canvas ref={canvas} role="img" aria-label={label} className={picking ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} style={{ width: size.w, height: size.h }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
            if (d.moved) { view.current = { ...view.current, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y }; showTip(null); redraw(); return; }
          }
          const w = world(e);
          setHoverEdge(picking ? nearestEdge(w.x, w.y) : null);
          if (mesh && values && result) {
            const { s, ox, oy } = view.current, k = scale;
            let best = -1, bd = 18;
            for (let i = 0; i < mesh.x.length; i++) { const q = Math.hypot(ox + (mesh.x[i] + k * result.ux[i]) * s - w.px, oy - (mesh.y[i] + k * result.uy[i]) * s - w.py); if (q < bd) { bd = q; best = i; } }
            showTip(best < 0 ? null : { x: w.px, y: w.py, text: `${legendNum(values[best])}${unit} at x ${+mesh.x[best].toFixed(2)}, y ${+mesh.y[best].toFixed(2)} mm` });
          } else showTip(null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && picking) { const w = world(e), id = nearestEdge(w.x, w.y); if (id) onPick(id); }
        }}
        onPointerLeave={() => { showTip(null); setHoverEdge(null); }} />
      {values && lv && compact && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-white/90 px-2 py-1.5 text-[11px] leading-tight text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/10">
          <p className="truncate font-semibold">{fieldInfo.name}{fieldInfo.unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({fieldInfo.unit})</span>}{scale > 0 && !swing && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · bent ×{scale >= 10 ? Math.round(scale).toLocaleString() : +scale.toPrecision(2)}</span>}</p>
          <div className="mt-1 flex items-center gap-1.5 font-mono tabular-nums">
            <span>{legendNum(lv[0])}</span>
            <span className="flex h-2.5 flex-1 overflow-hidden rounded-sm" aria-hidden>{cols.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
            <span>{legendNum(lv[BANDS])}</span>
          </div>
        </div>
      )}
      {values && lv && !compact && (
        <div className="pointer-events-none absolute start-2 top-2 rounded-lg bg-white/90 p-2 text-[11px] leading-tight text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/10">
          <p className="mb-1 max-w-[11rem] font-semibold">{fieldInfo.name}{fieldInfo.unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({fieldInfo.unit})</span>}</p>
          <ul className="font-mono tabular-nums">
            {Array.from({ length: BANDS + 1 }, (_, i) => BANDS - i).map((i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded-sm" style={{ background: cols[Math.min(BANDS - 1, i)], opacity: i === BANDS ? 0 : 1 }} aria-hidden />
                <span>{legendNum(lv[i])}{i === BANDS ? ' Max' : i === 0 ? ' Min' : ''}</span>
              </li>
            ))}
          </ul>
          {scale > 0 && !swing && <p className="mt-1 text-zinc-500 dark:text-zinc-400">Shape bent ×{scale >= 10 ? Math.round(scale).toLocaleString() : +scale.toPrecision(2)}</p>}
        </div>
      )}
      <div ref={tip} hidden className="pointer-events-none absolute z-10 rounded-md bg-zinc-900/90 px-2 py-1 font-mono text-[11px] text-white" />
      <div className="absolute end-2 top-2 flex gap-1">
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus className="h-4 w-4" aria-hidden /></button>
        <button type="button" className={btn} aria-label="Zoom out" onClick={() => zoom(0.8)}><Minus className="h-4 w-4" aria-hidden /></button>
        <button type="button" className={btn} aria-label="Fit the part in view" onClick={() => { fit(); redraw(); }}><Maximize className="h-4 w-4" aria-hidden /></button>
      </div>
    </div>
  );
}
