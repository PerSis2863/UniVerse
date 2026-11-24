'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { RE, decayTime, hohmann, julianDate, nodalDrift, period, propagate, toElements, toState, type Elements } from '@/lib/lab/space';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Orbit (M490): a satellite round the Earth (the space station's orbit, a
// sun-synchronous one, a Molniya, a geostationary one), seen tilted from space on the left and as its ground track on
// the world map on the right (the Earth turning under it), with the bulge's pull (J2) on or off; and what it costs to
// get there from a 300 km parking orbit. Worked out at once (RK4), then replayed (at its end with Reduce Motion).

type Preset = 'iss' | 'sso' | 'molniya' | 'geo' | 'low';
// Air drag (M490c): a small satellite's Cd·A/m (m²/kg).
const BC = 0.01;
const D = Math.PI / 180;
// The Sun's and Moon's pull (M490b) needs a date: a fixed one, so the same choices give the same run.
const JD0 = julianDate(2026, 1, 1, 12);
const PRESETS: Record<Preset, { label: string; el: Elements; text: string }> = {
  iss: { label: 'Station', el: { a: RE + 420, e: 0.0005, i: 51.64 * D, raan: 0, argp: 0, nu: 0 }, text: 'Low, 420 km up, round in 93 minutes: the track drifts west each turn as the Earth spins under it.' },
  sso: { label: 'Sun-sync', el: { a: RE + 700, e: 0.001, i: 98.19 * D, raan: 0, argp: 0, nu: 0 }, text: 'Over the poles, tilted just past 90° so the bulge turns its plane once a year: it passes each place at the same local time.' },
  molniya: { label: 'Molniya', el: { a: 26600, e: 0.74, i: 63.4 * D, raan: 0, argp: 270 * D, nu: 0 }, text: 'Long and thin, half a day round, its slow far end hanging over the north; at 63.4° the bulge doesn’t turn its far end away.' },
  low: { label: 'Skimming', el: { a: RE + 175, e: 0.001, i: 51.6 * D, raan: 0, argp: 0, nu: 0 }, text: 'Only 175 km up, skimming the top of the air: with air drag on it spirals down and burns up within a day or so.' },
  geo: { label: 'GEO', el: { a: 42164, e: 0, i: 0.05 * D, raan: 0, argp: 0, nu: 0 }, text: 'A day round over the equator, 35,786 km up: it stays over one place (a tiny figure eight from its slight tilt).' },
};

