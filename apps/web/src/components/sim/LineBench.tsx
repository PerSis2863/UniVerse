'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { ROUTES, TRAINS, railLine, routeLength } from '@/lib/lab/rail';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Railway → Several trains (M491b): trains leaving one after another along the same
// track, kept apart by fixed-block signals or moving block, drawn as a train graph (distance against time, one line a
// train: where lines bunch up, trains are waiting at signals). On the intercity line the first can be a slow freight
// train that every train behind has to follow. Worked out at once; nothing moves. The maths is rail.ts (railLine).

type RouteName = 'metro' | 'intercity';
type Signals = 'fixed' | 'moving';
const COLOURS = ['#7c3aed', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

export function LineBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode();
  const [routeName, setRouteName] = useState<RouteName>('metro');
  const [signals, setSignals] = useState<Signals>('fixed');
  const [count, setCount] = useState(5);
  const [gap, setGap] = useState(1.5);
  const [block, setBlock] = useState(400);
  const [freightFirst, setFreightFirst] = useState(false);
  const graph = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const route = useMemo(() => ROUTES[routeName](), [routeName]), L = routeLength(route);
  const run = useMemo(() => {
    const main = routeName === 'metro' ? TRAINS.metro : TRAINS.intercity;
    const list = Array.from({ length: count }, (_, k) => ({ train: k === 0 && freightFirst && routeName === 'intercity' ? TRAINS.freight : main, depart: k * gap * 60 }));
    return railLine(route, list, { signals, block: routeName === 'metro' ? block : block * 4 });
  }, [route, routeName, count, gap, signals, block, freightFirst]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(240, b.clientHeight - 40);
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
  const facts: [string, string][] = [
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
        {routeName === 'intercity' && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={freightFirst} onChange={(e) => setFreightFirst(e.target.checked)} className="h-4 w-4 accent-violet-600" />A slow freight train first</label>}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Each line is a train: steep means fast, flat means stopped. Where lines crowd together, trains are waiting for the one ahead. In code: <span className="font-mono">railLine</span> (example: railways.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The train graph">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
            {run.trains.map((x, k) => <span key={k}><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: COLOURS[k % COLOURS.length] }} aria-hidden />{k + 1}{x.name === 'freight' ? ' freight' : ''}</span>)}
          </div>
          <canvas ref={graph} role="img" aria-label={`Train graph: ${run.trains.length} trains, distance against time; the most delayed ${(Math.max(...late) / 60).toFixed(1)} minutes late`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
