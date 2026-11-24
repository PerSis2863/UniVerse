'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { PLANE_DEFAULT, lateralModes, lateralSim, turn } from '@/lib/lab/flight';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Aeroplane → Turning (M489b): the same light aeroplane seen from above, rolling and
// yawing: the autopilot turning it onto a new heading, a kick of the rudder that sets off the Dutch roll, or the
// aileron alone (adverse yaw: the nose swings the wrong way first), with or without a yaw damper. Worked out at once,
// replayed twice real time (at its end with Reduce Motion). The maths is flight.ts, the same as aircraftLateralSim.

type Move = 'turn' | 'kick' | 'aileron';
const deg = (r: number) => (r * 180) / Math.PI;
const SPEEDUP = 2;

export function TurnBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [move, setMove] = useState<Move>('turn');
  const [V, setV] = useState(50);
  const [bank, setBank] = useState(30);
  const [damper, setDamper] = useState<'off' | 'on'>('off');
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const top = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const ac = PLANE_DEFAULT, yawDamper = damper === 'on';
  const run = useMemo(() => {
    if (move === 'turn') return lateralSim(ac, 40, { V, holdHeading: () => Math.PI / 2, maxBank: (bank * Math.PI) / 180, yawDamper, points: 800 });
    if (move === 'kick') return lateralSim(ac, 15, { V, rudder: (t) => (t > 0.5 && t < 1 ? 0.15 : t >= 1 && t < 1.5 ? -0.15 : 0), yawDamper, points: 600 });
    return lateralSim(ac, 12, { V, aileron: (t) => (t > 0.5 && t < 2.5 ? 0.06 : t >= 2.5 && t < 3.2 ? -0.06 : 0), yawDamper, points: 600 });
  }, [ac, move, V, bank, yawDamper]);
  const m = useMemo(() => lateralModes(ac, V, 1000), [ac, V]);
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
    // From above, north up: x is along the first heading (up), y to its right. A short run is padded so the wiggles of
    // a straight flight still show; the plane's wings drawn shorter as it banks.
    const T = setup(top.current, W, H);
    if (T) {
      T.fillStyle = dark ? '#0f1a14' : '#eef4ee'; T.fillRect(0, 0, W, H);
      const ys = run.y, xs = run.x, pad = 60;
      const e0 = Math.min(...ys) - pad, e1 = Math.max(...ys) + pad, n0 = Math.min(...xs) - pad, n1 = Math.max(...xs) + pad;
      const s = Math.min(W / (e1 - e0), H / (n1 - n0)), ox = (W - (e1 - e0) * s) / 2, oy = (H - (n1 - n0) * s) / 2;
      const X = (e: number) => ox + (e - e0) * s, Y = (no: number) => H - oy - (no - n0) * s;
      const grid = (n1 - n0) > 1500 ? 500 : 100;
      T.strokeStyle = faint; T.lineWidth = 1; T.beginPath();
      for (let g = Math.ceil(e0 / grid) * grid; g <= e1; g += grid) { T.moveTo(X(g), 0); T.lineTo(X(g), H); }
      for (let g = Math.ceil(n0 / grid) * grid; g <= n1; g += grid) { T.moveTo(0, Y(g)); T.lineTo(W, Y(g)); }
      T.stroke();
      T.strokeStyle = dark ? 'rgba(161,161,170,0.45)' : 'rgba(113,113,122,0.4)'; T.setLineDash([5, 4]); T.beginPath();
      xs.forEach((x, i) => { if (i) T.lineTo(X(ys[i]), Y(x)); else T.moveTo(X(ys[i]), Y(x)); });
      T.stroke(); T.setLineDash([]);
      T.strokeStyle = '#7c3aed'; T.lineWidth = 2.5; T.beginPath(); T.moveTo(X(ys[0]), Y(xs[0]));
      for (let i = 1; i <= k; i++) T.lineTo(X(ys[i]), Y(xs[i]));
      T.stroke();
      const span = 16 * Math.max(0.15, Math.abs(Math.cos(run.phi[k])));
      T.save(); T.translate(X(ys[k]), Y(xs[k])); T.rotate(run.psi[k]);
      T.fillStyle = dark ? '#e4e4e7' : '#3f3f46'; T.strokeStyle = bg; T.lineWidth = 1;
      T.beginPath(); T.moveTo(0, -13); T.lineTo(2, -8); T.lineTo(2, 9); T.lineTo(0, 11); T.lineTo(-2, 9); T.lineTo(-2, -8); T.closePath(); T.fill();
      T.fillRect(-span, -4, 2 * span, 3.5); T.fillRect(-5, 7, 10, 2.5);
      T.restore();
      T.fillStyle = ink; T.font = '11px Inter, system-ui, sans-serif'; T.fillText(`${grid} m squares`, 8, H - 8);
    }
    // Under it: bank and sideslip over time, each scaled to its own range.
    const C = setup(chart.current, W, 130);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, W, 130);
      const tEnd = run.t[n - 1], tx = (t: number) => 8 + ((W - 16) * t) / tEnd;
      C.strokeStyle = faint; C.beginPath(); C.moveTo(8, 65); C.lineTo(W - 8, 65); C.stroke();
      for (const [v, colour] of [[run.phi.map(deg), '#7c3aed'], [run.beta.map(deg), '#f59e0b']] as const) {
        const peak = Math.max(0.5, ...v.map(Math.abs));
        C.strokeStyle = colour; C.lineWidth = 2; C.beginPath(); v.forEach((y, i) => { const px = tx(run.t[i]), py = 65 - (y / peak) * 55; if (i) C.lineTo(px, py); else C.moveTo(px, py); }); C.stroke();
      }
      C.strokeStyle = ink; C.lineWidth = 1; C.beginPath(); C.moveTo(tx(run.t[k]), 6); C.lineTo(tx(run.t[k]), 124); C.stroke();
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label, small } = ui;
  const range = (name: string, value: number, min: number, max: number, step: number, show: string, set: (v: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{show}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );
  const explain: Record<Move, string> = {
    turn: 'The autopilot turns onto a heading 90° to the right: it banks with the ailerons, the rudder keeps the turn clean, and the bank is limited to the angle set.',
    kick: 'A quick kick of the rudder each way: the nose swings and the wings rock together, the Dutch roll, dying away over a few swings. The yaw damper calms it.',
    aileron: 'The ailerons alone, no rudder: the raised wing’s extra drag swings the nose the wrong way at first (adverse yaw), shown by the sideslip.',
  };
  const dutch = m.find((x) => x.name === 'Dutch roll'), roll = m.find((x) => x.name === 'roll'), spiral = m.find((x) => x.name === 'spiral'), tr = turn(V, (bank * Math.PI) / 180);
  const f: [string, string][] = [
    ['Dutch roll', dutch ? `${dutch.period.toFixed(1)} s, damping ${dutch.damping.toFixed(2)}` : '–'],
    ['Roll answers in', roll ? `${(1000 / Math.abs(roll.re)).toFixed(0)} ms` : '–'],
    ['Spiral, left alone', spiral ? (spiral.re < 0 ? `steadies, half in ${spiral.halfTime.toFixed(0)} s` : `tightens, doubles in ${(Math.LN2 / spiral.re).toFixed(0)} s`) : '–'],
    [`A ${bank}° turn`, `${tr.radius.toFixed(0)} m round, ${tr.n.toFixed(2)} g`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Aeroplane settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Manoeuvre</span>
          <Segmented<Move> label="Manoeuvre" value={move} onChange={setMove} segments={[{ value: 'turn', label: 'Turn' }, { value: 'kick', label: 'Rudder kick' }, { value: 'aileron', label: 'Aileron only' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{explain[move]}</p>
        </div>
        <div className="space-y-2">
          <span className={label}>Yaw damper</span>
          <Segmented<'off' | 'on'> label="Yaw damper" value={damper} onChange={setDamper} segments={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
        </div>
        {range('Speed', V, 30, 65, 1, `${V} m/s (${(V * 1.944).toFixed(0)} kn)`, setV)}
        {move === 'turn' && range('Most bank', bank, 10, 45, 5, `${bank}°`, setBank)}
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{run.t[k].toFixed(1)} s</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Height and speed are held at the trim’s here (All six, wind adds the extra lift a turn needs). In code: <span className="font-mono">aircraftLateralModes</span>, <span className="font-mono">aircraftLateralSim</span> (example: flight.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The aeroplane from above">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={top} role="img" aria-label={`The aeroplane from above: heading ${deg(run.psi[n - 1]).toFixed(0)}° at the end, banked up to ${Math.max(...run.phi.map((x) => Math.abs(deg(x)))).toFixed(0)}°`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#7c3aed' }} aria-hidden />bank</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#f59e0b' }} aria-hidden />sideslip</span>
          </div>
          <canvas ref={chart} role="img" aria-label="Bank and sideslip over time" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {f.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
