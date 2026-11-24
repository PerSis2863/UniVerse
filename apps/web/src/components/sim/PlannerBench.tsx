'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Eraser, Navigation, Play, Route } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { pathLength, sampleMap, type Grid, type Pose } from '@/lib/lab/robot-motion';
import { CAR, parkingMap } from '@/lib/lab/car-path';
import { ui } from './bench-ui';
import type { FromMachines, Method, ToMachines } from './machines.worker';

// Hyperion Simulate → Machines → Planner (M483): a map to draw on (walls and erasing with the mouse), a start and a
// goal, and a planner: A* over the cells, RRT (a random tree, the first way found) or RRT* (the tree keeps rewiring
// towards the shortest). The map is grown by the robot's radius first (the light band), the corners a straight line
// can cut are cut, and a differential-drive robot drives it by pure pursuit. Planning runs on a background thread
// (machines.worker.ts); the drawing is one canvas. M483b: Car plans for a car that can't turn on the spot (Hybrid A*:
// arcs forwards and backwards, start and goal headings), with a car park whose empty bay it reverses into.

type MapName = 'warehouse' | 'rooms' | 'maze' | 'empty' | 'parking';
type Tool = 'wall' | 'erase' | 'start' | 'goal';
const MAPS: { value: MapName; label: string }[] = [{ value: 'warehouse', label: 'Warehouse' }, { value: 'rooms', label: 'Rooms' }, { value: 'maze', label: 'Maze' }, { value: 'empty', label: 'Empty' }, { value: 'parking', label: 'Car park' }];
const METHODS: { value: Method; label: string }[] = [{ value: 'astar', label: 'A*' }, { value: 'rrt', label: 'RRT' }, { value: 'rrtstar', label: 'RRT*' }, { value: 'car', label: 'Car' }];
const TOOLS: { value: Tool; label: string }[] = [{ value: 'wall', label: 'Wall' }, { value: 'erase', label: 'Erase' }, { value: 'start', label: 'Start' }, { value: 'goal', label: 'Goal' }];
const ENDS: Record<MapName, [[number, number], [number, number]]> = { warehouse: [[2, 2], [23, 23]], rooms: [[3, 3], [22, 22]], maze: [[1.25, 1.25], [23.75, 23.75]], empty: [[2, 2], [23, 23]], parking: [[3, 10], [18.9, 3.2]] };
const mapOf = (n: MapName): Grid => (n === 'parking' ? parkingMap() : n === 'empty' ? { rows: 50, cols: 50, cells: new Uint8Array(2500), res: 2 } : sampleMap(n));

