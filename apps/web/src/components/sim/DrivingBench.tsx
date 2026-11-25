'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { ROADS, followSim, laneKeep, type DriveRun, type Keeper } from '@/lib/lab/driving';
import { CAR_DEFAULT } from '@/lib/lab/vehicle';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Driving (M487): automated driving on M486's car. Lane keeping: a road from above, the
// car steered by Stanley, pure pursuit or LQR from an offset start; the trail and how far off the centre it is.
// Following: the car ahead slows or stops hard; adaptive cruise keeps a time gap, emergency braking steps in when a
// crash is near, both can be switched off. Worked out at once on the page, then replayed (at its end with Reduce Motion).

type Mode = 'lane' | 'follow';
type RoadName = 'curve' | 'scurve' | 'country' | 'lanechange';
type Lead = 'slows' | 'stops';
const KEEPERS: { value: Keeper; label: string }[] = [{ value: 'lqr', label: 'LQR' }, { value: 'stanley', label: 'Stanley' }, { value: 'purepursuit', label: 'Pure pursuit' }];

export function DrivingBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [mode, setMode] = useState<Mode>('lane');
  const [roadName, setRoadName] = useState<RoadName>('scurve');
  const [keeper, setKeeper] = useState<Keeper>('lqr');
  const [kmh, setKmh] = useState(90);
  const [offset, setOffset] = useState(0.5);
  const [lead, setLead] = useState<Lead>('slows');
  const [acc, setAcc] = useState(true);
  const [aeb, setAeb] = useState(true);
  const [gapS, setGapS] = useState(1.8);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const view = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const road = useMemo(() => ROADS[roadName](), [roadName]);
  const run: DriveRun = useMemo(() => {
    const u = kmh / 3.6;
    if (mode === 'lane') return laneKeep(CAR_DEFAULT, road, keeper, u, { e0: offset });
    const leadSpeed = lead === 'slows' ? (t: number) => u - 0.6 * u * Math.min(1, Math.max(0, (t - 6) / 4)) : (t: number) => (t < 6 ? u * 0.8 : Math.max(0, u * 0.8 - 8 * (t - 6)));
    return followSim(CAR_DEFAULT, leadSpeed, 20, { set: u, v0: u, gap0: u * 2.2 + 5, timeGap: gapS, acc, aeb });
  }, [mode, road, keeper, kmh, offset, lead, acc, aeb, gapS]);
  const n = run.t.length;

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? n - 1 : 0); setPlaying(!still); }); return () => cancelAnimationFrame(id); }, [run, still, n]);
  useEffect(() => {
    if (!playing || n < 2) return;
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
    if (!b || !n) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(200, b.clientHeight - 170);
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const bg = dark ? '#18181b' : '#ffffff', ground = dark ? '#1f2a1f' : '#e7efe2', asphalt = dark ? '#3f3f46' : '#c9ccd1', paint = dark ? '#e4e4e7' : '#ffffff';
    const carBox = (ctx: CanvasRenderingContext2D, cx: number, cy: number, psi: number, s: number, colour: string) => {
      const c = Math.cos(psi), sn = Math.sin(psi);
      ctx.fillStyle = colour; ctx.strokeStyle = bg; ctx.lineWidth = 1.5; ctx.beginPath();
      [[-2.1, -0.9], [2.5, -0.9], [2.5, 0.9], [-2.1, 0.9]].forEach(([u, v], i) => { const px = cx + (u * c - v * sn) * s, py = cy - (u * sn + v * c) * s; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    const V = setup(view.current, W, H);
    if (V) {
      V.fillStyle = ground; V.fillRect(0, 0, W, H);
      if (mode === 'lane') {
        const pad = 8, x0 = Math.min(...road.x) - pad, x1 = Math.max(...road.x) + pad, y0 = Math.min(...road.y) - pad, y1 = Math.max(...road.y) + pad;
        const s = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
        const X = (x: number) => ox + (x - x0) * s, Y = (y: number) => H - oy - (y - y0) * s;
        // The lane: asphalt as a wide stroke along the centreline, white edges, a dashed centre.
        const along = (off: number) => { V.beginPath(); road.x.forEach((x, i) => { const px = X(x - off * Math.sin(road.h[i])), py = Y(road.y[i] + off * Math.cos(road.h[i])); if (i) V.lineTo(px, py); else V.moveTo(px, py); }); V.stroke(); };
        V.lineCap = 'round'; V.lineJoin = 'round';
        V.strokeStyle = asphalt; V.lineWidth = Math.max(4, road.width * s + 4); along(0);
        V.strokeStyle = paint; V.lineWidth = 1.5; along(road.width / 2); along(-road.width / 2);
        V.setLineDash([6, 6]); V.strokeStyle = dark ? 'rgba(250,204,21,0.6)' : 'rgba(202,138,4,0.7)'; along(0); V.setLineDash([]);
        V.strokeStyle = '#7c3aed'; V.lineWidth = 2; V.beginPath(); V.moveTo(X(run.x[0]), Y(run.y[0]));
        for (let i = 1; i <= k; i++) V.lineTo(X(run.x[i]), Y(run.y[i]));
        V.stroke();
        carBox(V, X(run.x[k]), Y(run.y[k]), run.psi[k], Math.max(s, 2.2), run.left && run.e.slice(0, k + 1).some((e) => Math.abs(e) + 0.9 > road.width / 2) ? '#dc2626' : '#16a34a');
      } else {
        // Following: a straight lane seen from above, the camera on our car; 1 m is 6 px.
        const s = 6, cy = H / 2, X = (x: number) => W * 0.25 + (x - run.x[k]) * s;
        V.fillStyle = asphalt; V.fillRect(0, cy - 3.5 * s, W, 7 * s);
        V.strokeStyle = paint; V.lineWidth = 2; V.beginPath(); V.moveTo(0, cy - 3.5 * s); V.lineTo(W, cy - 3.5 * s); V.moveTo(0, cy + 3.5 * s); V.lineTo(W, cy + 3.5 * s); V.stroke();
        V.setLineDash([12, 12]); V.lineDashOffset = (run.x[k] * s) % 24; V.beginPath(); V.moveTo(0, cy); V.lineTo(W, cy); V.stroke(); V.setLineDash([]); V.lineDashOffset = 0;
        carBox(V, X(run.leadX[k] - 2.3), cy + 1.75 * s, 0, s, '#2563eb');
        carBox(V, X(run.x[k] + 2.1), cy + 1.75 * s, 0, s, run.crashed && k === n - 1 ? '#dc2626' : run.aeb[k] ? '#f59e0b' : '#16a34a');
        V.fillStyle = dark ? '#e4e4e7' : '#27272a'; V.font = '12px Inter, system-ui, sans-serif';
        V.fillText(`${run.gap[k].toFixed(1)} m`, (X(run.x[k] + 4.6) + X(run.leadX[k] - 4.6)) / 2 - 14, cy + 1.75 * s - 14);
      }
    }
    // Under it: off the centre and steering, or the two speeds and the gap.
    const C = setup(chart.current, W, 130);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, W, 130);
      const tEnd = run.t[n - 1] || 1, tx = (t: number) => 8 + ((W - 16) * t) / tEnd;
      const series: [number[], string][] = mode === 'lane' ? [[run.e, '#7c3aed'], [run.steer.map((d) => (d * 180) / Math.PI / 4), '#f59e0b']] : [[run.vx, '#16a34a'], [run.lead, '#2563eb'], [run.gap.map((g) => g / 2), '#7c3aed']];
      const zero = mode === 'lane' ? 65 : 120, peak = Math.max(0.1, ...series.flatMap(([v]) => v.map(Math.abs)));
      C.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'; C.beginPath(); C.moveTo(8, zero); C.lineTo(W - 8, zero); C.stroke();
      for (const [v, colour] of series) { C.strokeStyle = colour; C.lineWidth = 2; C.beginPath(); v.forEach((y, i) => { const px = tx(run.t[i]), py = zero - (y / peak) * (mode === 'lane' ? 55 : 110); if (i) C.lineTo(px, py); else C.moveTo(px, py); }); C.stroke(); }
      C.strokeStyle = dark ? '#d4d4d8' : '#27272a'; C.lineWidth = 1; C.beginPath(); C.moveTo(tx(run.t[k]), 6); C.lineTo(tx(run.t[k]), 124); C.stroke();
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
  const check = (text: string, on: boolean, set: (v: boolean) => void) => <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-violet-600" />{text}</label>;
  const swatch = (colour: string, text: string) => <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: colour }} aria-hidden />{text}</span>;
  const facts: [string, string][] = mode === 'lane'
    ? [['Most off the centre', `${run.maxE.toFixed(2)} m`], ['Stayed in lane', run.left ? 'No' : 'Yes'], ['Lane-departure warning', Number.isFinite(Math.min(...run.ttlc)) && Math.min(...run.ttlc) < 1 ? 'Would sound' : 'Quiet'], ['Speed', `${kmh} km/h`]]
    : [['Result', run.crashed ? 'Crashed' : 'Safe'], ['Closest', `${Math.min(...run.gap).toFixed(1)} m`], ['Emergency braking', run.aeb.some(Boolean) ? 'Used' : 'Not needed'], ['Gap now', `${run.gap[k]?.toFixed(1) ?? '–'} m`]];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Driving settings" data-no-motion>
        <Segmented<Mode> label="Driving task" value={mode} onChange={setMode} segments={[{ value: 'lane', label: 'Lane keeping' }, { value: 'follow', label: 'Following' }]} />
        {mode === 'lane' ? (
          <>
            <div className="space-y-2">
              <span className={label}>Road</span>
              <Segmented<RoadName> label="Road" value={roadName} onChange={setRoadName} segments={[{ value: 'curve', label: 'Bend' }, { value: 'scurve', label: 'S-bend' }, { value: 'country', label: 'Country' }, { value: 'lanechange', label: 'Swerve' }]} />
            </div>
            <div className="space-y-2">
              <span className={label}>Lane keeper</span>
              <Segmented<Keeper> label="Lane keeper" value={keeper} onChange={setKeeper} segments={KEEPERS} />
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{keeper === 'lqr' ? 'LQR: optimal gains on the offset and the heading, with the bend fed forward, so a steady curve needs no error.' : keeper === 'stanley' ? 'Stanley (from Stanford’s desert-race car): steer by the heading error plus a turn towards the centre that shrinks with speed.' : 'Pure pursuit: aim at a point on the road ahead and steer the circle that reaches it; cuts corners a little.'}</p>
            </div>
            {range('Speed', kmh, 30, 130, 5, `${kmh} km/h`, setKmh)}
            {range('Starts off the centre by', offset, 0, 1.2, 0.1, `${offset.toFixed(1)} m`, setOffset)}
          </>
        ) : (
          <>
            <div className="space-y-2">
              <span className={label}>The car ahead</span>
              <Segmented<Lead> label="The car ahead" value={lead} onChange={setLead} segments={[{ value: 'slows', label: 'Slows down' }, { value: 'stops', label: 'Stops hard' }]} />
            </div>
            {check('Adaptive cruise control', acc, setAcc)}
            {check('Automatic emergency braking', aeb, setAeb)}
            {range('Speed', kmh, 30, 130, 5, `${kmh} km/h`, setKmh)}
            {range('Time gap', gapS, 0.8, 3, 0.1, `${gapS.toFixed(1)} s`, setGapS)}
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Our car is green, amber while it brakes in an emergency; the car ahead is blue.</p>
          </>
        )}
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{(run.t[k] ?? 0).toFixed(1)} s</span>
          <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code: <span className="font-mono">roadPath</span>, <span className="font-mono">laneKeep</span>, <span className="font-mono">lqrLateral</span>, <span className="font-mono">accFollow</span> (example: driving.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The drive">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={view} role="img" aria-label={mode === 'lane' ? `Lane keeping: at most ${run.maxE.toFixed(2)} m off the centre` : `Following: ${run.crashed ? 'it crashed' : `closest ${Math.min(...run.gap).toFixed(1)} m`}`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">{mode === 'lane' ? <>{swatch('#7c3aed', 'off the centre')}{swatch('#f59e0b', 'steering')}</> : <>{swatch('#16a34a', 'our speed')}{swatch('#2563eb', 'the car ahead')}{swatch('#7c3aed', 'gap')}</>}</div>
          <canvas ref={chart} role="img" aria-label={mode === 'lane' ? 'Offset and steering over time' : 'Speeds and gap over time'} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
