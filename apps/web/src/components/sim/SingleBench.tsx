'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { ROUTES, TRAINS, railSingle, routeLength, type Dispatch, type SingleTrain } from '@/lib/lab/rail';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Railway → Single track (M491e): trains both ways on one track, passing only at
// stations, to a timetable (each train's run alone padded, plus the dwells). Drawn as a train graph: outbound trains
// violet, return trains amber, the timetable dotted; where a solid line leaves its dotted one, a train is late. The first
// train can start late to see the delay spread or the meet move. Worked out at once; nothing moves. The maths is
// rail.ts (railSingle). M491f: passing loops midway between stations (dotted), an express that runs through the middle
// stations, a branch train joining at the middle station, and the dispatcher (first come, by priority, or the best
// order found); the express and the branch train weigh twice as much for the dispatcher.

type RouteName = 'metro' | 'intercity';
const OUT = ['#7c3aed', '#6d28d9', '#8b5cf6', '#5b21b6'], BACK = ['#f59e0b', '#d97706', '#fbbf24', '#b45309'];

export function SingleBench({ switcher }: { switcher: ReactNode }) {
  const dark = useDarkMode();
  const [routeName, setRouteName] = useState<RouteName>('metro');
  const [each, setEach] = useState(2);
  const [gap, setGap] = useState(10);
  const [offset, setOffset] = useState(0);
  const [late, setLate] = useState(0);
  const [tracks, setTracks] = useState(2);
  const [pad, setPad] = useState(5);
  const [loopsOn, setLoopsOn] = useState(false);
  const [express, setExpress] = useState(false);
  const [branch, setBranch] = useState(false);
  const [dispatch, setDispatch] = useState<Dispatch>('fcfs');
  const graph = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const route = useMemo(() => ROUTES[routeName](), [routeName]), L = routeLength(route);
  // Minutes on the metro, five times as long on the intercity line (its runs take about that much longer).
  const unit = routeName === 'metro' ? 60 : 300;
  const run = useMemo(() => {
    const t = routeName === 'metro' ? TRAINS.metro : TRAINS.intercity, list: SingleTrain[] = [], S = route.stations.length, mid = Math.floor((S - 1) / 2);
    for (let k = 0; k < each; k++) {
      // The second outbound train is the express: it stops only at the ends.
      const fast = express && k === 1;
      list.push({ train: t, dir: 1, depart: k * gap * unit, late: k === 0 ? late * unit : 0, skip: fast ? route.stations.map((_, j) => j).slice(1, -1) : [], priority: fast ? 2 : 1 });
      list.push({ train: t, dir: -1, depart: (k * gap + offset) * unit });
    }
    // A branch train joins the line at the middle station, half a gap after the first, and runs out to the end.
    if (branch) list.push({ train: t, dir: 1, depart: (gap / 2) * unit, from: mid, priority: 2 });
    const st = [...route.stations].sort((a, b) => a - b), loops = loopsOn ? st.slice(1).map((x, j) => Math.round((x + st[j]) / 2)) : [];
    return railSingle(route, list, { tracks, pad: pad / 100, loops, dispatch });
  }, [route, routeName, each, gap, offset, late, tracks, pad, unit, loopsOn, express, branch, dispatch]);

  const draw = useEffectEvent(() => {
    const b = box.current, c = graph.current;
    if (!b || !c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(240, b.clientHeight - 40);
    if (W <= 0) return;
    c.style.width = `${W}px`; c.style.height = `${H}px`; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const tEnd = Math.max(...run.trains.map((x) => Math.max(x.t[x.t.length - 1], x.plan[x.plan.length - 1]))), X = (t: number) => 44 + ((W - 56) * t) / tEnd, Y = (s: number) => H - 24 - ((H - 40) * s) / L;
    g.font = '11px Inter, system-ui, sans-serif';
    // Stations (where trains can pass) dashed; the single-track sections between them.
    g.strokeStyle = dark ? 'rgba(161,161,170,0.5)' : 'rgba(113,113,122,0.45)';
    for (const [list, dash] of [[run.stations, [5, 4]], [run.loops, [1, 4]]] as [number[], number[]][]) {
      g.setLineDash(dash); g.beginPath();
      for (const s of list) { g.moveTo(44, Y(s)); g.lineTo(W - 12, Y(s)); }
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = ink;
    for (const s of run.stations) g.fillText(`${(s / 1000).toFixed(s < 10000 ? 1 : 0)} km`, 4, Y(s) + 4);
    const step = tEnd > 3600 ? 600 : tEnd > 1200 ? 300 : 60;
    for (let t = 0; t <= tEnd; t += step) g.fillText(`${Math.round(t / 60)}′`, X(t) - 6, H - 8);
    let o = 0, r = 0;
    for (const x of run.trains) {
      const colour = x.dir === 1 ? OUT[o++ % OUT.length] : BACK[r++ % BACK.length], at = (j: number) => x.nodes[j], n = x.plan.length;
      // The timetable, dotted: straight between stations, flat while it dwells.
      g.strokeStyle = colour; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.setLineDash([2, 3]); g.beginPath();
      x.plan.forEach((p, j) => { const px = X(p), py = Y(at(j)); if (j) g.lineTo(px, py); else g.moveTo(px, py); if (j > 0 && j < n - 1 && x.stops[j]) g.lineTo(X(p + route.dwell), py); });
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // What happened, solid, from when it left to when it arrived.
      const start = x.actual[0] ?? Infinity, end = Number.isFinite(x.arrive) ? x.arrive : Infinity;
      g.lineWidth = 2.25; g.beginPath();
      let pen = false;
      x.t.forEach((t, i) => { if (t < start - 1 || t > end + 1) return; if (pen) g.lineTo(X(t), Y(x.s[i])); else { g.moveTo(X(t), Y(x.s[i])); pen = true; } });
      g.stroke();
    }
    if (Number.isFinite(run.deadlock)) { g.strokeStyle = '#dc2626'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(run.deadlock), 8); g.lineTo(X(run.deadlock), H - 24); g.stroke(); }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label } = ui;
  const range = (name: string, value: number, min: number, max: number, step: number, show: string, set: (v: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{show}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );
  const mins = (s: number) => `${(s / 60).toFixed(1)} min`, u = (k: number) => `${k * (unit / 60)} min`;
  const worst = run.trains.reduce((m, x) => (x.delay > m.delay ? x : m), run.trains[0]);
  const meets = run.trains.reduce((s, x) => s + x.waits.filter((w) => w.for === 'meet').length, 0), clashes = run.conflicts.filter((c) => c.meet).length;
  const facts: [string, string][] = [
    Number.isFinite(run.deadlock) ? ['Locked up', `at ${mins(run.deadlock)}: nowhere to pass`] : ['Most late at the end', worst.delay > 30 ? `${mins(worst.delay)} (${worst.dir === 1 ? 'out' : 'back'})` : 'none'],
    ['Waits to pass', `${meets}, ${mins(run.trains.reduce((s, x) => s + x.waits.reduce((q, w) => q + w.seconds, 0), 0))} in all`],
    ['Timetable clashes', clashes ? `${clashes} (trains planned to meet between stations)` : 'none'],
    dispatch === 'fcfs' ? ['On time (under 1 min)', `${run.trains.filter((x) => x.delay < 60).length} of ${run.trains.length}`] : ['Weighted delay, against first come', `${mins(run.trains.reduce((s2, x) => s2 + x.priority * Math.max(0, x.delay), 0))} / ${run.firstCome >= 1e8 ? 'locked' : mins(run.firstCome)}`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Single track settings" data-no-motion>
        {switcher}
        <div className="space-y-2">
          <span className={label}>Line</span>
          <Segmented<RouteName> label="Line" value={routeName} onChange={setRouteName} segments={[{ value: 'metro', label: 'Metro, 6 stations' }, { value: 'intercity', label: 'Intercity, 3' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">One track between stations, so trains going opposite ways can pass only at a station. A train leaves no earlier than its timetable, only into an empty section, and only if the next station has a track free.</p>
        </div>
        {range('Trains each way', each, 1, 4, 1, `${each}`, setEach)}
        {range('Between departures', gap, 4, 20, 1, u(gap), setGap)}
        {range('Return trains leave after', offset, 0, 10, 1, u(offset), setOffset)}
        {range('First train late by', late, 0, 6, 0.5, u(late), setLate)}
        {range('Recovery time in the timetable', pad, 0, 20, 1, `${pad}%`, setPad)}
        <div className="space-y-2">
          <span className={label}>Tracks at each station</span>
          <Segmented<'1' | '2' | '3'> label="Tracks at each station" value={`${tracks}` as '1' | '2' | '3'} onChange={(v) => setTracks(Number(v))} segments={[{ value: '1', label: 'One' }, { value: '2', label: 'Two' }, { value: '3', label: 'Three' }]} />
          {tracks === 1 && <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">With one track nobody can pass: trains facing each other lock up (the red line).</p>}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={loopsOn} onChange={(e) => setLoopsOn(e.target.checked)} className="h-4 w-4 accent-violet-600" />Passing loops midway between stations</label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={express} disabled={each < 2} onChange={(e) => setExpress(e.target.checked)} className="h-4 w-4 accent-violet-600" />The second train out is an express (ends only)</label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={branch} onChange={(e) => setBranch(e.target.checked)} className="h-4 w-4 accent-violet-600" />A branch train joins at the middle station</label>
        <div className="space-y-2">
          <span className={label}>Who goes first</span>
          <Segmented<Dispatch> label="Who goes first" value={dispatch} onChange={setDispatch} segments={[{ value: 'fcfs', label: 'First come' }, { value: 'priority', label: 'Priority' }, { value: 'best', label: 'Best order' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{dispatch === 'fcfs' ? 'Whichever train is ready first takes the track.' : dispatch === 'priority' ? 'A train waits at a station when a more important one facing it (the express, the branch train, then the earliest) would otherwise wait for it.' : 'The dispatcher tries every swap of two trains’ order and keeps whatever cuts the delay (the express and branch train count twice).'}</p>
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Violet trains go out, amber come back; dotted is the timetable. Where a solid line falls behind its dotted one, the train is late; flat steps are stops and waits. In code: <span className="font-mono">railSingle</span> (example: railways.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The train graph">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={graph} role="img" aria-label={`Train graph, both ways on a single track: ${meets} waits to pass${Number.isFinite(run.deadlock) ? ', locked up' : ''}`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
