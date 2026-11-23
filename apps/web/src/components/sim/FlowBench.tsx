'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Wind } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import { swingRate, U, type FlowShape, type ShapeKind } from '@/lib/sim/flow';
import { ui } from './bench-ui';
import type { FlowFrame, FlowView, FromFlow, ToFlow } from './flow.worker';

// Hyperion Simulate → Fluids (M408): the wind tunnel's window. The flow in colour (speed, pressure or swirl) with
// tracer particles riding it, the shape in grey, and its drag and lift as they settle (or swing, when the wake sways:
// the Strouhal number says how often). Settings restart the tunnel; it pauses while the tab is hidden.

const KEEP = 'uv-sim-flow';
const NX = 300, NY = 150;
interface FlowModel { shape: FlowShape; re: number }
const START: FlowModel = { shape: { kind: 'cylinder', angle: 0, thickness: 12, camber: 2 }, re: 100 };
const read = (): FlowModel => {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Partial<FlowModel> | null;
    if (!v?.shape || !['cylinder', 'airfoil', 'square', 'plate'].includes(v.shape.kind)) return START;
    const num = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
    return { re: num(v.re, 100, 10, 300), shape: { kind: v.shape.kind, angle: num(v.shape.angle, 0, -30, 30), thickness: num(v.shape.thickness, 12, 6, 24), camber: num(v.shape.camber, 2, 0, 8) } };
  } catch { return START; }
};
const RAMP: [number, number, number][] = [[0, 0, 255], [0, 178, 255], [0, 255, 255], [0, 255, 178], [0, 255, 0], [178, 255, 0], [255, 255, 0], [255, 178, 0], [255, 0, 0]];
/** 256 colours: the bands' ramp made smooth, or blue–white–red (blue–black–red in dark) for signed values. */
function lut(diverging: boolean, dark: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 3), mid = dark ? [24, 24, 27] : [250, 250, 250];
  for (let i = 0; i < 256; i++) {
    let c: number[];
    if (diverging) { const t = i / 255, a = t < 0.5 ? [37, 99, 235] : [220, 38, 38], s = t < 0.5 ? 1 - t * 2 : t * 2 - 1; c = mid.map((m, k) => m + (a[k] - m) * s); }
    else { const p = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(p)), f = p - k; c = RAMP[k].map((v, j) => v + (RAMP[k + 1][j] - v) * f); }
    out.set(c, i * 3);
  }
  return out;
}
const VIEWS: Record<FlowView, { name: string; lo: number; hi: number; diverging: boolean; note: string }> = {
  speed: { name: 'Speed (× the inflow)', lo: 0, hi: 1.8, diverging: false, note: 'How fast the flow goes, as a share of the speed coming in.' },
  pressure: { name: 'Pressure (coefficient)', lo: -2, hi: 1, diverging: true, note: 'Red pushes harder than the oncoming flow, blue pulls (suction).' },
  vorticity: { name: 'Swirl (vorticity)', lo: -4, hi: 4, diverging: true, note: 'Red turns one way, blue the other: the wake’s whirls.' },
};
const SHAPES: { value: ShapeKind; label: string }[] = [{ value: 'cylinder', label: 'Cylinder' }, { value: 'airfoil', label: 'Wing' }, { value: 'square', label: 'Square' }, { value: 'plate', label: 'Plate' }];

