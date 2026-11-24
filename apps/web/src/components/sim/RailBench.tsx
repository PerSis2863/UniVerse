'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { ROUTES, TRAINS, headway, railRun, routeLength, sectionAt } from '@/lib/lab/rail';
import { ui } from './bench-ui';
import { LineBench } from './LineBench';

// Hyperion Simulate → Machines → Railway (M491): a train (metro, intercity, freight) along a line (metro stops, an
// intercity line with hills, a mountain line), driven the fastest way or to save energy (cruising under the limits and
// coasting into each brake). The speed along the line over its limits, coloured by what the driver is doing, the
// line's height below, and how close trains could follow. Worked out at once; nothing moves.

type RouteName = 'metro' | 'intercity' | 'mountain';
type TrainName = 'metro' | 'intercity' | 'freight';
const MODE_COLOUR = { power: '#16a34a', cruise: '#2563eb', coast: '#f59e0b', brake: '#dc2626', stop: '#71717a' } as const;

// One train (M491) or several sharing the line (M491b, LineBench): one switch at the top of either settings panel.
type View = 'one' | 'many';
export function RailBench() {
  const [view, setView] = useState<View>('one');
  const switcher = <Segmented<View> label="Trains" value={view} onChange={setView} segments={[{ value: 'one', label: 'One train' }, { value: 'many', label: 'Several trains' }]} />;
  return view === 'one' ? <OneTrainBench switcher={switcher} /> : <LineBench switcher={switcher} />;
}

function OneTrainBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode();
  const [routeName, setRouteName] = useState<RouteName>('metro');
  const [trainName, setTrainName] = useState<TrainName>('metro');
  const [coast, setCoast] = useState(0);
  const speed = useRef<HTMLCanvasElement>(null), hill = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const route = useMemo(() => ROUTES[routeName](), [routeName]), train = TRAINS[trainName];
  const run = useMemo(() => railRun(train, route, { coast }), [train, route, coast]);
  const fastest = useMemo(() => railRun(train, route), [train, route]);
  const L = routeLength(route), top = Math.min(train.vmax, Math.max(...route.sections.map((s) => s.limit)));
  const hw = useMemo(() => ({ fixed: headway(train, top), moving: headway(train, top, { moving: true }) }), [train, top]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H1 = Math.max(200, b.clientHeight - 200), H2 = 150;
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    const X = (s: number) => 36 + ((W - 48) * s) / L;
    // Speed along the line: the limits as a dashed step, the train coloured by what it is doing, stations as ticks.
    const S = setup(speed.current, W, H1);
    if (S) {
      S.fillStyle = bg; S.fillRect(0, 0, W, H1);
      const vTop = Math.max(...run.limit) * 1.1, Y = (v: number) => H1 - 22 - ((H1 - 36) * v) / vTop;
      S.font = '11px Inter, system-ui, sans-serif'; S.fillStyle = ink; S.strokeStyle = faint; S.lineWidth = 1;
      for (let kmh = 0; kmh <= vTop * 3.6; kmh += vTop * 3.6 > 120 ? 40 : 20) { S.beginPath(); S.moveTo(36, Y(kmh / 3.6)); S.lineTo(W - 12, Y(kmh / 3.6)); S.stroke(); S.fillText(`${kmh}`, 4, Y(kmh / 3.6) + 4); }
      S.strokeStyle = dark ? '#a1a1aa' : '#71717a'; S.setLineDash([5, 4]); S.beginPath();
      run.limit.forEach((v, i) => { if (i) S.lineTo(X(run.s[i]), Y(v)); else S.moveTo(X(run.s[i]), Y(v)); });
      S.stroke(); S.setLineDash([]);
      S.lineWidth = 2.5;
      for (let i = 0; i < run.s.length - 1; i++) { S.strokeStyle = MODE_COLOUR[run.mode[i]]; S.beginPath(); S.moveTo(X(run.s[i]), Y(run.v[i])); S.lineTo(X(run.s[i + 1]), Y(run.v[i + 1])); S.stroke(); }
      S.fillStyle = ink;
      for (const st of route.stations) { S.fillRect(X(st) - 1, H1 - 20, 2, 8); }
      S.fillText('km/h', 4, 12);
      if (!Number.isNaN(run.stalled)) { S.fillStyle = '#dc2626'; S.fillText('stalled: the hill is too steep for this train', X(run.stalled) + 6, Y(0) - 8); }
    }
    // The line's height from its gradients, curves marked.
    const Hc = setup(hill.current, W, H2);
    if (Hc) {
      Hc.fillStyle = bg; Hc.fillRect(0, 0, W, H2);
      const n = 400, hs: number[] = [];
      let h = 0;
      for (let i = 0; i <= n; i++) { const s = (L * i) / n; if (i) h += ((L / n) * sectionAt(route, s).grade) / 1000; hs.push(h); }
      const lo = Math.min(...hs), hi = Math.max(lo + 10, ...hs), Y = (x: number) => H2 - 16 - ((H2 - 34) * (x - lo)) / (hi - lo);
      Hc.fillStyle = dark ? 'rgba(124,58,237,0.35)' : 'rgba(124,58,237,0.2)'; Hc.beginPath(); Hc.moveTo(X(0), H2 - 16);
      hs.forEach((x, i) => Hc.lineTo(X((L * i) / n), Y(x))); Hc.lineTo(X(L), H2 - 16); Hc.closePath(); Hc.fill();
      let at = 0;
      Hc.fillStyle = '#f59e0b';
      for (const sec of route.sections) { if (sec.radius > 0) Hc.fillRect(X(at), H2 - 12, X(at + sec.length) - X(at), 4); at += sec.length; }
      Hc.fillStyle = ink; Hc.font = '11px Inter, system-ui, sans-serif';
      Hc.fillText(`height: ${(hi - lo).toFixed(0)} m from lowest to highest; amber: curves`, 36, 13);
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label } = ui;
  const stalled = !Number.isNaN(run.stalled);
  const facts: [string, string][] = [
    ['Journey', stalled ? 'Stalled' : `${(run.time / 60).toFixed(1)} min${coast > 0 && Number.isFinite(fastest.time) ? ` (+${(((run.time - fastest.time) / fastest.time) * 100).toFixed(0)}%)` : ''}`],
    ['Energy', `${run.energyKwh.toFixed(0)} kWh${coast > 0 && fastest.energyKwh > 0 ? ` (${(((run.energyKwh - fastest.energyKwh) / fastest.energyKwh) * 100).toFixed(0)}%)` : ''}`],
    ['Braking gave back', `${run.regenKwh.toFixed(0)} kWh`],
    [`Trains an hour at ${(top * 3.6).toFixed(0)} km/h`, `${hw.fixed.perHour.toFixed(0)} blocks · ${hw.moving.perHour.toFixed(0)} moving`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Railway settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Line</span>
          <Segmented<RouteName> label="Line" value={routeName} onChange={setRouteName} segments={[{ value: 'metro', label: 'Metro' }, { value: 'intercity', label: 'Intercity' }, { value: 'mountain', label: 'Mountain' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{routeName === 'metro' ? 'Six stations about a kilometre apart, a short climb round a curve.' : routeName === 'intercity' ? '100 km with one stop, long climbs and two curved stretches with lower limits.' : '18 km climbing 25 per thousand round tight curves.'}</p>
        </div>
        <div className="space-y-2">
          <span className={label}>Train</span>
          <Segmented<TrainName> label="Train" value={trainName} onChange={setTrainName} segments={[{ value: 'metro', label: 'Metro' }, { value: 'intercity', label: 'Intercity' }, { value: 'freight', label: 'Freight' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{train.mass.toLocaleString()} t, {(train.power / 1e6).toFixed(1)} MW, up to {(train.vmax * 3.6).toFixed(0)} km/h, braking {train.brake} m/s².</p>
        </div>
        <label className={label}>Driving style <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{coast === 0 ? 'fastest' : `saving (${Math.round(coast * 100)}%)`}</span>
          <input type="range" min={0} max={0.3} step={0.05} value={coast} onChange={(e) => setCoast(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Saving: cruise a little under each limit and coast (amber) before braking (red), letting the train’s momentum do the work.</p>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">trainModel</span>, <span className="font-mono">railRoute</span>, <span className="font-mono">trainRun</span>, <span className="font-mono">railHeadway</span> (example: railways.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The run along the line">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            {([['power', 'full power'], ['cruise', 'holding the speed'], ['coast', 'coasting'], ['brake', 'braking']] as const).map(([k, t]) => <span key={k}><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: MODE_COLOUR[k] }} aria-hidden />{t}</span>)}
            <span><span className="me-1 inline-block h-0 w-4 border-t-2 border-dashed border-zinc-500 align-middle" aria-hidden />speed limit</span>
          </div>
          <canvas ref={speed} role="img" aria-label={stalled ? 'The speed along the line: the train stalls on the climb' : `The speed along the line: ${(run.time / 60).toFixed(1)} minutes`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <canvas ref={hill} role="img" aria-label="The line's height and curves" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
