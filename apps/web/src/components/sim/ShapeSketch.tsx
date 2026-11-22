'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_CORNERS, MAX_HOLES, selfCrossing, type CustomShape, type Pt } from '@/lib/sim/part';
import { ui } from './bench-ui';

// Hyperion Simulate: draw your own part (M411, the owner, 22 Nov: "drawing your own part shape… PLEASE DO THIS"). The
// outline's corners are handles to drag (snapped to the grid), a press on a side adds a corner there (elsewhere: after
// the last), arrow keys nudge the chosen corner and Delete removes it; round holes are added and moved the same way.
// Every number can also be typed in the lists below. The part in the big window follows as it changes.

const W = 300, H = 220;
const niceStep = (span: number) => { const raw = span / 12, p = 10 ** Math.floor(Math.log10(raw || 1)); return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= raw) ?? raw; };
const round = (v: number) => +v.toFixed(3);

function fit(s: CustomShape) {
  const xs = [...s.pts.map((p) => p[0]), ...s.holes.flatMap((h) => [h.c[0] - h.r, h.c[0] + h.r])], ys = [...s.pts.map((p) => p[1]), ...s.holes.flatMap((h) => [h.c[1] - h.r, h.c[1] + h.r])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), span = Math.max(x1 - x0, y1 - y0, 1);
  const k = Math.min((W * 0.8) / Math.max(x1 - x0, span * 0.2), (H * 0.8) / Math.max(y1 - y0, span * 0.2));
  return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, step: niceStep(span) };
}

