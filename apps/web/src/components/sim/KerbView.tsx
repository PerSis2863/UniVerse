'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { GROUNDS, ROLL_DEFAULT, inside, kerbTrip, shape, tripSpeed, type Vehicle } from '@/lib/lab/vehicle';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Vehicle → Kerb (M486d): the car sliding sideways into a kerb (or across the ground),
// seen from behind: it rocks back onto its wheels or trips and tumbles, counting quarter turns until it rests. Worked
// out at once, replayed in real time (at its end with Reduce Motion). The maths is vehicle.ts (kerbTrip, tumble).

type Kerb = '0' | '10' | '15' | '25';
type GroundName = 'tarmac' | 'grass' | 'soil';
type Guard = 'none' | 'belts' | 'both';

export function KerbView({ car }: { car: Vehicle }) {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [kmh, setKmh] = useState(35);
  const [kerb, setKerb] = useState<Kerb>('15');
  const [ground, setGround] = useState<GroundName>('tarmac');
  const [guard, setGuard] = useState<Guard>('belts');
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  // Without body roll chosen, the saloon's.
  const v = useMemo(() => (car.roll ? car : { ...car, roll: ROLL_DEFAULT }), [car]), hk = Number(kerb) / 100;
  const tb = useMemo(() => kerbTrip(v, kmh / 3.6, hk, GROUNDS[ground]), [v, kmh, hk, ground]);
  const ins = useMemo(() => inside(v, tb, { belt: guard !== 'none', curtains: guard === 'both' }), [v, tb, guard]);
  const n = tb.t.length, sh = shape(v);

  const kNow = useRef(0);
  useEffect(() => { kNow.current = k; });
  useEffect(() => { const id = requestAnimationFrame(() => { setK(still ? n - 1 : 0); setPlaying(!still); }); return () => cancelAnimationFrame(id); }, [tb, still, n]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = 0;
    const from = kNow.current, rate = (n - 1) / Math.max(0.01, tb.t[n - 1]);
    const tick = (t: number) => {
      t0 ||= t;
      const next = Math.min(n - 1, from + Math.floor(((t - t0) / 1000) * rate));
      setK(next);
      if (next < n - 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tb, n]);

  const draw = useEffectEvent(() => {
    const b = box.current, c = cv.current;
    if (!b || !c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(220, b.clientHeight - 24);
    if (W <= 0) return;
    c.style.width = `${W}px`; c.style.height = `${H}px`; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dark ? '#18181b' : '#ffffff'; g.fillRect(0, 0, W, H);
    // Fitted across the whole tumble, 1 m squares.
    const lo = Math.min(...tb.y) - sh.roof - 1, hi = Math.max(...tb.y) + sh.roof + 1, s = Math.min(W / (hi - lo), (H - 30) / (sh.roof * 2.2));
    const X = (y: number) => (y - lo) * s, Y = (z: number) => H - 24 - z * s;
    g.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; g.lineWidth = 1; g.beginPath();
    for (let y = Math.ceil(lo); y <= hi; y++) { g.moveTo(X(y), 0); g.lineTo(X(y), H - 24); }
    g.stroke();
    // The road and the kerb (from where the wheels were, past it the pavement).
    g.fillStyle = dark ? '#3f3f46' : '#d4d4d8';
    g.fillRect(0, Y(0), W, 24);
    if (hk > 0) g.fillRect(X(0), Y(hk), W - X(0), Y(0) - Y(hk));
    // The car from behind: wheels below, roof above, at the moment shown; faint copies where it has been.
    // The roof's edges sink in by its crush at that moment (M486f).
    const at = (i: number) => {
      const th = tb.th[i], y = tb.y[i], z = tb.z[i], c = tb.crushes[i] ?? [0, 0], rot = (a: number, b2: number): [number, number] => [X(y + a * Math.cos(th) + b2 * Math.sin(th)), Y(z - a * Math.sin(th) + b2 * Math.cos(th))];
      return [rot(sh.t / 2, -v.h), rot(sh.roofW / 2, sh.roof - v.h - c[0]), rot(-sh.roofW / 2, sh.roof - v.h - c[1]), rot(-sh.t / 2, -v.h), rot(sh.t / 2 * 0.95, sh.roof * 0.5 - v.h), rot(-sh.t / 2 * 0.95, sh.roof * 0.5 - v.h)];
    };
    // In kerbTrip's first part y is the centre's place from the wheel's start, z its height: the same frame.
    for (let i = 0; i <= k; i += Math.max(1, Math.floor(n / 14))) {
      g.strokeStyle = dark ? 'rgba(161,161,170,0.35)' : 'rgba(113,113,122,0.3)'; g.lineWidth = 1; g.beginPath();
      at(i).slice(0, 4).forEach(([px, py], j) => { if (j) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.stroke();
    }
    const p = at(k);
    g.fillStyle = tb.tripped && k > 0 ? '#dc2626' : '#16a34a'; g.beginPath();
    p.slice(0, 4).forEach(([px, py], j) => { if (j) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fill();
    // The side windows: blue whole, yellow and dashed once broken.
    for (const [side, lo, hi] of [[0, p[4], p[1]], [1, p[5], p[2]]] as const) {
      const broken = tb.windows[side] <= tb.t[k];
      g.strokeStyle = broken ? '#fde047' : '#7dd3fc'; g.lineWidth = 3; g.setLineDash(broken ? [3, 3] : []);
      g.beginPath(); g.moveTo(lo[0], lo[1]); g.lineTo(hi[0], hi[1]); g.stroke(); g.setLineDash([]);
    }
    // The windscreen (M486g) as a mark at the car's middle: whole, cracked, or out of its frame.
    const scr = !Number.isNaN(ins.screenOut) && ins.screenOut <= tb.t[k] ? 'out' : !Number.isNaN(ins.screenCracked) && ins.screenCracked <= tb.t[k] ? 'cracked' : '';
    if (scr) { const mx = (p[4][0] + p[5][0]) / 2, my = (p[4][1] + p[5][1]) / 2; g.fillStyle = '#fde047'; g.font = '11px Inter, system-ui, sans-serif'; g.fillText(scr === 'out' ? 'screen out' : 'screen cracked', mx - 34, my); }
    // Someone thrown out: a dot leaving through the broken side, on along the car's path.
    if (!Number.isNaN(ins.thrownOut) && ins.thrownOut <= tb.t[k]) {
      const i0 = tb.t.findIndex((x) => x >= ins.thrownOut), dtk = tb.t[k] - ins.thrownOut;
      g.fillStyle = '#dc2626'; g.beginPath(); g.arc(X(tb.y[i0] + 1.2 + dtk * 3), Y(Math.max(0.15, tb.z[i0] + 0.5 - 4.9 * dtk * dtk)), 5, 0, 2 * Math.PI); g.fill();
    }
    g.fillStyle = dark ? '#e4e4e7' : '#27272a';
    for (const [px, py] of [p[0], p[3]]) { g.beginPath(); g.arc(px, py, 4, 0, 2 * Math.PI); g.fill(); }
    g.font = '11px Inter, system-ui, sans-serif'; g.fillText('1 m squares, seen from behind', 8, 14);
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label, small } = ui;
  const v0 = hk > 0 ? tripSpeed(v, hk) * 3.6 : NaN;
  const facts: [string, string][] = [
    ['Result', tb.tripped ? `Tripped: ${tb.quarters} quarter turn${tb.quarters === 1 ? '' : 's'}, on its ${tb.rests}` : 'Fell back onto its wheels'],
    ['Trips over this kerb from', Number.isFinite(v0) ? `${v0.toFixed(0)} km/h sideways` : 'no kerb'],
    ['Roof in · windows broken', `${(tb.crush * 100).toFixed(0)} cm · ${tb.windows.filter((x) => !Number.isNaN(x)).length} side${tb.windows.filter((x) => !Number.isNaN(x)).length === 1 ? '' : 's'}`],
    ['People inside: most g · headroom', `${tb.peakG.toFixed(0)} g · ${tb.headroom >= 0 ? `${(tb.headroom * 100).toFixed(0)} cm left` : 'the roof reached them'}`],
    ['Heads · thrown out', `${ins.headG.toFixed(0)} g · ${!Number.isNaN(ins.thrownOut) ? `at ${ins.thrownOut.toFixed(2)} s` : ins.partly ? 'head and arms out' : 'kept inside'}`],
    ['Windscreen · injury (rough)', `${!Number.isNaN(ins.screenOut) ? 'out of its frame' : !Number.isNaN(ins.screenCracked) ? 'cracked' : 'whole'} · ${ins.risk}`],
  ];
  return (
    <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The car sliding into a kerb, from behind">
      <div className="flex flex-wrap items-end gap-4 border-b border-zinc-200/80 px-4 py-3 dark:border-white/10" data-no-motion>
        <label className={`${label} w-56`}>Sliding sideways at <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{kmh} km/h</span>
          <input type="range" min={5} max={70} step={1} value={kmh} onChange={(e) => setKmh(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>
        <div className="space-y-1"><span className={label}>Kerb</span>
          <Segmented<Kerb> label="Kerb" value={kerb} onChange={setKerb} segments={[{ value: '0', label: 'None' }, { value: '10', label: '10 cm' }, { value: '15', label: '15 cm' }, { value: '25', label: '25 cm' }]} />
        </div>
        <div className="space-y-1"><span className={label}>Ground</span>
          <Segmented<GroundName> label="Ground" value={ground} onChange={setGround} segments={[{ value: 'tarmac', label: 'Tarmac' }, { value: 'grass', label: 'Grass' }, { value: 'soil', label: 'Soft soil' }]} />
        </div>
        <div className="space-y-1"><span className={label}>People inside</span>
          <Segmented<Guard> label="People inside" value={guard} onChange={setGuard} segments={[{ value: 'none', label: 'No belts' }, { value: 'belts', label: 'Belts' }, { value: 'both', label: 'Belts + curtains' }]} />
        </div>
        <button type="button" className={small} onClick={() => { if (k >= n - 1) setK(0); setPlaying((q) => !q); }}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Replay'}</button>
      </div>
      <div ref={box} className="flex min-h-0 flex-1 flex-col p-3">
        <canvas ref={cv} role="img" aria-label={`The car from behind: ${facts[0][1]}`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
      </div>
      <div className="grid grid-cols-3 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
        {facts.map(([a, b]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b}</p></div>)}
      </div>
    </section>
  );
}