export function FlowBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [model, setModelNow] = useState<FlowModel>(read);
  const [view, setView] = useState<FlowView>('speed');
  const [paused, setPaused] = useState(still);
  const [particles, setParticles] = useState(true);
  const [info, setInfo] = useState<{ D: number; re: number; outline: [number, number][] } | null>(null);
  const [stats, setStats] = useState<{ steps: number; history: FlowFrame['history'] } | null>(null);
  const worker = useRef<Worker | null>(null), canvas = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const image = useRef<{ c: HTMLCanvasElement; d: ImageData } | null>(null);
  const keepTimer = useRef(0), lastStats = useRef(0);

  const setModel = (f: (m: FlowModel) => FlowModel) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });
  const draw = useEffectEvent((fr: FlowFrame) => {
    const cv = canvas.current, el = box.current;
    if (!cv || !el || !info) return;
    if (!image.current) { const c = document.createElement('canvas'); c.width = NX; c.height = NY; image.current = { c, d: new ImageData(NX, NY) }; }
    const { c, d } = image.current, v = VIEWS[view], colours = lut(v.diverging, dark);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const cell = y * NX + x, o = ((NY - 1 - y) * NX + x) * 4, val = fr.field[cell];
      const k = Math.max(0, Math.min(255, Math.round(((val - v.lo) / (v.hi - v.lo)) * 255))) * 3;
      d.data[o] = colours[k]; d.data[o + 1] = colours[k + 1]; d.data[o + 2] = colours[k + 2]; d.data[o + 3] = 255;
    }
    c.getContext('2d')!.putImageData(d, 0, 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = el.clientWidth, H = el.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const s = Math.min(W / NX, H / NY), ox = (W - NX * s) / 2, oy = (H - NY * s) / 2;
    g.imageSmoothingEnabled = true;
    g.drawImage(c, ox, oy, NX * s, NY * s);
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + (NY - y) * s;
    g.fillStyle = dark ? '#52525b' : '#9ca3af'; g.strokeStyle = dark ? '#e4e4e7' : '#27272a'; g.lineWidth = 1.2;
    g.beginPath(); info.outline.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fill(); g.stroke();
    if (particles) {
      g.fillStyle = view === 'speed' ? 'rgba(255,255,255,0.85)' : dark ? 'rgba(255,255,255,0.8)' : 'rgba(24,24,27,0.75)';
      for (let i = 0; i < fr.particles.length; i += 2) g.fillRect(X(fr.particles[i]) - 0.8, Y(fr.particles[i + 1]) - 0.8, 1.6, 1.6);
    }
  });
  useEffect(() => {
    const w = new Worker(new URL('./flow.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromFlow>) => {
      const m = e.data;
      if ('ready' in m) { setInfo({ D: m.ready.D, re: m.ready.re, outline: m.ready.outline }); return; }
      requestAnimationFrame(() => {
        draw(m.frame);
        w.postMessage({ drawn: true } satisfies ToFlow);
        // The numbers beside it change a few times a second (not every frame).
        const now = performance.now();
        if (now - lastStats.current > 250) { lastStats.current = now; setStats({ steps: m.frame.steps, history: m.frame.history }); }
      });
    };
    worker.current = w;
    const hidden = () => w.postMessage({ paused: document.hidden } satisfies ToFlow);
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); w.terminate(); };
  }, []);
  // A new tunnel whenever the shape or the flow changes (after a short pause while sliding).
  useEffect(() => {
    const t = window.setTimeout(() => { setStats(null); worker.current?.postMessage({ start: { nx: NX, ny: NY, re: model.re, shape: model.shape } } satisfies ToFlow); }, 200);
    return () => clearTimeout(t);
  }, [model]);
  useEffect(() => { worker.current?.postMessage({ view } satisfies ToFlow); }, [view]);
  useEffect(() => { worker.current?.postMessage({ paused } satisfies ToFlow); }, [paused]);

  // The last 6,000 steps: several swings of a swaying wake (one takes ~1,500 steps here).
  const h = stats?.history, recent = (a: number[]) => a;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const cd = h ? avg(recent(h.cd)) : NaN, cl = h ? avg(recent(h.cl)) : NaN;
  const swing = h ? swingRate(recent(h.cl)) : null, clRange = h && h.cl.length ? Math.max(...recent(h.cl)) - Math.min(...recent(h.cl)) : 0;
  // Settled once the flow has crossed the tunnel twice; only then is a swing reported.
  const settling = !stats || stats.steps < (2 * NX) / U;
  const st = !settling && swing && info && clRange > 0.02 ? (swing / h!.every) * info.D / U : null;
  const chart = (vals: number[], colour: string) => {
    if (vals.length < 2) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.1 || 0.1;
    return <polyline fill="none" stroke={colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={vals.map((v, i) => `${(i / (vals.length - 1)) * 300},${60 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 60}`).join(' ')} />;
  };
  const v = VIEWS[view], colours = lut(v.diverging, dark);
  const gradient = `linear-gradient(to right, ${Array.from({ length: 9 }, (_, i) => { const k = Math.round((i / 8) * 255) * 3; return `rgb(${colours[k]},${colours[k + 1]},${colours[k + 2]})`; }).join(',')})`;
  const { label, small } = ui;
  const range = (name: string, value: number, min: number, max: number, step: number, unit: string, set: (n: number) => void) => (
    <label className={label}>{name} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{value}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
    </label>
  );

  return (
    <div className="flex h-[calc(100dvh-13.5rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Wind tunnel settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Shape</span>
          <Segmented<ShapeKind> label="Shape" value={model.shape.kind} onChange={(k) => setModel((m) => ({ ...m, shape: { ...m.shape, kind: k } }))} segments={SHAPES} />
          {model.shape.kind !== 'cylinder' && range('Angle to the flow', model.shape.angle, -30, 30, 1, '°', (n) => setModel((m) => ({ ...m, shape: { ...m.shape, angle: n } })))}
          {model.shape.kind === 'airfoil' && (
            <>
              {range('Thickness', model.shape.thickness, 6, 24, 1, '% of the chord', (n) => setModel((m) => ({ ...m, shape: { ...m.shape, thickness: n } })))}
              {range('Camber (curve)', model.shape.camber, 0, 8, 1, '%', (n) => setModel((m) => ({ ...m, shape: { ...m.shape, camber: n } })))}
              <p className="text-xs text-zinc-500 dark:text-zinc-400" translate="no">NACA {model.shape.camber}4{String(model.shape.thickness).padStart(2, '0')}</p>
            </>
          )}
        </div>
        <div className="space-y-1">
          {range('Reynolds number', model.re, 10, 300, 5, '', (n) => setModel((m) => ({ ...m, re: n })))}
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">How strongly the flow pushes compared with how sticky it is. Low: it creeps smoothly round. From about 50, a cylinder’s wake starts to sway and sheds whirls one side then the other (a vortex street).</p>
        </div>
        <div className="space-y-2">
          <span className={label}>Show</span>
          <Segmented<FlowView> label="Show" value={view} onChange={setView} segments={[{ value: 'speed', label: 'Speed' }, { value: 'pressure', label: 'Pressure' }, { value: 'vorticity', label: 'Swirl' }]} />
          <p className="text-xs text-zinc-600 dark:text-zinc-300">{v.note}</p>
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={particles} onChange={(e) => setParticles(e.target.checked)} className="h-4 w-4 accent-violet-600" />Tracer particles</label>
        </div>
        <div className="flex gap-1">
          <button type="button" className={small} onClick={() => setPaused((p) => !p)}>{paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}{paused ? 'Run' : 'Pause'}</button>
          <button type="button" className={small} onClick={() => setModel((m) => ({ ...m }))}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Start again</button>
        </div>
        <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10" aria-live="polite">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><Wind className="h-3.5 w-3.5" aria-hidden />Forces on the shape</p>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            {[['Drag (Cd)', Number.isFinite(cd) ? cd.toFixed(2) : '…'], ['Lift (Cl)', Number.isFinite(cl) ? cl.toFixed(2) : '…'], ['Strouhal', st ? st.toFixed(3) : '–']].map(([k, val]) => <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{val}</dd></div>)}
          </dl>
          {h && h.cd.length > 1 && (
            <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="h-16 w-full rounded-md bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label="Drag (red) and lift (blue) over time">
              {chart(h.cd, '#dc2626')}{chart(h.cl, '#2563eb')}
            </svg>
          )}
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            {settling ? 'The flow is still settling: the numbers firm up after a few seconds.' : st ? `The wake sways: lift swings ${clRange.toFixed(2)} each way and back about every ${(1 / st).toFixed(1)} sizes of travel (Strouhal ${st.toFixed(2)}; a cylinder’s is about 0.2).` : 'The flow has settled into a steady pattern.'}
            {info && ` Steps run: ${(stats?.steps ?? 0).toLocaleString()}.`}
          </p>
        </div>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="Wind tunnel">
        <div ref={box} className="relative min-h-0 flex-1">
          <canvas ref={canvas} role="img" aria-label={`Wind tunnel: flow past a ${model.shape.kind === 'airfoil' ? 'wing' : model.shape.kind} at Reynolds number ${model.re}, showing ${v.name}`} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="pointer-events-none absolute bottom-2 start-2 w-56 rounded-lg bg-white/90 px-2 py-1.5 text-[11px] text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900/90 dark:text-zinc-100 dark:ring-white/10">
          <p className="font-semibold">{v.name}</p>
          <div className="mt-1 flex items-center gap-1.5 font-mono tabular-nums"><span>{v.lo}</span><span className="h-2.5 flex-1 rounded-sm" style={{ background: gradient }} aria-hidden /><span>{v.hi}</span></div>
        </div>
        {paused && <p className={cn('absolute end-2 top-2 rounded-md bg-zinc-900/80 px-2 py-1 text-xs text-white')}>Paused</p>}
      </section>
    </div>
  );
}
