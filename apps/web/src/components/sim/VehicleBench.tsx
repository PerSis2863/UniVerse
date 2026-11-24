'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { CAR_DEFAULT, G, ROLL_DEFAULT, accelRun, brakingDistance, fishhook, handling, rampSteer, sineWithDwell, stepSteer, steerForCircle, vehicleSim, type Vehicle } from '@/lib/lab/vehicle';
import { KerbView } from './KerbView';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Vehicle (M486): a car seen from above running the standard handling tests (a step of
// steering, a slow ramp, the stability-control sine with dwell, a steady circle) on a dry, wet or snowy road, with its
// balance set to understeer, neutral or oversteer. The run is worked out at once (a few thousand steps), then replayed
// in real time; with Reduce Motion it is shown at its end. The maths is vehicle.ts, the same as vehicleSim in code.

type Test = 'step' | 'sinedwell' | 'ramp' | 'circle' | 'fishhook' | 'kerb';
type Road = 'dry' | 'wet' | 'snow';
type Balance = 'under' | 'neutral' | 'over';
// Body roll (M486b): off (one tyre per axle), a saloon's, or a van's tall body that can lift a wheel.
type Body = 'none' | 'saloon' | 'van';
// Suspension geometry (M486c): plain (the wheels stay upright, nothing steers), MacPherson struts (the wheels lean
// most with the body), double wishbones (less lean, the rear steering into the turn as it rolls).
type Susp = 'plain' | 'strut' | 'wishbone';
const SUSP: Record<Susp, { camber?: [number, number]; camberStiff?: number; rollSteer?: [number, number] }> = { plain: {}, strut: { camber: [0.8, 0.8], camberStiff: 0.1, rollSteer: [0.05, 0.05] }, wishbone: { camber: [0.45, 0.45], camberStiff: 0.1, rollSteer: [0.02, 0.1] } };
const MU: Record<Road, number> = { dry: 1, wet: 0.6, snow: 0.3 };
// The rear tyres' cornering stiffness sets the balance: neutral when both axles slip alike (Fzf/Cf = Fzr/Cr).
const CR: Record<Balance, number> = { under: 95000, neutral: (CAR_DEFAULT.cf * CAR_DEFAULT.lf) / CAR_DEFAULT.lr, over: 40000 };
const deg = (r: number) => (r * 180) / Math.PI;

export function VehicleBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [test, setTest] = useState<Test>('sinedwell');
  const [road, setRoad] = useState<Road>('dry');
  const [balance, setBalance] = useState<Balance>('under');
  const [body, setBody] = useState<Body>('none');
  const [front, setFront] = useState(60);
  const [susp, setSusp] = useState<Susp>('plain');
  const [kmh, setKmh] = useState(80);
  const [amp, setAmp] = useState(3.5);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const top = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const car: Vehicle = useMemo(() => {
    const total = ROLL_DEFAULT.kf + ROLL_DEFAULT.kr, roll = body === 'none' ? undefined : { ...ROLL_DEFAULT, kf: (total * front) / 100, kr: (total * (100 - front)) / 100, ...SUSP[susp], ...(body === 'van' ? { track: 1.6, ix: 1400 } : {}) };
    // The van: heavier, its centre of mass 1.2 m up on a 1.6 m track, so past about 0.67 g it tips (M486c).
    return { ...CAR_DEFAULT, mu: MU[road], cr: CR[balance], roll, ...(body === 'van' ? { h: 1.2, m: 2500, iz: 4500, cf: 110000, cr: CR[balance] * 1.4 } : {}) };
  }, [road, balance, body, front, susp]);
  const run = useMemo(() => {
    const u = kmh / 3.6, a = (amp * Math.PI) / 180;
    // The sine with dwell is run coasting, as the test is; the others with a driver holding the speed.
    if (test === 'sinedwell') return vehicleSim(car, sineWithDwell(a), 4.5, { v0: u, force: () => 0, points: 450 });
    if (test === 'fishhook') return vehicleSim(car, fishhook(a), 6, { v0: u, force: () => 0, points: 600 });
    // The kerb trip has its own view (KerbView): a token run keeps this one's hooks steady.
    if (test === 'kerb') return vehicleSim(car, () => 0, 0.05, { speed: u, points: 10 });
    if (test === 'step') return vehicleSim(car, stepSteer(a), 4, { speed: u, points: 400 });
    if (test === 'ramp') return vehicleSim(car, rampSteer(a / 4), 8, { speed: u, points: 800 });
    return vehicleSim(car, () => steerForCircle(car, 40, u), 10, { speed: u, points: 1000 });
  }, [car, test, kmh, amp]);
  const facts = useMemo(() => ({ h: handling(car), acc: accelRun(car), stop: brakingDistance(car, 100 / 3.6) }), [car]);
  const n = run.t.length;

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? n - 1 : 0); setPlaying(!still); }); return () => cancelAnimationFrame(id); }, [run, still, n]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = 0;
    const from = kNow.current, rate = (n - 1) / run.t[n - 1];
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
    const ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', bg = dark ? '#18181b' : '#ffffff', road = dark ? '#27272a' : '#eef0f3';
    // Top view: the whole path fitted, a 10 m grid, the trail so far and the car (green, red once it has spun).
    const T = setup(top.current, W, H);
    if (T) {
      const xs = run.x, ys = run.y, pad = 6;
      const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const s = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
      const X = (x: number) => ox + (x - x0) * s, Y = (y: number) => H - oy - (y - y0) * s;
      T.fillStyle = road; T.fillRect(0, 0, W, H);
      T.strokeStyle = faint; T.lineWidth = 1; T.beginPath();
      for (let gx = Math.ceil(x0 / 10) * 10; gx <= x1; gx += 10) { T.moveTo(X(gx), 0); T.lineTo(X(gx), H); }
      for (let gy = Math.ceil(y0 / 10) * 10; gy <= y1; gy += 10) { T.moveTo(0, Y(gy)); T.lineTo(W, Y(gy)); }
      T.stroke();
      T.strokeStyle = dark ? 'rgba(161,161,170,0.45)' : 'rgba(113,113,122,0.35)'; T.setLineDash([5, 4]); T.beginPath();
      xs.forEach((x, i) => { if (i) T.lineTo(X(x), Y(ys[i])); else T.moveTo(X(x), Y(ys[i])); });
      T.stroke(); T.setLineDash([]);
      T.strokeStyle = '#7c3aed'; T.lineWidth = 2.5; T.beginPath();
      T.moveTo(X(xs[0]), Y(ys[0]));
      for (let i = 1; i <= k; i++) T.lineTo(X(xs[i]), Y(ys[i]));
      T.stroke();
      const spunNow = run.beta.slice(0, k + 1).some((b2) => Math.abs(b2) > (15 * Math.PI) / 180) || (Number.isFinite(run.rolled) && k === n - 1);
      const c = Math.cos(run.psi[k]), sn = Math.sin(run.psi[k]), cx = X(xs[k]), cy = Y(ys[k]);
      const corner = (u: number, v: number) => [cx + (u * c - v * sn) * s, cy - (u * sn + v * c) * s];
      T.fillStyle = spunNow ? '#dc2626' : '#16a34a'; T.strokeStyle = bg; T.lineWidth = 1.5; T.beginPath();
      [[-car.lr - 0.9, -0.9], [car.lf + 0.9, -0.9], [car.lf + 0.9, 0.9], [-car.lr - 0.9, 0.9]].forEach(([u, v], i) => { const [px, py] = corner(u, v); if (i) T.lineTo(px, py); else T.moveTo(px, py); });
      T.closePath(); T.fill(); T.stroke();
      // The front wheels, turned by the steering.
      T.strokeStyle = ink; T.lineWidth = 3;
      for (const side of [-0.75, 0.75]) { const [px, py] = corner(car.lf, side), a = run.psi[k] + run.steer[k]; T.beginPath(); T.moveTo(px - 0.35 * s * Math.cos(a), py + 0.35 * s * Math.sin(a)); T.lineTo(px + 0.35 * s * Math.cos(a), py - 0.35 * s * Math.sin(a)); T.stroke(); }
    }
    // Under it: steering and yaw rate over time, the moment shown marked.
    const C = setup(chart.current, W, 130);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, W, 130);
      const tEnd = run.t[n - 1], tx = (t: number) => 8 + ((W - 16) * t) / tEnd;
      // With body roll, the lean too (the body on its springs plus any tip onto two wheels).
      const series: [number[], string][] = [[run.steer.map(deg), '#f59e0b'], [run.r.map(deg), '#7c3aed'], ...(car.roll ? [[run.roll.map((x, i) => deg(x + run.tip[i])), '#16a34a'] as [number[], string]] : [])];
      const peak = Math.max(1, ...series.flatMap(([v]) => v.map(Math.abs)));
      C.strokeStyle = faint; C.beginPath(); C.moveTo(8, 65); C.lineTo(W - 8, 65); C.stroke();
      for (const [v, colour] of series) { C.strokeStyle = colour; C.lineWidth = 2; C.beginPath(); v.forEach((y, i) => { const px = tx(run.t[i]), py = 65 - (y / peak) * 55; if (i) C.lineTo(px, py); else C.moveTo(px, py); }); C.stroke(); }
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
  const rolled = Number.isFinite(run.rolled), tipped = run.tip.some((x) => x !== 0);
  const peakG = Math.max(...run.ay.map(Math.abs)) / G, peakSlip = deg(Math.max(...run.beta.map(Math.abs))), peakRoll = deg(Math.max(...run.roll.map(Math.abs)));
  const h = facts.h, balanceText = h.K > 1e-6 ? `understeers ${deg(h.K * G).toFixed(1)}°/g` : h.K < -1e-6 ? `oversteers, unstable past ${(h.critical * 3.6).toFixed(0)} km/h` : 'neutral';
  const explain: Record<Test, string> = {
    sinedwell: 'The stability-control test: a 0.7 Hz swing of the steering with a half-second hold, foot off the pedal. A car passes when it keeps pointing where it is going.',
    step: 'A quick turn of the wheel held there: the yaw rate rises, overshoots a little and settles.',
    ramp: 'The steering wound on slowly: the side force grows until the tyres reach their grip.',
    fishhook: 'The rollover test: a quick turn one way, a quarter-second hold, then hard over the other way and held, foot off the pedal. A tall vehicle whose tyres grip more than its width allows tips onto two wheels.',
    kerb: 'A car sliding sideways (after a spin, say) whose wheels hit a kerb stops there at once and pivots over its edge: fast enough and it trips over and tumbles. Soft soil trips it the same way by its wheels digging in. Rollovers on the road mostly start like this.',
    circle: 'A steady 40 m circle with the steering the simple model asks for: an understeering car runs wide as it goes faster.',
  };
  const rollNote = car.roll ? ' With body roll, load moves to the outer tyres, and a tyre with more load grips less per kilo: the axle with the stiffer roll bar loses grip first, so more stiffness at the front understeers and more at the rear can spin.' : '';
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Vehicle settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Test</span>
          <Segmented<Test> label="Test" className="flex-wrap" value={test} onChange={setTest} segments={[{ value: 'sinedwell', label: 'Sine' }, { value: 'step', label: 'Step' }, { value: 'ramp', label: 'Ramp' }, { value: 'circle', label: 'Circle' }, { value: 'fishhook', label: 'Hook' }, { value: 'kerb', label: 'Kerb' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{explain[test]}{rollNote}</p>
        </div>
        <div className="space-y-2">
          <span className={label}>Road</span>
          <Segmented<Road> label="Road" value={road} onChange={setRoad} segments={[{ value: 'dry', label: 'Dry' }, { value: 'wet', label: 'Wet' }, { value: 'snow', label: 'Snow' }]} />
        </div>
        <div className="space-y-2">
          <span className={label}>Balance (the rear tyres)</span>
          <Segmented<Balance> label="Balance" value={balance} onChange={setBalance} segments={[{ value: 'under', label: 'Understeer' }, { value: 'neutral', label: 'Neutral' }, { value: 'over', label: 'Oversteer' }]} />
        </div>
        <div className="space-y-2">
          <span className={label}>Body roll</span>
          <Segmented<Body> label="Body roll" value={body} onChange={setBody} segments={[{ value: 'none', label: 'Off' }, { value: 'saloon', label: 'Saloon' }, { value: 'van', label: 'Tall van' }]} />
        </div>
        {body !== 'none' && range('Roll stiffness at the front', front, 20, 80, 5, `${front} %`, setFront)}
        {body !== 'none' && <div className="space-y-2">
          <span className={label}>Suspension</span>
          <Segmented<Susp> label="Suspension" value={susp} onChange={setSusp} segments={[{ value: 'plain', label: 'Plain' }, { value: 'strut', label: 'Struts' }, { value: 'wishbone', label: 'Wishbones' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{susp === 'plain' ? 'The wheels stay upright and nothing steers as the body rolls.' : susp === 'strut' ? 'Struts let the wheels lean out with the body, which pushes them outwards, and both axles steer a little against the turn: more understeer.' : 'Wishbones keep the wheels more upright; the rear steers into the turn as the body rolls, steadying the car.'}</p>
        </div>}
        {test !== 'kerb' && <>
        {range('Speed', kmh, 30, 150, 5, `${kmh} km/h`, setKmh)}
        {test !== 'circle' && range(test === 'ramp' ? 'Steering after 4 s (at the wheels)' : 'Steering (at the wheels)', amp, 0.5, 8, 0.5, `${amp.toFixed(1)}°`, setAmp)}
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{run.t[k].toFixed(1)} s</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        </>}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">vehicle</span>, <span className="font-mono">vehicleSim</span>, <span className="font-mono">vehicleHandling</span>, <span className="font-mono">accelRun</span>, <span className="font-mono">brakingDistance</span>, <span className="font-mono">magicFormula</span>, <span className="font-mono">vehicleTrip</span> (example: vehicles.m).</p>
      </aside>
      {test === 'kerb' ? <KerbView car={car} /> : <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The car from above">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={top} role="img" aria-label={`The car from above: ${run.spun ? 'it spins' : 'it stays in control'}, up to ${peakG.toFixed(2)} g sideways`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300"><span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#f59e0b' }} aria-hidden />steering</span><span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#7c3aed' }} aria-hidden />yaw rate</span>{car.roll && <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#16a34a' }} aria-hidden />lean</span>}</div>
          <canvas ref={chart} role="img" aria-label="Steering and yaw rate over time" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {([['Result', rolled ? `Rolled over at ${run.rolled.toFixed(1)} s${run.tumble ? `: ${run.tumble.quarters} quarter turns, on its ${run.tumble.rests}` : ''}` : tipped ? 'Up on two wheels' : run.spun ? 'Spun' : run.lift ? 'A wheel lifted' : 'In control'], ['Most sideways', `${peakG.toFixed(2)} g, slip ${peakSlip.toFixed(1)}°${car.roll ? `, lean ${peakRoll.toFixed(1)}°` : ''}`], ['This car', balanceText], ['0–100 km/h · stop from 100', `${Number.isNaN(facts.acc.time) ? '–' : `${facts.acc.time.toFixed(1)} s`} · ${facts.stop.distance.toFixed(0)} m`]] as const).map(([a, b]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b}</p></div>)}
        </div>
      </section>}
    </div>
  );
}