export function PlannerBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [mapName, setMapName] = useState<MapName>('warehouse');
  const [grid, setGrid] = useState<Grid>(() => mapOf('warehouse'));
  const [start, setStart] = useState<[number, number]>(ENDS.warehouse[0]);
  const [goal, setGoal] = useState<[number, number]>(ENDS.warehouse[1]);
  const [method, setMethod] = useState<Method>('astar');
  const [tool, setTool] = useState<Tool>('wall');
  const [radius, setRadius] = useState(0.4);
  const [look, setLook] = useState(1);
  // The car's start and goal headings (degrees).
  const [heads, setHeads] = useState<[number, number]>([0, 90]);
  const [out, setOut] = useState<FromMachines | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(-1);
  const canvas = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null), worker = useRef<Worker | null>(null), seq = useRef(0), raf = useRef(0), painting = useRef(false);

  useEffect(() => {
    const w = new Worker(new URL('./machines.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromMachines>) => { if (e.data.id === seq.current) { setOut(e.data); setBusy(false); setFrame(-1); } };
    worker.current = w;
    return () => { w.terminate(); cancelAnimationFrame(raf.current); };
  }, []);
  const plan = useEffectEvent(() => {
    if (!worker.current) return;
    setBusy(true); cancelAnimationFrame(raf.current);
    worker.current.postMessage({ id: ++seq.current, plan: { grid, start, goal, method, radius, look, speed: 0.8, heads: [(heads[0] * Math.PI) / 180, (heads[1] * Math.PI) / 180] } } satisfies ToMachines);
  });
  // Plans again as the map, the ends or the choices change (a short pause while painting).
  useEffect(() => { const t = window.setTimeout(plan, 150); return () => clearTimeout(t); }, [grid, start, goal, method, radius, look, heads]);

  const choose = (n: MapName) => { setMapName(n); setGrid(mapOf(n)); setStart(ENDS[n][0]); setGoal(ENDS[n][1]); if (n === 'parking') { setMethod('car'); setHeads([0, 90]); } };
  const drive = () => {
    if (!out?.drive.length) return;
    cancelAnimationFrame(raf.current);
    if (still) { setFrame(out.drive.length - 1); return; }
    const n = out.drive.length, rate = out.back ? 24 : 80;
    let t0 = 0;
    // Four times real speed for the robot (each pose is 0.05 s apart); the car's poses are a quarter metre apart.
    const tick = (t: number) => { t0 ||= t; const k = Math.min(n - 1, Math.floor(((t - t0) / 1000) * rate)); setFrame(k); if (k < n - 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };

  // ——— Drawing ———
  const draw = useEffectEvent(() => {
    const c = canvas.current, b = box.current;
    if (!c || !b) return;
    // The canvas takes the map's own shape, as large as fits (size: the longer side).
    const dpr = Math.min(2, window.devicePixelRatio || 1), m = Math.max(grid.rows, grid.cols), size = Math.min(((b.clientWidth - 24) * m) / grid.cols, ((b.clientHeight - 24) * m) / grid.rows);
    if (size <= 0) return;
    const W = (size * grid.cols) / m, Hh = (size * grid.rows) / m;
    c.style.width = `${W}px`; c.style.height = `${Hh}px`; c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = grid, cell = size / Math.max(g.rows, g.cols), X = (x: number) => x * g.res * cell, Y = (y: number) => (g.rows - y * g.res) * cell;
    ctx.fillStyle = dark ? '#18181b' : '#ffffff'; ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < g.rows; r++) for (let k = 0; k < g.cols; k++) {
      const i = r * g.cols + k;
      if (g.cells[i]) ctx.fillStyle = dark ? '#d4d4d8' : '#27272a';
      else if (out?.inflated[i]) ctx.fillStyle = dark ? 'rgba(167,139,250,0.22)' : 'rgba(124,58,237,0.13)';
      else if (out?.plan.visited?.[i]) ctx.fillStyle = dark ? 'rgba(96,165,250,0.16)' : 'rgba(37,99,235,0.08)';
      else continue;
      ctx.fillRect(k * cell, r * cell, cell + 0.5, cell + 0.5);
    }
    if (out?.plan.edges) {
      ctx.strokeStyle = dark ? 'rgba(147,197,253,0.45)' : 'rgba(37,99,235,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath();
      const e = out.plan.edges;
      for (let k = 0; k < e.length; k += 4) { ctx.moveTo(X(e[k]), Y(e[k + 1])); ctx.lineTo(X(e[k + 2]), Y(e[k + 3])); }
      ctx.stroke();
    }
    const line = (p: [number, number][], colour: string, w: number, dash: number[] = []) => { if (p.length < 2) return; ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); p.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); ctx.setLineDash([]); };
    if (out?.back) {
      // The car's route: forwards in violet, backwards in orange.
      for (let k = 1; k < out.smooth.length; k++) line([out.smooth[k - 1], out.smooth[k]], out.back[k] ? '#f59e0b' : dark ? '#a78bfa' : '#7c3aed', 3);
    } else if (out) { line(out.plan.path, dark ? 'rgba(196,181,253,0.7)' : 'rgba(124,58,237,0.45)', 2, [5, 4]); line(out.smooth, dark ? '#a78bfa' : '#7c3aed', 3); }
    if (out && frame >= 0 && !out.back) line(out.drive.slice(0, frame + 1).map((p) => [p[0], p[1]]), '#f59e0b', 2.5);
    // A car: its outline at a pose (the pose is the rear axle).
    const carAt = ([x, y, th]: Pose, fill: string, stroke: string) => {
      const c = Math.cos(th), sn = Math.sin(th), w = CAR.width / 2, b = -0.9, f = CAR.length - 0.9;
      ctx.beginPath(); [[b, -w], [f, -w], [f, w], [b, w]].forEach(([u, v], k) => { const px = X(x + u * c - v * sn), py = Y(y + u * sn + v * c); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(x + (f - 0.6) * c), Y(y + (f - 0.6) * sn)); ctx.lineTo(X(x + f * c), Y(y + f * sn)); ctx.stroke();
    };
    if (method === 'car') { const r = (h: number) => (h * Math.PI) / 180; carAt([...start, r(heads[0])], 'rgba(22,163,74,0.18)', '#16a34a'); carAt([...goal, r(heads[1])], 'rgba(220,38,38,0.15)', '#dc2626'); }
    const dot = ([x, y]: [number, number], colour: string) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(5, cell * 0.8), 0, Math.PI * 2); ctx.fill(); };
    dot(start, '#16a34a'); dot(goal, '#dc2626');
    const pose: Pose | undefined = out && frame >= 0 ? out.drive[frame] : undefined;
    if (pose && out?.back) carAt(pose, 'rgba(245,158,11,0.85)', '#000');
    else if (pose) {
      // The robot: a disc of its radius with a nose showing where it faces.
      const [x, y, th] = pose, rr = Math.max(radius * g.res * cell, 5);
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(X(x), Y(y), rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x) + Math.cos(th) * rr, Y(y) - Math.sin(th) * rr); ctx.stroke();
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect(), cell = r.width / Math.max(grid.rows, grid.cols);
    return [(e.clientX - r.left) / cell / grid.res, (grid.rows - (e.clientY - r.top) / cell) / grid.res];
  };
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = at(e);
    if (tool === 'start' || tool === 'goal') { (tool === 'start' ? setStart : setGoal)([Number(x.toFixed(2)), Number(y.toFixed(2))]); return; }
    const r = grid.rows - 1 - Math.floor(y * grid.res), c = Math.floor(x * grid.res), v = tool === 'wall' ? 1 : 0;
    if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return;
    setGrid((g) => {
      // A 2 × 2 brush.
      let changed = false;
      const cells = new Uint8Array(g.cells);
      for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const rr = r + dr, cc = c + dc; if (rr < g.rows && cc < g.cols && cells[rr * g.cols + cc] !== v) { cells[rr * g.cols + cc] = v; changed = true; } }
      return changed ? { ...g, cells } : g;
    });
  };

  const { label, small } = ui;
  const found = !!out?.smooth.length;
  const range = (name: string, value: number, min: number, max: number, step: number, unit: string, set: (n: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{value}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Planner settings" data-no-motion>
        <label className={label}>Map<select aria-label="Map" value={mapName} onChange={(e) => choose(e.target.value as MapName)} className={`${ui.select} mt-1 w-full`}>{MAPS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <div className="space-y-2">
          <span className={label}>The mouse places</span>
          <Segmented<Tool> label="The mouse places" value={tool} onChange={setTool} segments={TOOLS} />
          <button type="button" className={small} onClick={() => setGrid((g) => ({ ...g, cells: new Uint8Array(g.cells.length) }))}><Eraser className="h-3.5 w-3.5" aria-hidden />Clear the walls</button>
        </div>
        <div className="space-y-2">
          <span className={label}>Planner</span>
          <Segmented<Method> label="Planner" value={method} onChange={setMethod} segments={METHODS} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{method === 'astar' ? 'A* looks at the cells nearest the goal first (the blue ones) and finds the shortest way over the grid.' : method === 'rrt' ? 'RRT grows a random tree into the free space and stops at the first way it finds: quick, but wandering.' : method === 'rrtstar' ? 'RRT* keeps growing and rewiring its tree, so the way keeps getting shorter.' : 'Car: a route a car can really drive, reversing where it must.'}</p>
        </div>
        {method === 'car' ? (
          <>
            {range('Start heading', heads[0], -180, 180, 5, '°', (n) => setHeads((h) => [n, h[1]]))}
            {range('Goal heading', heads[1], -180, 180, 5, '°', (n) => setHeads((h) => [h[0], n]))}
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">A car 4.5 m long that turns no tighter than 5 m. Hybrid A* drives short arcs forwards and backwards (orange) and finishes with the shortest curve that may reverse (a Reeds–Shepp path) when one fits.</p>
          </>
        ) : (
          <>
            {range('Robot radius', radius, 0, 1.2, 0.05, ' m', setRadius)}
            {range('Look-ahead (pure pursuit)', look, 0.3, 3, 0.1, ' m', setLook)}
          </>
        )}
        <button type="button" className="btn-primary btn-sm" disabled={!found} onClick={drive}><Play className="h-4 w-4" aria-hidden />Drive it</button>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">robotMap</span>, <span className="font-mono">astarGrid</span>, <span className="font-mono">rrtPlan</span>, <span className="font-mono">shortenPath</span>, <span className="font-mono">followPath</span>, <span className="font-mono">hybridAstar</span>, <span className="font-mono">dubinsPath</span>, <span className="font-mono">reedsSheppPath</span> (example: robot_motion.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The map">
        <div ref={box} className="flex min-h-0 flex-1 items-center justify-center p-3">
          <canvas ref={canvas} role="img" aria-label={`Map with a ${METHODS.find((m) => m.value === method)?.label} path ${found ? `of ${pathLength(out!.smooth).toFixed(1)} metres` : 'not found'}`} className="touch-none rounded-lg ring-1 ring-zinc-200 dark:ring-white/10"
            onPointerDown={(e) => { painting.current = true; e.currentTarget.setPointerCapture(e.pointerId); paint(e); }}
            onPointerMove={(e) => { if (painting.current && (tool === 'wall' || tool === 'erase')) paint(e); }}
            onPointerUp={() => { painting.current = false; }} />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {([
            [<Route key="r" className="h-3.5 w-3.5" aria-hidden />, 'Path', found ? `${pathLength(out!.smooth).toFixed(2)} m` : busy ? '…' : 'No way through'],
            [null, method === 'astar' ? 'Cells looked at' : method === 'car' ? 'Poses tried' : 'Tree nodes', out ? out.plan.explored.toLocaleString() : '…'],
            [null, 'Planning time', out ? `${out.ms.toFixed(1)} ms` : '…'],
            [<Navigation key="n" className="h-3.5 w-3.5" aria-hidden />, out?.back ? 'Reversing' : 'Drive', out?.back ? `${(out.back.filter(Boolean).length / 4).toFixed(1)} m` : out?.drive.length ? `${((out.drive.length - 1) * 0.05).toFixed(1)} s at 0.8 m/s` : '–'],
          ] as const).map(([icon, k, v]) => <div key={k}><p className="flex items-center gap-1 font-semibold text-zinc-500 dark:text-zinc-400">{icon}{k}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{v}</p></div>)}
        </div>
      </section>
    </div>
  );
}