export function OrbitBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [preset, setPreset] = useState<Preset>('iss');
  const [turns, setTurns] = useState(3);
  const [j2, setJ2] = useState(true);
  const [third, setThird] = useState(false);
  const [drag, setDrag] = useState(false);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [earth, setEarth] = useState<HTMLImageElement | null>(null);
  const space = useRef<HTMLCanvasElement>(null), track = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);

  useEffect(() => { const img = new Image(); img.onload = () => setEarth(img); img.src = '/geo/earth-2048.jpg'; }, []);
  const p = PRESETS[preset];
  const run = useMemo(() => {
    const s = toState(p.el), T = Math.min(5 * 86400, turns * period(p.el.a));
    return propagate(s.r, s.v, T, { j2, dt: p.el.a > 20000 ? 60 : 10, points: 1500, jd0: JD0, sun: third, moon: third, drag: drag ? BC : 0 });
  }, [p, turns, j2, third, drag]);
  // How fast the Sun and Moon tip the orbit: 30 days with and without them, the difference in tilt scaled to a year.
  const tilt = useMemo(() => {
    if (!third) return null;
    const s = toState(p.el), dt = Math.min(300, period(p.el.a) / 40), o = { j2, dt, points: 2, jd0: JD0 };
    const iOf = (r: ReturnType<typeof propagate>) => toElements(r.r[r.r.length - 1], r.v[r.v.length - 1]).i;
    return ((iOf(propagate(s.r, s.v, 30 * 86400, { ...o, sun: true, moon: true })) - iOf(propagate(s.r, s.v, 30 * 86400, o))) / D) * (365.25 / 30);
  }, [p, j2, third]);
  const n = run.t.length;
  const cost = useMemo(() => {
    const ra = p.el.a * (1 + p.el.e), h = hohmann(RE + 300, ra);
    return { h, drift: nodalDrift(p.el.a, p.el.e, p.el.i) / D };
  }, [p]);

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? n - 1 : 0); setPlaying(!still); }); return () => cancelAnimationFrame(id); }, [run, still, n]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = 0;
    const from = kNow.current, rate = n / 12; // the whole run in about 12 seconds
    const tick = (t: number) => {
      t0 ||= t;
      const next = Math.min(n - 1, from + Math.floor(((t - t0) / 1000) * rate));
      setK(next);
      if (next < n - 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, n]);

  const draw = useEffectEvent(() => {
    const b = box.current;
    if (!b) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = b.clientHeight - 24, left = Math.min(H, (W - 12) * 0.42), right = W - 12 - left;
    const setup = (c: HTMLCanvasElement | null, w: number, h: number) => { if (!c || w <= 0 || h <= 0) return null; c.style.width = `${w}px`; c.style.height = `${h}px`; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx; };
    // Left: from space, the orbit's plane tilted 60° towards us; the Earth a disc, the far side of the path faded.
    const S = setup(space.current, left, left);
    if (S) {
      S.fillStyle = dark ? '#05070d' : '#0b1220'; S.fillRect(0, 0, left, left);
      const far = Math.max(...run.r.map((r) => Math.hypot(r[0], r[1], r[2]))), sc = (left * 0.44) / far, c = left / 2, tilt = 15 * D;
      // Seen from 15° off the north pole, turned 50° round it, so an orbit's tilt shows.
      const az = 50 * D, P = (q: [number, number, number]) => { const x = q[0] * Math.cos(az) + q[1] * Math.sin(az), y = -q[0] * Math.sin(az) + q[1] * Math.cos(az); return [c + x * sc, c - (y * Math.cos(tilt) + q[2] * Math.sin(tilt)) * sc, y * Math.sin(tilt) - q[2] * Math.cos(tilt)] as const; };
      const front = (r: [number, number, number]) => P(r)[2] < 0 || Math.hypot(P(r)[0] - c, P(r)[1] - c) > RE * sc;
      S.lineWidth = 1.5;
      for (const pass of ['back', 'front'] as const) {
        if (pass === 'front') { const g = S.createRadialGradient(c - RE * sc * 0.3, c - RE * sc * 0.3, RE * sc * 0.1, c, c, RE * sc); g.addColorStop(0, '#60a5fa'); g.addColorStop(1, '#1e3a8a'); S.fillStyle = g; S.beginPath(); S.arc(c, c, RE * sc, 0, 2 * Math.PI); S.fill(); }
        S.strokeStyle = pass === 'back' ? 'rgba(196,181,253,0.25)' : 'rgba(196,181,253,0.9)'; S.beginPath();
        let pen = false;
        for (let i = 0; i < n; i++) { const vis = front(run.r[i]) === (pass === 'front'); const [x, y] = P(run.r[i]); if (vis) { if (pen) S.lineTo(x, y); else S.moveTo(x, y); pen = true; } else pen = false; }
        S.stroke();
      }
      const [sx, sy] = P(run.r[k]);
      // Behind the Earth, only a faint dot.
      S.fillStyle = front(run.r[k]) ? '#f59e0b' : 'rgba(245,158,11,0.35)'; S.beginPath(); S.arc(sx, sy, 4, 0, 2 * Math.PI); S.fill();
    }
    // Right: the ground track on the world map (equirectangular), up to now bright, the rest faint.
    const T = setup(track.current, right, Math.min(H, right / 2 + 20));
    if (T) {
      const h = Math.min(H, right / 2 + 20), mh = Math.min(h, right / 2), oy = (h - mh) / 2;
      T.fillStyle = dark ? '#0b1220' : '#dbe4f0'; T.fillRect(0, 0, right, h);
      if (earth) { T.globalAlpha = dark ? 0.75 : 0.9; T.drawImage(earth, 0, oy, right, mh); T.globalAlpha = 1; }
      const X = (lon: number) => ((lon / D + 180) / 360) * right, Y = (lat: number) => oy + ((90 - lat / D) / 180) * mh;
      T.strokeStyle = 'rgba(255,255,255,0.18)'; T.lineWidth = 1; T.beginPath();
      for (let lo = -150; lo <= 150; lo += 30) { T.moveTo(X(lo * D), oy); T.lineTo(X(lo * D), oy + mh); }
      for (let la = -60; la <= 60; la += 30) { T.moveTo(0, Y(la * D)); T.lineTo(right, Y(la * D)); }
      T.stroke();
      const path = (from: number, to: number, colour: string, w: number) => { T.strokeStyle = colour; T.lineWidth = w; T.beginPath(); for (let i = from; i <= to; i++) { const x = X(run.lon[i]), y = Y(run.lat[i]); if (i > from && Math.abs(run.lon[i] - run.lon[i - 1]) < Math.PI) T.lineTo(x, y); else T.moveTo(x, y); } T.stroke(); };
      path(0, n - 1, 'rgba(250,204,21,0.35)', 1.5); path(0, k, '#facc15', 2);
      T.fillStyle = '#f59e0b'; T.strokeStyle = '#000'; T.beginPath(); T.arc(X(run.lon[k]), Y(run.lat[k]), 5, 0, 2 * Math.PI); T.fill(); T.stroke();
    }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label, small } = ui;
  const hours = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${(s / 60).toFixed(0)} min`);
  const lasts = (d: number) => (!Number.isFinite(d) ? 'over 100 years' : d > 730 ? `${(d / 365.25).toFixed(0)} years` : d >= 2 ? `${d.toFixed(0)} days` : hours(d * 86400));
  const facts: [string, string][] = [
    ['Height now', run.crashed && k === n - 1 ? 'burnt up' : `${run.alt[k].toFixed(0)} km`],
    drag ? ['Air drag brings it down in', lasts(decayTime(p.el.a * (1 - p.el.e) - RE, BC))] : ['Round in', hours(period(p.el.a))],
    ['From a 300 km orbit (Hohmann)', `${(cost.h.total * 1000).toFixed(0)} m/s, ${hours(cost.h.time)}`],
    tilt === null ? ['Its plane turns', `${cost.drift.toFixed(2)}° a day`] : ['The Sun and Moon tip it', `${tilt >= 0 ? '+' : ''}${tilt.toFixed(2)}° a year`],
  ];
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Orbit settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Orbit</span>
          <Segmented<Preset> label="Orbit" value={preset} onChange={(v) => { setPreset(v); if (v === 'low') setDrag(true); }} segments={(Object.keys(PRESETS) as Preset[]).map((v) => ({ value: v, label: PRESETS[v].label }))} />
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{p.text}</p>
        </div>
        <label className={label}>Turns <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{turns}</span>
          <input type="range" min={1} max={15} step={1} value={turns} onChange={(e) => setTurns(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={j2} onChange={(e) => setJ2(e.target.checked)} className="h-4 w-4 accent-violet-600" />The Earth’s bulge (J2)</label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={third} onChange={(e) => setThird(e.target.checked)} className="h-4 w-4 accent-violet-600" />The Sun’s and Moon’s pull (from 1 Jan 2026)</label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={drag} onChange={(e) => setDrag(e.target.checked)} className="h-4 w-4 accent-violet-600" />Air drag (a small satellite, average Sun)</label>
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((q) => !q); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
        <label className={label}>Time <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{hours(run.t[k])}</span>
          <input type="range" min={0} max={n - 1} step={1} value={k} onChange={(e) => { setPlaying(false); setK(Number(e.target.value)); }} className="mt-1 w-full accent-violet-600" />
        </label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In code (metres, m/s, degrees): <span className="font-mono">keplerian2ijk</span>, <span className="font-mono">ijk2keplerian</span>, <span className="font-mono">orbitPropagate</span>, <span className="font-mono">orbitDecay</span>, <span className="font-mono">hohmannTransfer</span>, <span className="font-mono">lambertSolve</span>, <span className="font-mono">rocketDeltaV</span> (example: orbits.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The orbit">
        <div ref={box} className="flex min-h-0 flex-1 items-center gap-3 p-3">
          <canvas ref={space} role="img" aria-label={`The orbit seen from space: now ${run.alt[k].toFixed(0)} km up`} className="rounded-lg" />
          <canvas ref={track} role="img" aria-label="The ground track on the world map" className="rounded-lg" />
        </div>
        <div className="grid grid-cols-4 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          {facts.map(([a, b2]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b2}</p></div>)}
        </div>
      </section>
    </div>
  );
}