export function ShapeSketch({ shape, onChange }: { shape: CustomShape; onChange: (s: CustomShape) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ kind: 'pt' | 'hole'; i: number } | null>(null);
  const [frozen, setFrozen] = useState<ReturnType<typeof fit> | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const v = frozen ?? fit(shape), snap = v.step / 2;
  const X = (x: number) => W / 2 + (x - v.cx) * v.k, Y = (y: number) => H / 2 - (y - v.cy) * v.k;
  const world = (e: { clientX: number; clientY: number }): Pt => {
    const el = svg.current!, p = el.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(el.getScreenCTM()!.inverse());
    return [round(Math.round((v.cx + (q.x - W / 2) / v.k) / snap) * snap), round(Math.round((v.cy - (q.y - H / 2) / v.k) / snap) * snap)];
  };
  const setPts = (pts: Pt[]) => onChange({ ...shape, pts });
  const setHoles = (holes: CustomShape['holes']) => onChange({ ...shape, holes });
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag || shape.pts.length >= MAX_CORNERS) return;
    // A press on a side adds a corner on it; anywhere else, after the last corner.
    const p = world(e), n = shape.pts.length;
    let best = -1, bd = 10 / v.k;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = shape.pts[i], [bx, by] = shape.pts[(i + 1) % n], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0, d = Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy);
      if (d < bd) { bd = d; best = i; }
    }
    const at = best >= 0 ? best + 1 : n;
    setPts([...shape.pts.slice(0, at), p, ...shape.pts.slice(at)]);
    setChosen(at);
  };
  const grab = (e: ReactPointerEvent, kind: 'pt' | 'hole', i: number) => { e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); setDrag({ kind, i }); setFrozen(v); if (kind === 'pt') setChosen(i); };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = world(e);
    if (drag.kind === 'pt') setPts(shape.pts.map((q, i) => (i === drag.i ? p : q)));
    else setHoles(shape.holes.map((h, i) => (i === drag.i ? { ...h, c: p } : h)));
  };
  const up = () => { setDrag(null); setFrozen(null); };
  const removePt = (i: number) => { if (shape.pts.length > 3) { setPts(shape.pts.filter((_, k) => k !== i)); setChosen(null); } };
  const nudge = (i: number, dx: number, dy: number) => setPts(shape.pts.map((q, k) => (k === i ? [round(q[0] + dx * snap), round(q[1] + dy * snap)] : q)));
  const crossing = selfCrossing(shape.pts);
  // Grid lines every step across the view.
  const gx: number[] = [], gy: number[] = [];
  for (let x = Math.ceil((v.cx - W / 2 / v.k) / v.step) * v.step; x <= v.cx + W / 2 / v.k; x += v.step) gx.push(x);
  for (let y = Math.ceil((v.cy - H / 2 / v.k) / v.step) * v.step; y <= v.cy + H / 2 / v.k; y += v.step) gy.push(y);
  const field = 'w-full rounded-md border border-zinc-200 bg-white px-1.5 py-1 font-mono text-xs tabular-nums dark:border-white/15 dark:bg-white/[0.06]';
  const numIn = (value: number, set: (n: number) => void, name: string) => <input type="number" step="any" aria-label={name} value={value} onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) set(n); }} className={field} />;

  return (
    <div className="space-y-2">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none rounded-lg bg-zinc-50 ring-1 ring-zinc-200 dark:bg-white/[0.03] dark:ring-white/10" role="group" aria-label={`Drawing of your shape: ${shape.pts.length} corners, ${shape.holes.length} holes`} onPointerDown={down} onPointerMove={move} onPointerUp={up} data-no-motion>
        {gx.map((x) => <line key={`x${x}`} x1={X(x)} y1={0} x2={X(x)} y2={H} className={Math.abs(x) < 1e-9 ? 'stroke-zinc-400 dark:stroke-zinc-500' : 'stroke-zinc-200 dark:stroke-white/[0.07]'} strokeWidth={1} />)}
        {gy.map((y) => <line key={`y${y}`} x1={0} y1={Y(y)} x2={W} y2={Y(y)} className={Math.abs(y) < 1e-9 ? 'stroke-zinc-400 dark:stroke-zinc-500' : 'stroke-zinc-200 dark:stroke-white/[0.07]'} strokeWidth={1} />)}
        <polygon points={shape.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} className={crossing ? 'fill-red-500/20 stroke-red-600' : 'fill-violet-500/20 stroke-violet-700 dark:stroke-violet-300'} strokeWidth={1.6} strokeLinejoin="round" />
        {shape.holes.map((h, i) => (
          <g key={`h${i}`}>
            <circle cx={X(h.c[0])} cy={Y(h.c[1])} r={h.r * v.k} className="fill-zinc-50 stroke-violet-700 dark:fill-zinc-900 dark:stroke-violet-300" strokeWidth={1.4} />
            <circle cx={X(h.c[0])} cy={Y(h.c[1])} r={5} role="button" tabIndex={0} aria-label={`Hole ${i + 1} at x ${h.c[0]}, y ${h.c[1]}`} onPointerDown={(e) => grab(e, 'hole', i)} className="cursor-move fill-white stroke-violet-700 dark:fill-zinc-800 dark:stroke-violet-300" strokeWidth={1.6} />
          </g>
        ))}
        {shape.pts.map((p, i) => (
          <circle key={`p${i}`} cx={X(p[0])} cy={Y(p[1])} r={chosen === i ? 6.5 : 5} role="button" tabIndex={0} aria-label={`Corner ${i + 1} at x ${p[0]}, y ${p[1]}`}
            onPointerDown={(e) => grab(e, 'pt', i)} onFocus={() => setChosen(i)}
            onKeyDown={(e) => {
              const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
              if (d[e.key]) { e.preventDefault(); nudge(i, ...d[e.key]); } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePt(i); }
            }}
            className={chosen === i ? 'cursor-move fill-violet-600 stroke-white' : 'cursor-move fill-white stroke-violet-700 dark:fill-zinc-800 dark:stroke-violet-300'} strokeWidth={1.6} />
        ))}
      </svg>
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{crossing ? <span className="text-red-700 dark:text-red-400">The outline crosses itself: move a corner. </span> : null}Drag the corners; press a side to add a corner; arrow keys move the chosen one ({snap} mm), Delete removes it. Grid: {v.step} mm.</p>
      <details className="text-xs" open={shape.pts.length <= 8}>
        <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-200">Corners ({shape.pts.length}), in mm</summary>
        <div className="mt-1 max-h-44 space-y-1 overflow-y-auto" tabIndex={0} role="region" aria-label="Corners">
          {shape.pts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1.75rem] items-center gap-1">
              <span className="text-end font-mono text-zinc-500">{i + 1}</span>
              {numIn(p[0], (n) => setPts(shape.pts.map((q, k) => (k === i ? [n, q[1]] : q))), `Corner ${i + 1} x`)}
              {numIn(p[1], (n) => setPts(shape.pts.map((q, k) => (k === i ? [q[0], n] : q))), `Corner ${i + 1} y`)}
              <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-white/10" aria-label={`Remove corner ${i + 1}`} disabled={shape.pts.length <= 3} onClick={() => removePt(i)}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </div>
          ))}
        </div>
      </details>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between"><span className="font-medium text-zinc-700 dark:text-zinc-200">Round holes ({shape.holes.length})</span>
          <button type="button" className={ui.small} disabled={shape.holes.length >= MAX_HOLES} onClick={() => { const cx = shape.pts.reduce((s, p) => s + p[0], 0) / shape.pts.length, cy = shape.pts.reduce((s, p) => s + p[1], 0) / shape.pts.length; setHoles([...shape.holes, { c: [round(cx), round(cy)], r: round(v.step / 2 || 5) }]); }}><Plus className="h-3.5 w-3.5" aria-hidden />Add a hole</button>
        </div>
        {shape.holes.map((h, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_1.75rem] items-center gap-1">
            <span className="text-end font-mono text-zinc-500">{i + 1}</span>
            {numIn(h.c[0], (n) => setHoles(shape.holes.map((q, k) => (k === i ? { ...q, c: [n, q.c[1]] } : q))), `Hole ${i + 1} x`)}
            {numIn(h.c[1], (n) => setHoles(shape.holes.map((q, k) => (k === i ? { ...q, c: [q.c[0], n] } : q))), `Hole ${i + 1} y`)}
            {numIn(h.r, (n) => { if (n > 0) setHoles(shape.holes.map((q, k) => (k === i ? { ...q, r: n } : q))); }, `Hole ${i + 1} radius`)}
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={`Remove hole ${i + 1}`} onClick={() => setHoles(shape.holes.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
          </div>
        ))}
        {shape.holes.length > 0 && <p className="text-zinc-500 dark:text-zinc-400">x, y of the centre and the radius.</p>}
      </div>
    </div>
  );
}
