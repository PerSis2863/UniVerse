'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { PLANE_DEFAULT, flightSim, modes, performance, trim } from '@/lib/lab/flight';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Aeroplane (M489): a light aeroplane seen from the side, flying from level flight
// through one of four manoeuvres (a nudge of the elevator that sets off the phugoid, more power, a 150 m climb by the
// autopilot, pulling up to the stall), at the speed and height chosen. Worked out at once on the page, replayed four
// times faster than real time (at its end with Reduce Motion). The maths is flight.ts, the same as aircraftSim in code.

type Move = 'nudge' | 'power' | 'climb' | 'stall';
const deg = (r: number) => (r * 180) / Math.PI;
const SPEEDUP = 4;

export function FlightBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [move, setMove] = useState<Move>('nudge');
  const [V, setV] = useState(50);
  const [h0, setH0] = useState(1000);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const side = useRef<HTMLCanvasElement>(null), chart = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  const ac = PLANE_DEFAULT;
  const tr = useMemo(() => trim(ac, V, h0), [ac, V, h0]);
  const run = useMemo(() => {
    if (!tr.ok) return null;
    if (move === 'nudge') return flightSim(ac, 120, { V0: V, h0, elevator: (t) => (t > 1 && t < 2 ? -0.03 : 0), points: 600 });
    if (move === 'power') return flightSim(ac, 90, { V0: V, h0, throttle: (t) => (t > 2 ? 1 : 0), points: 450 });
    if (move === 'climb') return flightSim(ac, 90, { V0: V, h0, holdHeight: (t) => h0 + (t > 3 ? 150 : 0), holdSpeed: V, points: 450 });
    return flightSim(ac, 30, { V0: V, h0, elevator: (t) => (t > 1 ? -0.3 : 0), throttle: () => -1, points: 300 });
  }, [ac, tr, move, V, h0]);
  const facts = useMemo(() => {
    const m = tr.ok ? modes(ac, tr) : [];
    return { sp: m.find((x) => x.name === 'short period'), ph: m.find((x) => x.name === 'phugoid'), perf: performance(ac, h0) };
  }, [ac, tr, h0]);
  const n = run?.t.length ?? 0;

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? Math.max(0, n - 1) : 0); setPlaying(!still && n > 1); }); return () => cancelAnimationFrame(id); }, [run, still, n]);
  useEffect(() => {
    if (!playing || !run || n < 2) return;
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
    if (!b || !run) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(200, b.clientHeight - 170);
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    const bg = dark ? '#18181b' : '#ffffff', ink = dark ? '#d4d4d8' : '#27272a', faint = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    // The side view: the whole path fitted (heights stretched so a few metres show), a grid, the plane pitched.
    const S = setup(side.current, W, H);
    if (S) {
      const sky = S.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, dark ? '#0c1a2e' : '#dbeafe'); sky.addColorStop(1, dark ? '#18181b' : '#f8fafc');
      S.fillStyle = sky; S.fillRect(0, 0, W, H);
      const x0 = run.x[0], x1 = Math.max(run.x[0] + 1, run.x[n - 1]), hMin = Math.min(...run.h), hMax = Math.max(...run.h), span = Math.max(20, hMax - hMin);
      const X = (x: number) => 24 + ((W - 48) * (x - x0)) / (x1 - x0), Y = (h: number) => H - 30 - ((H - 60) * (h - (hMin - span * 0.15))) / (span * 1.3);
      S.strokeStyle = faint; S.lineWidth = 1; S.beginPath();
      const step = span > 200 ? 50 : span > 60 ? 20 : 5;
      for (let hh = Math.ceil((hMin - span * 0.15) / step) * step; hh < hMax + span * 0.15; hh += step) { S.moveTo(0, Y(hh)); S.lineTo(W, Y(hh)); }
      S.stroke();
      S.fillStyle = ink; S.font = '11px Inter, system-ui, sans-serif';
      S.fillText(`${hMax.toFixed(0)} m`, 6, Y(hMax) - 4); S.fillText(`${hMin.toFixed(0)} m`, 6, Y(hMin) + 13);
      S.strokeStyle = dark ? 'rgba(161,161,170,0.45)' : 'rgba(113,113,122,0.4)'; S.setLineDash([5, 4]); S.beginPath();
      run.x.forEach((x, i) => { if (i) S.lineTo(X(x), Y(run.h[i])); else S.moveTo(X(x), Y(run.h[i])); });
      S.stroke(); S.setLineDash([]);
      S.strokeStyle = '#7c3aed'; S.lineWidth = 2.5; S.beginPath(); S.moveTo(X(run.x[0]), Y(run.h[0]));
      for (let i = 1; i <= k; i++) S.lineTo(X(run.x[i]), Y(run.h[i]));
      S.stroke();
      // The plane: fuselage, wing and tail, pitched by its real pitch angle (not the stretched path's slope).
      const cx = X(run.x[k]), cy = Y(run.h[k]), th = run.th[k], stalledNow = run.alpha[k] > ac.alphaStall;
      S.save(); S.translate(cx, cy); S.rotate(-th);
      S.fillStyle = stalledNow ? '#dc2626' : dark ? '#e4e4e7' : '#3f3f46';
      S.beginPath(); S.moveTo(16, 0); S.lineTo(10, -3); S.lineTo(-14, -2); S.lineTo(-18, -9); S.lineTo(-21, -9); S.lineTo(-19, 1); S.lineTo(10, 3); S.closePath(); S.fill();
      S.fillRect(-4, -1, 12, 2.5);
      S.restore();
    }
    // Under it: speed and angle of attack over time.
    const C = setup(chart.current, W, 130);
    if (C) {
      C.fillStyle = bg; C.fillRect(0, 0, W, 130);
      const tEnd = run.t[n - 1] || 1, tx = (t: number) => 8 + ((W - 16) * t) / tEnd;
      const line = (v: number[], lo: number, hi: number, colour: string) => { C.strokeStyle = colour; C.lineWidth = 2; C.beginPath(); v.forEach((y, i) => { const px = tx(run.t[i]), py = 120 - ((y - lo) / (hi - lo || 1)) * 110; if (i) C.lineTo(px, py); else C.moveTo(px, py); }); C.stroke(); };
      line(run.V, Math.min(...run.V) - 1, Math.max(...run.V) + 1, '#16a34a');
      const a = run.alpha.map(deg);
      line(a, Math.min(0, ...a) - 1, Math.max(deg(ac.alphaStall) + 2, ...a), '#f59e0b');
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
    nudge: 'A one-second push on the stick: the nose bobs once (the short period), then the aeroplane swaps height for speed and back for minutes (the phugoid).',
    power: 'Full power with the stick left alone: it doesn’t go much faster, it climbs; the trim sets the speed.',
    climb: 'The autopilot climbs 150 m with the elevator and holds the speed with the throttle.',
    stall: 'The stick pulled back hard with the power off: the angle of attack passes the stall and the wing loses lift (red).',
  };
  const kmh = (v: number) => `${v.toFixed(0)} m/s (${(v * 1.944).toFixed(0)} kn)`;
  const f: [string, string][] = [
    ['Stall speed here', kmh(facts.perf.stall)],
    ['Short period', facts.sp ? `${facts.sp.period.toFixed(1)} s, damping ${facts.sp.damping.toFixed(2)}` : '–'],
    ['Phugoid', facts.ph ? `${facts.ph.period.toFixed(0)} s, damping ${facts.ph.damping.toFixed(2)}` : '–'],
    ['Glide ratio · best climb', `${facts.perf.glideRatio.toFixed(1)} · ${facts.perf.bestClimb.toFixed(1)} m/s`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Aeroplane settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Manoeuvre</span>
          <Segmented<Move> label="Manoeuvre" value={move} onChange={setMove} segments={[{ value: 'nudge', label: 'Nudge' }, { value: 'power', label: 'Power' }, { value: 'climb', label: 'Climb' }, { value: 'stall', label: 'Stall' }]} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{explain[move]}</p>
        </div>
        {range('Speed', V, 30, 65, 1, kmh(V), setV)}
        {range('Height', h0, 0, 4000, 100, `${h0} m`, setH0)}
        {!tr.ok && <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">It can’t fly level at {V} m/s at {h0} m: {tr.alpha >= ac.alphaStall ? 'that’s below its stall speed here' : 'not enough power'}.</p>}
        <button type="button" className={small} disabled={!run} onClick={() => { if (k >= n - 1) setK(0); setPlaying((p) => !p); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{(run?.t[k] ?? 0).toFixed(0)} s</span>
          <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">A light four-seater with textbook-typical numbers. In code: <span className="font-mono">atmosisa</span>, <span className="font-mono">aircraft</span>, <span className="font-mono">aircraftTrim</span>, <span className="font-mono">aircraftModes</span>, <span className="font-mono">aircraftSim</span>, <span className="font-mono">aircraftPerformance</span>, <span className="font-mono">levelTurn</span> (example: flight.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The aeroplane from the side">
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <canvas ref={side} role="img" aria-label={run ? `The flight path: heights from ${Math.min(...run.h).toFixed(0)} to ${Math.max(...run.h).toFixed(0)} m${run.stalled ? ', the wing stalled' : ''}` : 'No flight'} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-300">
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#16a34a' }} aria-hidden />speed</span>
            <span><span className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: '#f59e0b' }} aria-hidden />angle of attack</span>
          </div>
          <canvas ref={chart} role="img" aria-label="Speed and angle of attack over time" className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {f.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
