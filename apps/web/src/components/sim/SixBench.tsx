'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { PLANE_DEFAULT, flight6 } from '@/lib/lab/flight';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Aeroplane → All six (M489c): the whole aeroplane at once, so turning and climbing
// affect each other, and wind: a half turn (with the autopilot holding height and speed, or hands off so it sinks), a
// steady wind from the left (it crabs into it and drifts), a '1 − cos' gust from below, and turbulence. Seen from
// above, with bank, height change and load factor below. Worked out at once, replayed twice real time (at its end with
// Reduce Motion). The maths is flight.ts (flight6), the same as aircraftSim6DOF in code.

type Move = 'turn' | 'cross' | 'gust' | 'rough';
type Rough = 'light' | 'moderate' | 'severe';
const ROUGH: Record<Rough, number> = { light: 1.5, moderate: 3, severe: 6 };
const deg = (r: number) => (r * 180) / Math.PI;
const SPEEDUP = 2;

export function SixBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [move, setMove] = useState<Move>('turn');
  const [hold, setHold] = useState<'hold' | 'off'>('hold');
  const [wind, setWind] = useState(10);
  const [rough, setRough] = useState<Rough>('moderate');
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const top = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const ac = PLANE_DEFAULT, V = 50, h0 = 1000;
  const run = useMemo(() => {
    const pilot = { holdHeight: () => h0, holdSpeed: V, yawDamper: true };
    if (move === 'turn') return flight6(ac, 50, { V0: V, h0, holdHeading: () => Math.PI * 0.999, maxBank: (35 * Math.PI) / 180, ...(hold === 'hold' ? pilot : {}), points: 700 });
    // A wind from the west (blowing east) while the autopilot keeps the nose north.
    if (move === 'cross') return flight6(ac, 60, { V0: V, h0, wind: { steady: [0, wind, 0] }, holdHeading: () => 0, ...pilot, points: 700 });
    if (move === 'gust') return flight6(ac, 12, { V0: V, h0, wind: { gust: { at: 2, length: 60, up: wind / 2 } }, points: 1200 });
    return flight6(ac, 60, { V0: V, h0, wind: { turbulence: { sigma: ROUGH[rough], seed: 3 } }, holdHeading: () => 0, ...pilot, points: 1200 });
  }, [ac, move, hold, wind, rough]);
  const n = run.t.length;

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? n - 1 : 0); setPlaying(!still); }); return () => cancelAnimationFrame(id); }, [run, still, n]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = 0;
    const from = kNow.current, rate = ((n - 1) / run.t[n - 1]) * SPEEDUP;
    const tick = (t: number) => {
      t0 ||= t;
      const next = Math.min(n - 1, from + Math.floor(((t - t0) / 1000) * rate));
      setK(next);
      if (next < n - 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, run, n]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(200, b.clientHeight - 170);
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    // From above, north up; the wind as arrows when there is a steady one.
    const T = setup(top.current, W, H);
    if (T) {
      T.fillStyle = dark ? '#0f1a14' : '#eef4ee'; T.fillRect(0, 0, W, H);
      const es = run.e, ns = run.n, pad = 80;
      const e0 = Math.min(...es) - pad, e1 = Math.max(...es) + pad, n0 = Math.min(...ns) - pad, n1 = Math.max(...ns) + pad;
      const s = Math.min(W / (e1 - e0), H / (n1 - n0)), ox = (W - (e1 - e0) * s) / 2, oy = (H - (n1 - n0) * s) / 2;
      const X = (e: number) => ox + (e - e0) * s, Y = (no: number) => H - oy - (no - n0) * s;
      const grid = n1 - n0 > 1500 || e1 - e0 > 1500 ? 500 : 100;
      T.strokeStyle = faint; T.lineWidth = 1; T.beginPath();
      for (let g = Math.ceil(e0 / grid) * grid; g <= e1; g += grid) { T.moveTo(X(g), 0); T.lineTo(X(g), H); }
      for (let g = Math.ceil(n0 / grid) * grid; g <= n1; g += grid) { T.moveTo(0, Y(g)); T.lineTo(W, Y(g)); }
      T.stroke();
      if (move === 'cross') {
        T.strokeStyle = dark ? 'rgba(125,211,252,0.5)' : 'rgba(2,132,199,0.45)'; T.lineWidth = 1.5;
        for (let yy = 40; yy < H; yy += 90) for (let xx = 30; xx < W; xx += 140) { T.beginPath(); T.moveTo(xx, yy); T.lineTo(xx + 30, yy); T.lineTo(xx + 24, yy - 4); T.moveTo(xx + 30, yy); T.lineTo(xx + 24, yy + 4); T.stroke(); }
      }
      T.strokeStyle = dark ? 'rgba(161,161,170,0.45)' : 'rgba(113,113,122,0.4)'; T.setLineDash([5, 4]); T.beginPath();
      ns.forEach((x, i) => { if (i) T.lineTo(X(es[i]), Y(x)); else T.moveTo(X(es[i]), Y(x)); });
      T.stroke(); T.setLineDash([]);
      T.strokeStyle = '#7c3aed'; T.lineWidth = 2.5; T.beginPath(); T.moveTo(X(es[0]), Y(ns[0]));
      for (let i = 1; i <= k; i++) T.lineTo(X(es[i]), Y(ns[i]));
      T.stroke();
      // The aeroplane along its heading (so in a crosswind it points into the wind while its track drifts), its wings
      // shorter as it banks.
      const span = 16 * Math.max(0.15, Math.abs(Math.cos(run.phi[k])));
      T.save(); T.translate(X(es[k]), Y(ns[k])); T.rotate(run.psi[k]);
      T.fillStyle = dark ? '#e4e4e7' : '#3f3f46';
      T.beginPath(); T.moveTo(0, -13); T.lineTo(2, -8); T.lineTo(2, 9); T.lineTo(0, 11); T.lineTo(-2, 9); T.lineTo(-2, -8); T.closePath(); T.fill();
      T.fillRect(-span, -4, 2 * span, 3.5); T.fillRect(-5, 7, 10, 2.5);
      T.restore();
      T.fillStyle = ink; T.font = '11px Inter, system-ui, sans-serif'; T.fillText(`${grid} m squares`, 8, H - 8);
    }
    // Under it: bank, height change and load factor, each scaled to its own range.
    const C = setup(chart.current, W, 130);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, W, 130);
      const tEnd = run.t[n - 1], tx = (t: number) => 8 + ((W - 16) * t) / tEnd;
      C.strokeStyle = faint; C.beginPath(); C.moveTo(8, 65); C.lineTo(W - 8, 65); C.stroke();
      for (const [v, colour] of [[run.phi.map(deg), '#7c3aed'], [run.h.map((h) => h - h0), '#16a34a'], [run.nz.map((x) => x - 1), '#f59e0b']] as const) {
        const peak = Math.max(0.05, ...v.map(Math.abs));
        C.strokeStyle = colour; C.lineWidth = 2; C.beginPath(); v.forEach((y, i) => { const px = tx(run.t[i]), py = 65 - (y / peak) * 55; if (i) C.lineTo(px, py); else C.moveTo(px, py); }); C.stroke();
      }
      C.strokeStyle = ink; C.lineWidth = 1; C.beginPath(); C.moveTo(tx(run.t[k]), 6); C.lineTo(tx(run.t[k]), 124); C.stroke();
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label, small } = ui;
  const explain: Record<Move, string> = {
    turn: hold === 'hold' ? 'The autopilot turns it round to the south, banking up to 35°. Banked, the wing’s lift tilts, so it must pull harder (more g) and add power to keep its height and speed.' : 'The same half turn with nobody on the elevator or throttle: banked, the tilted lift no longer holds the weight up, so the nose drops and it sinks.',
    cross: 'Flying north with a wind from the left. The autopilot keeps the nose pointing north; the air carries the aeroplane east, so its track drifts while its heading doesn’t.',
    gust: 'Level flight into a rising gust (a smooth bump of air, 60 m long): the wing meets the air at a steeper angle, lift jumps and it is pushed up, then the nose settles.',
    rough: 'Random gusts in every direction (Dryden turbulence) with the autopilot holding heading, height and speed: the wings rock and the load jumps about.',
  };
  const ground = run.ground[k], lost = Math.min(0, ...run.h.map((h) => h - h0)), drift = deg(Math.atan2(run.e[n - 1] - run.e[0], run.n[n - 1] - run.n[0]));
  const f: [string, string][] = [
    ['Heading · track', move === 'cross' ? `${deg(run.psi[k]).toFixed(0)}° · ${drift.toFixed(0)}°` : `${((deg(run.psi[k]) + 360) % 360).toFixed(0)}°`],
    ['Height change', `${(run.h[k] - h0).toFixed(0)} m (most ${lost.toFixed(0)} m)`],
    ['Load factor, most', `${Math.max(...run.nz).toFixed(2)} g`],
    ['Air · ground speed', `${run.V[k].toFixed(0)} · ${ground.toFixed(0)} m/s`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Aeroplane settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Flight</span>
          <Segmented<Move> label="Flight" value={move} onChange={setMove} segments={[{ value: 'turn', label: 'Turn' }, { value: 'cross', label: 'Crosswind' }, { value: 'gust', label: 'Gust' }, { value: 'rough', label: 'Rough' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{explain[move]}</p>
        </div>
        {move === 'turn' && <div className="space-y-2">
          <span className={label}>Height and speed</span>
          <Segmented<'hold' | 'off'> label="Height and speed" value={hold} onChange={setHold} segments={[{ value: 'hold', label: 'Autopilot holds' }, { value: 'off', label: 'Hands off' }]} />
        </div>}
        {(move === 'cross' || move === 'gust') && <label className={label}>{move === 'cross' ? 'Wind' : 'Gust'} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{move === 'cross' ? wind : wind / 2} m/s</span>
          <input type="range" min={2} max={20} step={1} value={wind} onChange={(e) => setWind(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>}
        {move === 'rough' && <div className="space-y-2">
          <span className={label}>Turbulence</span>
          <Segmented<Rough> label="Turbulence" value={rough} onChange={setRough} segments={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }]} />
        </div>}
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{run.t[k].toFixed(1)} s</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">All six motions at once (forward, sideways, up and down; roll, pitch and yaw), 50 m/s at 1,000 m. In code: <span className="font-mono">aircraftSim6DOF</span> (example: flight.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The aeroplane from above">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={top} role="img" aria-label={`The aeroplane from above: ${run.crashed ? 'it reached the ground' : `height change ${(run.h[n - 1] - h0).toFixed(0)} m at the end`}, up to ${Math.max(...run.nz).toFixed(2)} g`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#7c3aed' }} aria-hidden />bank</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#16a34a' }} aria-hidden />height change</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#f59e0b' }} aria-hidden />extra g</span>
          </div>
          <canvas ref={chart} role="img" aria-label="Bank, height change and load factor over time" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {f.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
