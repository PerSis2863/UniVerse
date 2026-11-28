'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import type { Pose } from '@/lib/lab/robot-motion';
import { ui } from './bench-ui';
import type { SenseOut, ToMachines } from './machines.worker';
import { watchWorker } from '@/lib/error-monitor';
import { toast } from 'sonner';

// Hyperion Simulate → Machines → Sensing (M484): a robot with a lidar drives across a building. On the left it
// doesn't know where it starts: Monte Carlo localisation spreads particles everywhere and they close in as the scans
// rule places out. On the right it has no map: SLAM builds one from the same scans while correcting its drifting
// odometry. The whole run is worked out on a background thread (machines.worker.ts), then replayed.

type MapName = 'rooms' | 'warehouse';
const STEP_S = 0.2;
const err = (a: Pose, b: Pose) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function SensingBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [mapName, setMapName] = useState<MapName>('rooms');
  const [particles, setParticles] = useState(5000);
  const [noise, setNoise] = useState(0.08);
  const [seed, setSeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [out, setOut] = useState<SenseOut | null>(null);
  const [busy, setBusy] = useState(true);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const left = useRef<HTMLCanvasElement>(null), right = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null), worker = useRef<Worker | null>(null), seq = useRef(0);

  const kNow = useRef(0), stillNow = useRef(still);
  useEffect(() => { kNow.current = k; stillNow.current = still; });
  useEffect(() => {
    const w = new Worker(new URL('./machines.worker.ts', import.meta.url));
    // With Reduce Motion the run is shown at its end, not replayed.
    w.onmessage = (e: MessageEvent<SenseOut>) => { if (e.data.id === seq.current) { setOut(e.data); setBusy(false); setK(stillNow.current ? e.data.truth.length - 1 : 0); setPlaying(!stillNow.current); } };
    watchWorker(w, 'sensing', (msg) => { setBusy(false); toast.error(msg); });
    worker.current = w;
    return () => w.terminate();
  }, []);
  const run = useEffectEvent(() => { if (!worker.current) return; setBusy(true); setPlaying(false); worker.current.postMessage({ id: ++seq.current, sense: { map: mapName, particles, odomNoise: noise, seed, loop } } satisfies ToMachines); });
  useEffect(() => { const t = window.setTimeout(run, 200); return () => clearTimeout(t); }, [mapName, particles, noise, seed, loop]);
  // The replay: five steps a second of the run is real time; shown three times faster, from where the slider is.
  useEffect(() => {
    if (!playing || !out) return;
    let raf = 0, t0 = 0;
    const from = kNow.current;
    const tick = (t: number) => {
      t0 ||= t;
      const next = Math.min(out.truth.length - 1, from + Math.floor(((t - t0) / 1000) * (3 / STEP_S)));
      setK(next);
      if (next < out.truth.length - 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, out]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b || !out) return;
    const size = Math.min((b.clientWidth - 16) / 2, b.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (size <= 0) return;
    const setup = (c: HTMLCanvasElement | null) => { if (!c) return null; c.style.width = `${size}px`; c.style.height = `${size}px`; c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const g = out.map, W = g.cols / g.res, scale = size / W, X = (x: number) => x * scale, Y = (y: number) => size - y * scale;
    const ink = dark ? '#d4d4d8' : '#27272a', bg = dark ? '#18181b' : '#ffffff';
    const robot = (ctx: CanvasRenderingContext2D, p: Pose, colour: string) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(p[0]) + 9 * Math.cos(p[2]), Y(p[1]) - 9 * Math.sin(p[2])); ctx.stroke(); };
    const path = (ctx: CanvasRenderingContext2D, P: Pose[], colour: string, w: number, dash: number[] = []) => { ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]); };
    const beams = (ctx: CanvasRenderingContext2D, p: Pose) => {
      ctx.strokeStyle = 'rgba(245,158,11,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
      out.scans[k].forEach((r, i) => { if (i % 2) return; ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(p[0] + r * Math.cos(p[2] + out.angles[i])), Y(p[1] + r * Math.sin(p[2] + out.angles[i]))); });
      ctx.stroke();
    };
    // Left: the known map, the particles, the estimate and the truth.
    const L = setup(left.current);
    if (L) {
      L.fillStyle = bg; L.fillRect(0, 0, size, size); L.fillStyle = ink;
      const cell = size / g.cols;
      for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (g.cells[r * g.cols + c]) L.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
      const P = out.particles[k];
      L.fillStyle = dark ? 'rgba(96,165,250,0.75)' : 'rgba(37,99,235,0.6)';
      for (let i = 0; i < P.length; i += 3) L.fillRect(X(P[i]) - 1, Y(P[i + 1]) - 1, 2.2, 2.2);
      beams(L, out.truth[k]);
      path(L, out.truth.slice(0, k + 1), dark ? 'rgba(161,161,170,0.8)' : 'rgba(113,113,122,0.8)', 1.5, [4, 3]);
      robot(L, out.truth[k], '#16a34a'); robot(L, out.est[k], '#7c3aed');
    }
    // Right: the map SLAM has built so far, its path and the odometry's.
    const R = setup(right.current);
    if (R) {
      R.fillStyle = dark ? '#3f3f46' : '#d4d4d8'; R.fillRect(0, 0, size, size);
      const sm = out.slamMap, snap = [...out.snaps].reverse().find((s) => s.k <= k) ?? null;
      if (snap) {
        const img = new ImageData(sm.cols, sm.rows);
        for (let i = 0; i < snap.p.length; i++) {
          const p = snap.p[i] / 255, unknown = Math.abs(p - 0.5) < 0.02;
          const v = unknown ? (dark ? 63 : 212) : dark ? Math.round(24 + p * 188) : Math.round(255 - p * 220);
          img.data.set([v, v, v, 255], i * 4);
        }
        const tmp = new OffscreenCanvas(sm.cols, sm.rows);
        tmp.getContext('2d')!.putImageData(img, 0, 0);
        R.imageSmoothingEnabled = false;
        R.drawImage(tmp, X(sm.x0), Y(sm.y0 + sm.rows / sm.res), (sm.cols / sm.res) * scale, (sm.rows / sm.res) * scale);
      }
      path(R, out.odom.slice(0, k + 1), '#dc2626', 1.5, [4, 3]);
      path(R, out.slamPoses.slice(0, k + 1), '#7c3aed', 2);
      // Loop closures found so far: the place recognised, joined to where it was first seen.
      R.strokeStyle = '#16a34a'; R.lineWidth = 2; R.setLineDash([3, 3]);
      for (const c of out.closures) if (c.to <= k) { const a = out.slamPoses[c.from], b = out.slamPoses[c.to]; R.beginPath(); R.moveTo(X(a[0]), Y(a[1])); R.lineTo(X(b[0]), Y(b[1])); R.stroke(); }
      R.setLineDash([]);
      robot(R, out.odom[k], '#dc2626'); robot(R, out.slamPoses[k], '#7c3aed');
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label, small } = ui, n = out?.truth.length ?? 1;
  const locErr = out ? err(out.est[k], out.truth[k]) : NaN, odoErr = out ? err(out.odom[k], out.truth[k]) : NaN, slamErr = out ? err(out.slamPoses[k], out.truth[k]) : NaN;
  const fmt = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : '…');
  const range = (name: string, value: number, min: number, max: number, step: number, show: string, set: (n: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{show}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Sensing settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Building</span>
          <Segmented<MapName> label="Building" value={mapName} onChange={setMapName} segments={[{ value: 'rooms', label: 'Rooms' }, { value: 'warehouse', label: 'Warehouse' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{mapName === 'rooms' ? 'Six rooms, each furnished differently: the scans soon tell them apart.' : 'Rows of identical shelves: many places look alike, so the particles can settle on the wrong aisle and must recover.'}</p>
        </div>
        {range('Particles', particles, 500, 10000, 500, particles.toLocaleString(), setParticles)}
        {range('Wheel slip (odometry noise)', noise, 0.01, 0.2, 0.01, `${Math.round(noise * 100)}%`, setNoise)}
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4 accent-violet-600" />Drive round a loop and close it</label>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{loop ? `SLAM matches each scan to the last few only, so it drifts slowly; when the robot is back where it has been, the match (green) pulls the whole path and map straight.${out ? ` Loops closed: ${out.closures.filter((c) => c.to <= k).length} of ${out.closures.length}.` : ''}` : 'The robot crosses the building once; SLAM matches each scan to everything mapped so far.'}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={small} disabled={!out} onClick={() => { if (out && k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
          <button type="button" className={small} onClick={() => setSeed((s) => s + 1)}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Another run</button>
        </div>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{(k * STEP_S).toFixed(1)} s</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">lidarSim</span>, <span className="font-mono">robotRun</span>, <span className="font-mono">mclLocalize</span>, <span className="font-mono">slamGrid</span>, <span className="font-mono">optimizePoseGraph</span>, <span className="font-mono">buildMap</span> (example: robot_sensing.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="Localisation and mapping">
        <div className="grid grid-cols-2 gap-4 px-4 pt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <p>Where am I? <span className="font-normal">(the map is known; green: really, violet: the filter’s guess)</span></p>
          <p>Map as you go (SLAM) <span className="font-normal">(violet: corrected, red: odometry alone)</span></p>
        </div>
        <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center gap-4 p-3">
          <canvas ref={left} role="img" aria-label={`Localisation: the guess is ${fmt(locErr)} from the robot`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <canvas ref={right} role="img" aria-label={`SLAM map: its path is ${fmt(slamErr)} off, the odometry ${fmt(odoErr)}`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          {busy && <p className="absolute end-6 top-5 rounded-md bg-zinc-900/80 px-2 py-1 text-xs text-white">Working out the run…</p>}
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {([['Filter’s guess off by', fmt(locErr)], ['Particles spread over', out ? fmt(out.spread[k]) : '…'], ['SLAM path off by', fmt(slamErr)], ['Odometry alone off by', fmt(odoErr)]] as const).map(([a, b]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b}</p></div>)}
        </div>
      </section>
    </div>
  );
}
