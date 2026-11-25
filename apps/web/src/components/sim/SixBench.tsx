'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { PLANE_DEFAULT, flight6, vmc } from '@/lib/lab/flight';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Aeroplane → All six (M489c): the whole aeroplane at once, so turning and climbing
// affect each other, and wind: a half turn (with the autopilot holding height and speed, or hands off so it sinks), a
// steady wind from the left (it crabs into it and drifts), a '1 − cos' gust from below, and turbulence. Seen from
// above, with bank, height change and load factor below. Worked out at once, replayed twice real time (at its end with
// Reduce Motion). The maths is flight.ts (flight6), the same as aircraftSim6DOF in code. M489d: a twin's engine failing
// (feathered or windmilling), the propeller's pull at climb power, and a microburst at 300 m.

type Move = 'turn' | 'cross' | 'gust' | 'rough' | 'engine' | 'prop' | 'burst';
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
  const [feather, setFeather] = useState(false);
  const [propOn, setPropOn] = useState(true);
  const [low, setLow] = useState(false);
  const [turning, setTurning] = useState(false);
  // M489g: the gust's front at an angle (degrees), reaching the right wing first.
  const [front, setFront] = useState<'0' | '30' | '60'>('0');
  // M489h: the tail meeting the gust after the wing.
  const [tailLag, setTailLag] = useState(false);
  // M489i: in rough air, the tail meeting the same gusts after the wing.
  const [roughTail, setRoughTail] = useState(false);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const top = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const ac = PLANE_DEFAULT, V = 50, h0 = 1000;
  const run = useMemo(() => {
    const pilot = { holdHeight: () => h0, holdSpeed: V, yawDamper: true };
    if (move === 'turn') return flight6(ac, 50, { V0: V, h0, holdHeading: () => Math.PI * 0.999, maxBank: (35 * Math.PI) / 180, ...(hold === 'hold' ? pilot : {}), points: 700 });
    // A wind from the west (blowing east) while the autopilot keeps the nose north.
    if (move === 'cross') return flight6(ac, 60, { V0: V, h0, wind: { steady: [0, wind, 0] }, holdHeading: () => 0, ...pilot, points: 700 });
    if (move === 'gust') return flight6(ac, 12, { V0: V, h0, wind: { gust: { at: 2, length: 60, up: wind / 2, skew: (Number(front) * Math.PI) / 180, tail: tailLag } }, points: 1200 });
    // A twin's right engine stops 5 s in.
    if (move === 'engine') return flight6(ac, 40, { V0: V, h0, engines: { count: 2, fail: { at: 5, which: 1 }, feather }, ...(hold === 'hold' ? { holdHeading: () => 0, yawDamper: true } : {}), points: 800 });
    // Full power at 35 m/s, climbing: the propeller swings the nose left.
    if (move === 'prop') return flight6(ac, 20, { V0: 35, h0: 500, throttle: () => 1, holdHeight: () => 1500, prop: propOn ? { dir: 1 } : undefined, ...(hold === 'hold' ? { holdHeading: () => 0, yawDamper: true } : {}), points: 800 });
    // A microburst 1.5 km ahead at 300 m.
    if (move === 'burst') return flight6(ac, 60, { V0: V, h0: 300, wind: { microburst: { n: 1500, e: 0, radius: 600, outflow: wind * 1.5, down: wind * 0.8 } }, ...(hold === 'hold' ? { holdHeight: () => 300, holdSpeed: V } : {}), points: 1200 });
    // Near the ground (M489e): at 60 m, the turbulence of a wind 6 m up ten times its rms (MIL-F-8785C, by height).
    if (low) return flight6(ac, 60, { V0: V, h0: 60, wind: { turbulence: { sigma: 0, w20: ROUGH[rough] * 10, seed: 3, rotational: turning, tailLag: roughTail } }, holdHeading: () => 0, holdHeight: () => 60, holdSpeed: V, yawDamper: true, points: 1200 });
    return flight6(ac, 60, { V0: V, h0, wind: { turbulence: { sigma: ROUGH[rough], seed: 3, rotational: turning, tailLag: roughTail } }, holdHeading: () => 0, ...pilot, points: 1200 });
  }, [ac, move, hold, wind, rough, feather, propOn, low, turning, front, tailLag, roughTail]);
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
      // The microburst's ring, where its outflow is strongest.
      if (move === 'burst') { T.strokeStyle = 'rgba(220,38,38,0.55)'; T.lineWidth = 1.5; T.setLineDash([4, 4]); T.beginPath(); T.arc(X(0), Y(1500), 600 * s, 0, 2 * Math.PI); T.stroke(); T.setLineDash([]); }
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
      const start = run.h[0];
    for (const [v, colour] of [[run.phi.map(deg), '#7c3aed'], [run.h.map((h) => h - start), '#16a34a'], [move === 'burst' ? run.V.map((x) => x - run.V[0]) : run.nz.map((x) => x - 1), '#f59e0b']] as const) {
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
    gust: 'Level flight into a rising gust (a smooth bump of air, 60 m long): the wing meets the air at a steeper angle, lift jumps and it is pushed up, then the nose settles. A front at an angle reaches the right wing first: it lifts first, and the wings rock.',
    engine: hold === 'hold' ? `A twin’s right engine stops 5 s in. The other, out on the left wing, now pushes alone and yaws the nose right; the autopilot holds the heading with left rudder, banked a little towards the good engine, and it sinks${feather ? ' (the dead propeller feathered, edge-on, so it drags less)' : ' (the dead propeller windmilling, dragging)'}. Below ${vmc(ac, undefined, 1.8, h0, feather).toFixed(0)} m/s (Vmc) full rudder couldn’t hold it.` : 'A twin’s right engine stops 5 s in, hands off: it yaws and rolls towards the dead engine and spirals down.',
    prop: propOn ? (hold === 'hold' ? 'Full power at 35 m/s, climbing: the propeller (clockwise seen from behind) rolls the aeroplane left by its torque, its spiralling slipstream hits the fin and the descending blade pulls harder (P-factor), swinging the nose left; the autopilot holds the heading with right rudder.' : 'Full power at 35 m/s, climbing, hands off: the propeller’s torque, slipstream and P-factor swing the nose left and roll it left. (It is rigged so they cancel at cruise power.)') : 'Full power at 35 m/s with the propeller’s side effects left out: it climbs straight.',
    burst: hold === 'hold' ? 'Flying into a microburst at 300 m: a headwind first (the airspeed jumps), then air falling down its middle, then a tailwind (the airspeed drops). The autopilot pulls up and adds power, and still loses height.' : 'The same microburst hands off: the headwind lifts it, then the falling air and the tailwind take away airspeed and height: the kind of wind shear that brings aeroplanes down on approach.',
    rough: 'Random gusts in every direction (Dryden turbulence) with the autopilot holding heading, height and speed: the wings rock and the load jumps about.',
  };
  const h00 = run.h[0], ground = run.ground[k], lost = Math.min(0, ...run.h.map((h) => h - h00)), drift = deg(Math.atan2(run.e[n - 1] - run.e[0], run.n[n - 1] - run.n[0]));
  const f: [string, string][] = [
    ['Heading · track', move === 'cross' ? `${deg(run.psi[k]).toFixed(0)}° · ${drift.toFixed(0)}°` : `${((deg(run.psi[k]) + 360) % 360).toFixed(0)}°`],
    ['Height change', `${(run.h[k] - h00).toFixed(0)} m (most ${lost.toFixed(0)} m)`],
    move === 'burst' ? ['Airspeed, most · least', `${Math.max(...run.V).toFixed(0)} · ${Math.min(...run.V).toFixed(0)} m/s`] : move === 'engine' || move === 'prop' ? ['Sideslip · rudder', `${deg(run.beta[k]).toFixed(1)}° · ${deg(run.dr[k]).toFixed(1)}°`] : ['Load factor, most', `${Math.max(...run.nz).toFixed(2)} g`],
    ['Air · ground speed', `${run.V[k].toFixed(0)} · ${ground.toFixed(0)} m/s`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Aeroplane settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Flight</span>
          <Segmented<Move> label="Flight" value={move} onChange={setMove} className="flex-wrap" segments={[{ value: 'turn', label: 'Turn' }, { value: 'cross', label: 'Crosswind' }, { value: 'gust', label: 'Gust' }, { value: 'rough', label: 'Rough' }, { value: 'engine', label: 'Engine out' }, { value: 'prop', label: 'Propeller' }, { value: 'burst', label: 'Microburst' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{explain[move]}</p>
        </div>
        {(move === 'turn' || move === 'engine' || move === 'prop' || move === 'burst') && <div className="space-y-2">
          <span className={label}>{move === 'turn' || move === 'burst' ? 'Height and speed' : 'Heading'}</span>
          <Segmented<'hold' | 'off'> label={move === 'turn' || move === 'burst' ? 'Height and speed' : 'Heading'} value={hold} onChange={setHold} segments={[{ value: 'hold', label: 'Autopilot holds' }, { value: 'off', label: 'Hands off' }]} />
        </div>}
        {move === 'engine' && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={feather} onChange={(e) => setFeather(e.target.checked)} className="h-4 w-4 accent-violet-600" />Feather the dead propeller</label>}
        {move === 'prop' && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={propOn} onChange={(e) => setPropOn(e.target.checked)} className="h-4 w-4 accent-violet-600" />The propeller’s torque, slipstream and P-factor</label>}
        {(move === 'cross' || move === 'gust' || move === 'burst') && <label className={label}>{move === 'cross' ? 'Wind' : move === 'gust' ? 'Gust' : 'Outflow'} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{move === 'cross' ? wind : move === 'gust' ? wind / 2 : wind * 1.5} m/s</span>
          <input type="range" min={2} max={20} step={1} value={wind} onChange={(e) => setWind(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>}
        {move === 'gust' && <div className="space-y-1"><span className={label}>The gust’s front</span>
          <Segmented<'0' | '30' | '60'> label="The gust’s front" value={front} onChange={setFront} segments={[{ value: '0', label: 'Square on' }, { value: '30', label: 'At 30°' }, { value: '60', label: 'At 60°' }]} />
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={tailLag} onChange={(e) => setTailLag(e.target.checked)} className="h-4 w-4 accent-violet-600" />The tail meets it later (the nose pitches)</label>
        </div>}
        {move === 'rough' && <div className="space-y-2">
          <span className={label}>Turbulence</span>
          <Segmented<Rough> label="Turbulence" value={rough} onChange={setRough} segments={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }]} />
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} className="h-4 w-4 accent-violet-600" />Near the ground (60 m): smaller, sharper eddies</label>
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={turning} onChange={(e) => setTurning(e.target.checked)} className="h-4 w-4 accent-violet-600" />Gusts that turn the air too (rolling the wings)</label>
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={roughTail} onChange={(e) => setRoughTail(e.target.checked)} className="h-4 w-4 accent-violet-600" />The tail meets each gust after the wing (pitching)</label>
        </div>}
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{run.t[k].toFixed(1)} s</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">All six motions at once (forward, sideways, up and down; roll, pitch and yaw), 50 m/s at 1,000 m (the propeller at 35 m/s from 500 m, the microburst at 300 m). In code: <span className="font-mono">aircraftSim6DOF</span>; the propeller there also pulls the nose sideways as it pitches (gyroscopic) (example: flight.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The aeroplane from above">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={top} role="img" aria-label={`The aeroplane from above: ${run.crashed ? 'it reached the ground' : `height change ${(run.h[n - 1] - run.h[0]).toFixed(0)} m at the end`}, up to ${Math.max(...run.nz).toFixed(2)} g`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#7c3aed' }} aria-hidden />bank</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#16a34a' }} aria-hidden />height change</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#f59e0b' }} aria-hidden />{move === 'burst' ? 'airspeed change' : 'extra g'}</span>
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
