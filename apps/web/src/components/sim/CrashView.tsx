'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { WHEEL_GAP, frontalCrash, sideCrash, type Vehicle } from '@/lib/lab/vehicle';
import { ui } from './bench-ui';

// Hyperion Simulate → Machines → Vehicle → Crash (M486j): a head-on crash into a wall or another car, the front person
// held by the belt, the knees and the front airbag. The car's and the person's deceleration over the first 150 ms are
// drawn, and how far the person moved towards the steering wheel. M486k: part of the front only (offset), the back
// seat, and someone unbelted behind the front person. M486l: a side crash (a car or a pole), the struck side or the other,
// side and curtain airbags, the person beside. The maths is vehicle.ts (frontalCrash, sideCrash).

type Into = 'wall' | 'barrier' | 'car';
type Guard = 'none' | 'belt' | 'bag' | 'both';
type Overlap = '1' | '0.4' | '0.25';
type Seat = 'front' | 'rear' | 'pushed';
type Kind = 'front' | 'side';
type SideInto = 'car' | 'pole';
type SideSeat = 'near' | 'far' | 'beside';
type SideRow = 'front' | 'rear';
type SideAngle = '0' | '15' | '30';

export function CrashView({ car }: { car: Vehicle }) {
  const dark = useDarkMode();
  const [kmh, setKmh] = useState(56);
  const [into, setInto] = useState<Into>('wall');
  const [guard, setGuard] = useState<Guard>('both');
  const [overlap, setOverlap] = useState<Overlap>('1');
  const [seat, setSeat] = useState<Seat>('front');
  const [kind, setKind] = useState<Kind>('front');
  const [sideInto, setSideInto] = useState<SideInto>('car');
  const [sideSeat, setSideSeat] = useState<SideSeat>('near');
  // M486p: the back seat and a blow at an angle.
  const [sideRow, setSideRow] = useState<SideRow>('front');
  const [sideAngle, setSideAngle] = useState<SideAngle>('0');
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const c = useMemo(() => frontalCrash(car, kmh / 3.6, { into, belt: guard === 'belt' || guard === 'both', bags: guard === 'bag' || guard === 'both', overlap: Number(overlap), seat: seat === 'rear' ? 'rear' : 'front', behind: seat === 'pushed' ? 'unbelted' : 'none' }), [car, kmh, into, guard, overlap, seat]);
  const sc = useMemo(() => sideCrash(car, kmh / 3.6, { into: sideInto, belt: guard === 'belt' || guard === 'both', bags: guard === 'bag' || guard === 'both', seat: sideSeat === 'near' ? 'near' : 'far', beside: sideSeat === 'beside', row: sideRow, angle: Number(sideAngle) }), [car, kmh, sideInto, guard, sideSeat, sideRow, sideAngle]);
  const rear = seat === 'rear', side = kind === 'side', d = side ? sc : c;

  const draw = useEffectEvent(() => {
    const b = box.current, el = cv.current;
    if (!b || !el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = b.clientWidth - 24, H = Math.max(220, b.clientHeight - 24);
    if (W <= 0) return;
    el.style.width = `${W}px`; el.style.height = `${H}px`; el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
    const g = el.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dark ? '#18181b' : '#ffffff'; g.fillRect(0, 0, W, H);
    const tMax = 0.15, gMax = Math.max(40, ...d.carG, ...d.personG) * 1.1, L = 40, R = 12, T = 22, B = 28;
    const X = (t: number) => L + ((W - L - R) * t) / tMax, Y = (v: number) => H - B - ((H - T - B) * v) / gMax;
    g.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; g.lineWidth = 1; g.beginPath();
    for (let t = 0; t <= tMax + 1e-9; t += 0.025) { g.moveTo(X(t), T); g.lineTo(X(t), H - B); }
    for (let v = 0; v <= gMax; v += 20) { g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); }
    g.stroke();
    g.fillStyle = dark ? '#a1a1aa' : '#52525b'; g.font = '11px Inter, system-ui, sans-serif';
    for (let t = 0; t <= tMax + 1e-9; t += 0.025) g.fillText(`${Math.round(t * 1000)} ms`, X(t) - 12, H - 10);
    for (let v = 0; v <= gMax; v += 20) g.fillText(`${v} g`, 4, Y(v) + 4);
    // FMVSS 208's 60 g for the chest.
    g.strokeStyle = '#dc2626'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, Y(60)); g.lineTo(W - R, Y(60)); g.stroke(); g.setLineDash([]);
    const line = (ys: number[], color: string) => {
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
      d.t.forEach((t, i) => { if (t > tMax) return; if (i) g.lineTo(X(t), Y(ys[i])); else g.moveTo(X(t), Y(ys[i])); });
      g.stroke();
    };
    line(d.carG, dark ? '#a1a1aa' : '#71717a');
    line(d.personG, '#7c3aed');
    if (!Number.isNaN(d.bagAt) && d.bagAt <= tMax) { g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(X(d.bagAt), Y(0), 5, 0, 2 * Math.PI); g.fill(); g.fillText('airbag fires', X(d.bagAt) + 7, Y(0) - 6); }
  });
  useEffect(() => { draw(); });
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => draw()); ro.observe(b); return () => ro.disconnect(); }, []);

  const { label } = ui;
  const sideFacts: [string, string][] = [
    ['Result', `${sc.risk === 'low' ? 'Likely to walk away' : sc.risk === 'serious' ? 'Serious injury likely' : 'Severe injury likely'} (rough)`],
    ['The side crushed · the car shoved', `${(sc.intrusion * 100).toFixed(0)} cm · ${(sc.dv * 3.6).toFixed(0)} km/h sideways`],
    ['Chest (3 ms) · ribs squeezed', `${sc.chestG.toFixed(0)} g · ${(sc.ribs * 1000).toFixed(0)} mm (good under 28, poor past 50)`],
    ['The car after the blow', `spinning ${sc.spin.toFixed(0)}°/s${sc.along > 0.05 ? `, shoved ${(sc.along * 3.6).toFixed(0)} km/h along` : ''}`],
    ['Head', sc.headG > 0.5 ? `${sc.headG.toFixed(0)} g${sc.headHit ? (sideSeat === 'beside' ? ', against the other person’s head' : ', against the window side') : ', on the curtain airbag'}` : 'nothing hit'],
    ['Side airbags', Number.isNaN(sc.bagAt) ? (guard === 'none' || guard === 'belt' ? 'none fitted' : 'didn’t fire') : `fired at ${(sc.bagAt * 1000).toFixed(0)} ms${sideRow === 'rear' ? ' (curtain only in the back)' : ''}`],
    ['Into the person beside', sideSeat === 'beside' ? `${(sc.hitPerson / 1000).toFixed(1)} kN shoulder to shoulder` : 'nobody beside'],
  ];
  const frontFacts: [string, string][] = [
    ['Result', `${c.risk === 'low' ? 'Likely to walk away' : c.risk === 'serious' ? 'Serious injury likely' : 'Severe injury likely'} (rough)`],
    ['Like hitting a wall at', `${(c.vEq * 3.6).toFixed(0)} km/h · front crushed ${(c.crush * 100).toFixed(0)} cm${into === 'barrier' ? `, barrier ${(c.barrier * 100).toFixed(0)} cm` : ''}`],
    ['Chest (3 ms) · moved forward', rear ? `${c.chestG.toFixed(0)} g · ${(c.travelMax * 100).toFixed(0)} cm${c.hitSeat ? ', head on the seat in front' : ''}` : `${c.chestG.toFixed(0)} g · ${c.hitWheel ? 'hit the steering wheel' : `${(c.travelMax * 100).toFixed(0)} cm of ${(WHEEL_GAP * 100).toFixed(0)}`}${c.headHit ? ', head on the wheel' : ''}`],
    ['Front airbag', rear ? 'none in the back' : Number.isNaN(c.bagAt) ? (guard === 'none' || guard === 'belt' ? 'none fitted' : 'didn’t fire') : `fired at ${(c.bagAt * 1000).toFixed(0)} ms${c.late ? ' (late)' : ''}${c.slidOff ? ', the head slid off its edge' : ''}`],
    ['Into the cabin', c.intrusion > 0.005 ? `${(c.intrusion * 100).toFixed(0)} cm (footwell and dashboard)` : 'nothing'],
    ['Pushed from behind', seat === 'pushed' ? `${(c.backLoad / 1000).toFixed(1)} kN into the seat's back` : 'nobody unbelted behind'],
  ];
  const facts = side ? sideFacts : frontFacts;
  return (
    <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label={side ? 'A side crash' : 'A head-on crash'}>
      <div className="flex flex-wrap items-end gap-4 border-b border-zinc-200/80 px-4 py-3 dark:border-white/10" data-no-motion>
        <label className={`${label} w-56`}>Speed <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{kmh} km/h</span>
          <input type="range" min={10} max={120} step={1} value={kmh} onChange={(e) => setKmh(Number(e.target.value))} className="mt-1 w-full accent-violet-600" />
        </label>
        <div className="space-y-1"><span className={label}>Crash</span>
          <Segmented<Kind> label="Crash" value={kind} onChange={setKind} segments={[{ value: 'front', label: 'Head on' }, { value: 'side', label: 'Into the side' }]} />
        </div>
        {side ? <div className="space-y-1"><span className={label}>Hit by</span>
          <Segmented<SideInto> label="Hit by" value={sideInto} onChange={setSideInto} segments={[{ value: 'car', label: 'A car like it' }, { value: 'pole', label: 'Sliding into a pole' }]} />
        </div> : <div className="space-y-1"><span className={label}>Into</span>
          <Segmented<Into> label="Into" value={into} onChange={setInto} segments={[{ value: 'wall', label: 'A wall' }, { value: 'barrier', label: 'A soft barrier (Euro NCAP)' }, { value: 'car', label: 'A car like it, head on' }]} />
        </div>}
        <div className="space-y-1"><span className={label}>Belt and airbag</span>
          <Segmented<Guard> label="Belt and airbag" value={guard} onChange={setGuard} segments={[{ value: 'none', label: 'Nothing' }, { value: 'belt', label: 'Belt' }, { value: 'bag', label: 'Airbag' }, { value: 'both', label: 'Belt + airbag' }]} />
        </div>
        {side ? <div className="space-y-1"><span className={label}>Who</span>
          <Segmented<SideSeat> label="Who" value={sideSeat} onChange={setSideSeat} segments={[{ value: 'near', label: 'On the struck side' }, { value: 'far', label: 'The other side' }, { value: 'beside', label: 'Other side, someone beside' }]} />
        </div> : null}
        {side ? <div className="space-y-1"><span className={label}>Row</span>
          <Segmented<SideRow> label="Row" value={sideRow} onChange={setSideRow} segments={[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Back' }]} />
        </div> : null}
        {side ? <div className="space-y-1"><span className={label}>Angle</span>
          <Segmented<SideAngle> label="Angle" value={sideAngle} onChange={setSideAngle} segments={[{ value: '0', label: 'Square on' }, { value: '15', label: '15°' }, { value: '30', label: '30°' }]} />
        </div> : <>
        <div className="space-y-1"><span className={label}>How much of the front hits</span>
          <Segmented<Overlap> label="How much of the front hits" value={overlap} onChange={setOverlap} segments={[{ value: '1', label: 'All of it' }, { value: '0.4', label: '40%' }, { value: '0.25', label: '25%' }]} />
        </div>
        <div className="space-y-1"><span className={label}>Who</span>
          <Segmented<Seat> label="Who" value={seat} onChange={setSeat} segments={[{ value: 'front', label: 'The driver' }, { value: 'pushed', label: 'Driver, unbelted behind' }, { value: 'rear', label: 'Back seat' }]} />
        </div>
        </>}
      </div>
      <div ref={box} className="flex min-h-0 flex-1 flex-col p-3">
        <canvas ref={cv} role="img" aria-label={`${side ? 'Sideways push' : 'Deceleration'} over time: the car (grey) and the person (violet); ${facts[0][1]}`} className="rounded-lg ring-1 ring-zinc-200 dark:ring-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
        {facts.map(([a, b]) => <div key={a}><p className="font-semibold text-zinc-500 dark:text-zinc-400">{a}</p><p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{b}</p></div>)}
      </div>
    </section>
  );
}
