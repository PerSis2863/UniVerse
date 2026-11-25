'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { CYCLES, EV_DEFAULT, efficiency, evCharge, evSim, packKwh, torqueLimit, type Ev } from '@/lib/lab/ev';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Electric car (M488): pick a drive (town, suburbs, motorway, all three), the battery's
// size, the load, regenerative braking and the heating; see the speed and the battery's power over the drive, where the
// motor works on its efficiency map, how far a charge goes, and a fast charge's curve. Worked out at once on the page
// (a few thousand one-second steps); nothing moves, so nothing to calm for Reduce Motion. The maths is ev.ts.

type Drive = 'city' | 'suburban' | 'motorway' | 'mixed';
type Charger = '50' | '150' | '250';

export function EvBench() {
  const dark = useDarkMode();
  const [drive, setDrive] = useState<Drive>('mixed');
  const [parallel, setParallel] = useState(EV_DEFAULT.parallel);
  const [load, setLoad] = useState(100);
  const [regen, setRegen] = useState(true);
  const [heat, setHeat] = useState(0.4);
  const [charger, setCharger] = useState<Charger>('150');
  const trace = useRef<HTMLCanvasElement>(null), map = useRef<HTMLCanvasElement>(null), charge = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const car: Ev = useMemo(() => ({ ...EV_DEFAULT, parallel, m: EV_DEFAULT.m - 100 + load + (parallel - EV_DEFAULT.parallel) * 9.5, regen: regen ? 1 : 0, aux: heat * 1000 }), [parallel, load, regen, heat]);
  const run = useMemo(() => evSim(car, CYCLES[drive]()), [car, drive]);
  const ch = useMemo(() => evCharge(car, Number(charger) * 1000), [car, charger]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H1 = 170, H2 = Math.max(180, b.clientHeight - H1 - 40), half = (W - 12) / 2;
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number) => { ctx.fillStyle = ink; ctx.font = '11px Inter, system-ui, sans-serif'; ctx.fillText(s, x, y); };
    // The drive: speed (green) and the battery's power (violet above zero drawing, below it charging from braking).
    const T = setup(trace.current, W, H1);
    if (T) {
      T.fillStyle = bg; T.fillRect(0, 0, W, H1);
      const n = run.t.length, tEnd = run.t[n - 1] || 1, X = (t: number) => 10 + ((W - 20) * t) / tEnd, mid = H1 * 0.62;
      const vMax = Math.max(1, ...run.v), pMax = Math.max(1, ...run.pbat.map(Math.abs));
      T.strokeStyle = faint; T.beginPath(); T.moveTo(10, mid); T.lineTo(W - 10, mid); T.stroke();
      T.fillStyle = 'rgba(124,58,237,0.35)'; T.beginPath(); T.moveTo(X(0), mid);
      run.pbat.forEach((p, i) => T.lineTo(X(run.t[i]), mid - (p / pMax) * (mid - 14)));
      T.lineTo(X(tEnd), mid); T.closePath(); T.fill();
      T.strokeStyle = '#16a34a'; T.lineWidth = 2; T.beginPath();
      run.v.forEach((v, i) => { const px = X(run.t[i]), py = H1 - 8 - (v / vMax) * (H1 - 22); if (i) T.lineTo(px, py); else T.moveTo(px, py); });
      T.stroke();
      text(T, `top ${(vMax * 3.6).toFixed(0)} km/h · battery up to ${(Math.max(...run.pbat) / 1000).toFixed(0)} kW, back ${Math.max(0, -Math.min(...run.pbat) / 1000).toFixed(0)} kW`, 12, 14);
    }
    // The motor's efficiency map, its working points over the drive as dots.
    const M = setup(map.current, half, H2);
    if (M) {
      M.fillStyle = bg; M.fillRect(0, 0, half, H2);
      const nx = 60, ny = 40, cw = (half - 20) / nx, chh = (H2 - 30) / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const w = ((i + 0.5) * car.wmax) / nx, t = car.tmax - ((j + 0.5) * 2 * car.tmax) / ny;
        if (Math.abs(t) > torqueLimit(car, w)) continue;
        const eff = efficiency(car, t, w), k = Math.max(0, Math.min(1, (eff - 0.85) / 0.12));
        M.fillStyle = `hsl(${230 - k * 190} ${60 + k * 25}% ${dark ? 25 + k * 30 : 88 - k * 38}%)`;
        M.fillRect(10 + i * cw, 20 + j * chh, cw + 0.5, chh + 0.5);
      }
      M.fillStyle = dark ? 'rgba(250,250,250,0.85)' : 'rgba(24,24,27,0.75)';
      run.tm.forEach((t, i) => { if (i % 2) return; const px = 10 + (run.wm[i] / car.wmax) * (half - 20), py = 20 + ((car.tmax - t) / (2 * car.tmax)) * (H2 - 30); M.fillRect(px - 1, py - 1, 2, 2); });
      M.strokeStyle = faint; M.beginPath(); M.moveTo(10, 20 + (H2 - 30) / 2); M.lineTo(half - 10, 20 + (H2 - 30) / 2); M.stroke();
      text(M, 'Motor efficiency, blue 85% or less to amber 97%; dots where it worked', 10, 13);
    }
    // The fast charge: charge (green) and power (violet) over minutes.
    const C = setup(charge.current, half, H2);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, half, H2);
      const tEnd = ch.t[ch.t.length - 1] || 1, X = (t: number) => 10 + ((half - 20) * t) / tEnd, pMax = Math.max(1, ...ch.p);
      C.strokeStyle = faint; C.beginPath(); C.moveTo(10, 20 + (H2 - 30) * 0.2); C.lineTo(half - 10, 20 + (H2 - 30) * 0.2); C.stroke();
      for (const [vals, colour, scale] of [[ch.soc, '#16a34a', 1], [ch.p, '#7c3aed', pMax]] as const) {
        C.strokeStyle = colour; C.lineWidth = 2; C.beginPath();
        vals.forEach((v, i) => { const px = X(ch.t[i]), py = H2 - 10 - (v / scale) * (H2 - 30); if (i) C.lineTo(px, py); else C.moveTo(px, py); });
        C.stroke();
      }
      text(C, `Charging at ${charger} kW: charge (green), power (violet); the line is 80%`, 10, 13);
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label } = ui;
  const range = (name: string, value: number, min: number, max: number, step: number, show: string, set: (v: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{show}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );
  const facts: [string, string][] = [['Energy', `${run.whPerKm.toFixed(0)} Wh/km`], ['On a charge', `about ${run.range.toFixed(0)} km`], ['Braking gave back', `${run.driveWh > 0 ? Math.round((100 * run.regenWh) / run.driveWh) : 0}% of driving`], ['10 → 80%', Number.isNaN(ch.to80) ? '–' : `${(ch.to80 / 60).toFixed(0)} min`]];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Electric car settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Drive</span>
          <Segmented<Drive> label="Drive" value={drive} onChange={setDrive} segments={[{ value: 'city', label: 'Town' }, { value: 'suburban', label: 'Suburbs' }, { value: 'motorway', label: 'Motorway' }, { value: 'mixed', label: 'All' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Made-up drives in the manner of the standard test cycles: stop-start town, faster suburbs, a motorway at 100–130 km/h.</p>
        </div>
        {range('Battery', parallel, 20, 70, 2, `${packKwh({ ...EV_DEFAULT, parallel }).toFixed(0)} kWh`, setParallel)}
        {range('People and luggage', load, 75, 500, 25, `${load} kg`, setLoad)}
        {range('Heating or air conditioning', heat, 0, 4, 0.1, `${heat.toFixed(1)} kW`, setHeat)}
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} className="h-4 w-4 accent-violet-600" />Regenerative braking</label>
        <div className="space-y-2">
          <span className={label}>Charger</span>
          <Segmented<Charger> label="Charger" value={charger} onChange={setCharger} segments={[{ value: '50', label: '50 kW' }, { value: '150', label: '150 kW' }, { value: '250', label: '250 kW' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">The pack takes at most twice its capacity an hour, then the current falls as the cells near 4.2 V: a bigger charger helps less than it promises.</p>
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">evModel</span>, <span className="font-mono">driveCycle</span>, <span className="font-mono">evSim</span>, <span className="font-mono">evMotorMap</span>, <span className="font-mono">evCharge</span> (example: electric_car.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The electric car's drive">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#16a34a' }} aria-hidden />speed</span>
            <span><span className="me-1 inline-block h-2 w-4 align-middle" style={{ background: 'rgba(124,58,237,0.35)' }} aria-hidden />battery power (below the line: charging while braking)</span>
          </div>
          <canvas ref={trace} role="img" aria-label={`The drive: ${run.km.toFixed(1)} km at ${run.whPerKm.toFixed(0)} Wh/km`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex gap-3">
            <canvas ref={map} role="img" aria-label="The motor's efficiency map with where it worked" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
            <canvas ref={charge} role="img" aria-label={`A fast charge: to 80% in ${(ch.to80 / 60).toFixed(0)} minutes`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
