'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { EMF_FAULT_LIMIT, EMF_LIMIT, RAIL_LIMIT, ROUTES, SUPPLIES, TRAINS, faultEmf, railLine, routeLength, spaced, storageFor, supplyFor } from '@/lib/lab/rail';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Railway → Several trains (M491b): trains leaving one after another along the same
// track, kept apart by fixed-block signals or moving block, drawn as a train graph (distance against time, one line a
// train: where lines bunch up, trains are waiting at signals). On the intercity line the first can be a slow freight
// train that every train behind has to follow. Worked out at once; nothing moves. The maths is rail.ts (railLine).

type RouteName = 'metro' | 'intercity';
type Signals = 'fixed' | 'moving';
// The intercity line's supply (M491d): 3 kV DC, or 25 kV AC with rail return or autotransformers.
type Kind = 'dc' | 'ac25' | 'ac25at';
const COLOURS = ['#7c3aed', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

export function LineBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode();
  const [routeName, setRouteName] = useState<RouteName>('metro');
  const [signals, setSignals] = useState<Signals>('fixed');
  const [count, setCount] = useState(5);
  const [gap, setGap] = useState(1.5);
  const [block, setBlock] = useState(400);
  const [freightFirst, setFreightFirst] = useState(false);
  const [power, setPower] = useState(false);
  const [subKm, setSubKm] = useState(2);
  const [kind, setKind] = useState<Kind>('dc');
  // M491g: lineside storage midway between substations (DC), and how far a telephone cable runs from an AC line.
  const [store, setStore] = useState(false);
  const [cableM, setCableM] = useState(30);
  const [bonded, setBonded] = useState(false);
  // M491l: the two tracks' rails tied together, and the ground's own resistance (DC; Ω/km, '' not counted).
  const [cross, setCross] = useState(false);
  const [earth, setEarth] = useState<'' | '0.01' | '0.1'>('');
  const graph = useRef<HTMLCanvasElement>(null), volts = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const route = useMemo(() => ROUTES[routeName](), [routeName]), L = routeLength(route);
  const run = useMemo(() => {
    const main = routeName === 'metro' ? TRAINS.metro : TRAINS.intercity;
    const list = Array.from({ length: count }, (_, k) => ({ train: k === 0 && freightFirst && routeName === 'intercity' ? TRAINS.freight : main, depart: k * gap * 60 }));
    const ac = routeName === 'intercity' && kind !== 'dc', sup = power ? { ...SUPPLIES[ac ? kind : routeName](L), subs: spaced(L, subKm * (routeName === 'metro' ? 1000 : ac ? 20000 : 7500)) } : null;
    // Storage: one unit midway between each pair of substations (1 MW, 10 kWh on the metro; 3 MW, 50 kWh on 3 kV).
    if (sup && store) sup.storage = storageFor(sup, sup.subs.slice(1).map((x, k) => (x + sup.subs[k]) / 2), routeName === 'metro' ? 1e6 : ac ? 4e6 : 3e6, routeName === 'metro' ? 10 : ac ? 200 : 50);
    if (sup?.ac && bonded) sup.ac = { ...sup.ac, bonded: true };
    if (sup && cross) sup.crossBond = true;
    if (sup && !sup.ac && earth) sup.earth = Number(earth);
    const cable = { sep: cableM, rho: 100 }, feed = sup ? supplyFor(sup, 0.5, cable) : null;
    return { ...railLine(route, list, { signals, block: routeName === 'metro' ? block : block * 4, supply: feed?.step }), log: feed?.log ?? null, sup, fault: sup?.ac ? Math.max(...faultEmf(sup, cable).map((x) => x.emf)) : 0 };
  }, [route, routeName, L, count, gap, signals, block, freightFirst, power, subKm, kind, store, cableM, bonded, cross, earth]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(240, b.clientHeight - (run.log ? 180 : 40));
    const c = graph.current;
    if (!c || W <= 0) return;
    c.style.width = `${W}px`; c.style.height = `${H}px`; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const tEnd = Math.max(...run.trains.map((x) => x.t[x.t.length - 1])), X = (t: number) => 44 + ((W - 56) * t) / tEnd, Y = (s: number) => H - 24 - ((H - 40) * s) / L;
    g.font = '11px Inter, system-ui, sans-serif';
    // Blocks (fixed signalling) faint, stations dashed and named by their distance.
    if (signals === 'fixed') { g.strokeStyle = faint; g.lineWidth = 1; g.beginPath(); for (const s of run.blocks) { g.moveTo(44, Y(s)); g.lineTo(W - 12, Y(s)); } g.stroke(); }
    g.strokeStyle = dark ? 'rgba(161,161,170,0.5)' : 'rgba(113,113,122,0.45)'; g.setLineDash([5, 4]); g.beginPath();
    for (const s of route.stations) { g.moveTo(44, Y(s)); g.lineTo(W - 12, Y(s)); }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = ink;
    for (const s of route.stations) g.fillText(`${(s / 1000).toFixed(s < 10000 ? 1 : 0)} km`, 4, Y(s) + 4);
    const step = tEnd > 3600 ? 600 : tEnd > 1200 ? 300 : 60;
    for (let t = 0; t <= tEnd; t += step) g.fillText(`${Math.round(t / 60)}′`, X(t) - 6, H - 8);
    run.trains.forEach((x, k) => {
      g.strokeStyle = COLOURS[k % COLOURS.length]; g.lineWidth = 2; g.beginPath();
      let started = false;
      x.t.forEach((t, i) => { if (t < x.depart || t > x.arrive + 1) return; if (started) g.lineTo(X(t), Y(x.s[i])); else { g.moveTo(X(t), Y(x.s[i])); started = true; } });
      g.stroke();
    });
    // The substations as ticks on the distance axis.
    if (run.sup) { g.fillStyle = '#f59e0b'; for (const x of run.sup.subs) g.fillRect(38, Y(x) - 1.5, 6, 3); }
    // Storage units as green ticks.
    if (run.sup?.storage) { g.fillStyle = '#16a34a'; for (const x of run.sup.storage.at) g.fillRect(38, Y(x) - 1.5, 6, 3); }
    // AC: the neutral sections midway between substations, a faint red band trains coast through.
    if (run.sup?.ac) { g.fillStyle = 'rgba(220,38,38,0.35)'; run.sup.subs.slice(1).forEach((x, k) => { const m = (x + run.sup!.subs[k]) / 2; g.fillRect(44, Y(m) - 1, W - 56, 2); }); }
    // Under it: the lowest voltage at a running train, the line where trains trip dashed.
    const vc = volts.current, lg = run.log, sup = run.sup;
    if (vc && lg && sup) {
      const h = 120;
      vc.style.width = `${W}px`; vc.style.height = `${h}px`; vc.width = Math.round(W * dpr); vc.height = Math.round(h * dpr);
      const v = vc.getContext('2d')!; v.setTransform(dpr, 0, 0, dpr, 0, 0);
      v.fillStyle = bg; v.fillRect(0, 0, W, h);
      const lo = Math.min(sup.vmin * 0.8, ...lg.minVolt), hi = sup.vmax * 1.03, VY = (x: number) => h - 12 - ((h - 24) * (x - lo)) / (hi - lo);
      v.strokeStyle = '#dc2626'; v.setLineDash([5, 4]); v.beginPath(); v.moveTo(44, VY(sup.vmin)); v.lineTo(W - 12, VY(sup.vmin)); v.stroke(); v.setLineDash([]);
      v.strokeStyle = '#f59e0b'; v.lineWidth = 1.5; v.beginPath();
      lg.minVolt.forEach((x, i) => { const px = X(lg.t[i]), py = VY(x); if (i) v.lineTo(px, py); else v.moveTo(px, py); });
      v.stroke();
      v.fillStyle = ink; v.font = '11px Inter, system-ui, sans-serif';
      v.fillText(`${sup.vmax} V`, 4, VY(sup.vmax) + 4); v.fillText(`${sup.v0} V`, 4, VY(sup.v0) + 4); v.fillText(`${sup.vmin} V`, 4, VY(sup.vmin) + 4);
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
  const late = run.trains.map((x) => x.arrive - x.depart - x.alone), last = run.trains[run.trains.length - 1];
  const lg = run.log;
  const facts: [string, string][] = lg ? [
    ['Most delayed', `${(Math.max(...late) / 60).toFixed(1)} min (train ${late.indexOf(Math.max(...late)) + 1})`],
    ['Lowest voltage', `${run.sup?.ac ? `${(Math.min(...lg.minVolt) / 1000).toFixed(1)} kV` : `${Math.min(...lg.minVolt).toFixed(0)} V`}${lg.tripped > 0 ? `, tripped ${lg.tripped.toFixed(0)} s` : ''}`],
    ['From the substations · lost', `${lg.fromSubsKwh.toFixed(0)} kWh · ${lg.lossKwh.toFixed(0)} kWh`],
    ...(run.sup && !run.sup.ac ? [['Rails to earth · stray current', `${lg.maxRail.toFixed(0)} V · ${((lg.strayAs / Math.max(lg.t.length * 0.5, 1e-9)) * 1000).toFixed(0)} mA`] as [string, string]] : []),
    ...(run.sup?.ac ? [['Rails to earth, most', `${lg.maxRail.toFixed(0)} V${lg.maxRail > RAIL_LIMIT ? ' (over 60)' : ''}`] as [string, string]] : []),
    run.sup?.ac ? ['In a cable beside it, running · a fault', `${lg.maxEmf.toFixed(0)} V${lg.maxEmf > EMF_LIMIT ? ' (over 60)' : ''} · ${run.fault.toFixed(0)} V${run.fault > EMF_FAULT_LIMIT ? ' (over 430)' : ''}`]
      : run.sup?.storage ? ['Braking reused · burnt · stored', `${lg.regenUsedKwh.toFixed(0)} · ${lg.regenWastedKwh.toFixed(0)} · ${lg.storedKwh.toFixed(0)} kWh`]
      : ['Braking reused · burnt', `${lg.regenUsedKwh.toFixed(0)} kWh · ${lg.regenWastedKwh.toFixed(0)} kWh`],
  ] : [
    ['Last train arrives', Number.isFinite(last.arrive) ? `at ${(last.arrive / 60).toFixed(1)} min` : 'Not yet'],
    ['Most delayed', `${(Math.max(...late) / 60).toFixed(1)} min (train ${late.indexOf(Math.max(...late)) + 1})`],
    ['Held at signals, all trains', `${(run.trains.reduce((s, x) => s + x.held, 0) / 60).toFixed(1)} min`],
    ['On time (under 1 min late)', `${late.filter((x) => x < 60).length} of ${run.trains.length}`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Railway settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Line</span>
          <Segmented<RouteName> label="Line" value={routeName} onChange={setRouteName} segments={[{ value: 'metro', label: 'Metro' }, { value: 'intercity', label: 'Intercity' }]} />
        </div>
        <div className="space-y-2">
          <span className={label}>Signals</span>
          <Segmented<Signals> label="Signals" value={signals} onChange={setSignals} segments={[{ value: 'fixed', label: 'Fixed blocks' }, { value: 'moving', label: 'Moving block' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{signals === 'fixed' ? 'The line is cut into blocks; a train may enter one only when no part of another train is in it, so it brakes for a red signal however close the train ahead really is.' : 'Each train knows where the one ahead ends and may run up to 50 m behind it: trains can follow much closer.'}</p>
        </div>
        {range('Trains', count, 2, 8, 1, `${count}`, setCount)}
        {range('Minutes between departures', gap, routeName === 'metro' ? 0.5 : 2, routeName === 'metro' ? 4 : 15, routeName === 'metro' ? 0.5 : 1, `${gap}`, setGap)}
        {signals === 'fixed' && range('Block length', block, 200, 1000, 100, `${routeName === 'metro' ? block : block * 4} m`, setBlock)}
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={power} onChange={(e) => setPower(e.target.checked)} className="h-4 w-4 accent-violet-600" />The power supply{routeName === 'metro' ? ' (750 V DC)' : ''}</label>
        {power && routeName === 'intercity' && <Segmented<Kind> label="Supply" value={kind} onChange={setKind} segments={[{ value: 'dc', label: '3 kV DC' }, { value: 'ac25', label: '25 kV AC' }, { value: 'ac25at', label: '2 × 25 kV' }]} />}
        {power && range('Substations every', subKm, 1, 5, 1, `${routeName === 'metro' ? subKm : routeName === 'intercity' && kind !== 'dc' ? subKm * 20 : subKm * 7.5} km`, setSubKm)}
        {power && routeName === 'intercity' && kind !== 'dc' && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Each substation feeds its own stretch out to the neutral sections midway to its neighbours (red: they’re on different phases, so trains coast through with their power off). The line’s reactance sags the voltage more than its resistance; {kind === 'ac25at' ? 'autotransformers feed at 50 kV, so trains see about a third of the drop' : 'the current returns through the rails'}. Under 17.5 kV trains trip; the grid takes back all braking.</p>}
        {power && routeName === 'intercity' && kind !== 'dc' && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={bonded} onChange={(e) => setBonded(e.target.checked)} className="h-4 w-4 accent-violet-600" />Rails bonded to earth at the substations</label>}
        {power && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} className="h-4 w-4 accent-violet-600" />Both tracks’ rails tied together (half the rails’ voltage)</label>}
        {power && (routeName === 'metro' || kind === 'dc') && <div className="space-y-1"><span className="text-[13px] text-zinc-700 dark:text-zinc-200">The ground’s own resistance</span><Segmented<'' | '0.01' | '0.1'> label="The ground’s own resistance" value={earth} onChange={setEarth} segments={[{ value: '', label: 'Not counted' }, { value: '0.01', label: 'Wet clay' }, { value: '0.1', label: 'Dry rock' }]} /></div>}
        {power && routeName === 'intercity' && kind !== 'dc' && range('A telephone cable beside it, at', cableM, 10, 300, 10, `${cableM} m`, setCableM)}
        {power && routeName === 'intercity' && kind !== 'dc' && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">The line’s current, returning partly through the ground, induces a voltage along the cable ({kind === 'ac25at' ? 'autotransformers cancel about nine tenths of it' : 'the rails cancel about half'}). Allowed: 60 V while trains run, 430 V during a fault (shown for a short at the far end of a section).</p>}
        {power && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} className="h-4 w-4 accent-violet-600" />Storage between substations ({routeName === 'metro' ? '1 MW, 10 kWh' : kind !== 'dc' ? '4 MW, 200 kWh: it props up the voltage where it sags' : '3 MW, 50 kWh'})</label>}
        {power && (routeName === 'metro' || kind === 'dc') && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Each train draws from the substations (amber ticks) through the line’s resistance: far from them and with many trains pulling, the voltage sags and trains lose power; under {routeName === 'metro' ? '500' : '2,000'} V they trip. A braking train feeds the others; what nobody takes is burnt in its resistors{store ? ', unless the storage (green ticks) soaks it up to give back when a train pulls away' : ''}.</p>}
        {routeName === 'intercity' && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={freightFirst} onChange={(e) => setFreightFirst(e.target.checked)} className="h-4 w-4 accent-violet-600" />A slow freight train first</label>}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Each line is a train: steep means fast, flat means stopped. Where lines crowd together, trains are waiting for the one ahead. In code: <span className="font-mono">railLine</span> with <span className="font-mono">{"'Supply'"}</span> (example: railways.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The train graph">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
            {run.trains.map((x, k) => <span key={k}><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: COLOURS[k % COLOURS.length] }} aria-hidden />{k + 1}{x.name === 'freight' ? ' freight' : ''}</span>)}
          </div>
          <canvas ref={graph} role="img" aria-label={`Train graph: ${run.trains.length} trains, distance against time; the most delayed ${(Math.max(...late) / 60).toFixed(1)} minutes late`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          {lg && <canvas ref={volts} role="img" aria-label={`The lowest voltage at a train over time, down to ${Math.min(...lg.minVolt).toFixed(0)} V`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />}
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
