'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Magnet, Plus, Trash2, Zap } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { mapOf } from '@/lib/lab/colormap';
import { FIELD_PRESETS, newRegionId, type FieldMode, type FieldModel, type Region, type RegionKind } from '@/lib/sim/fields';
import { NumField, ui } from './bench-ui';
import type { FromFields, ToFields } from './fields.worker';

// Hyperion Simulate → Fields (M548): the electromagnetics workbench. On the left the study (magnetic or electric, a
// ready-made start, the parts: coils, magnets, iron, electrodes, dielectrics, each a box or a disc you size by numbers
// or drag in the picture); on the right the field in colour with its field lines (magnetic) or equipotentials
// (electric), and the numbers: the strongest field, the energy stored, the force on the chosen part, the capacitance.

const KEEP = 'uv-sim-fields';
const KINDS: Record<RegionKind, { name: string; mode: FieldMode; unit: string; label: string; start: number; color: string }> = {
  coil: { name: 'Coil (current)', mode: 'magnetic', unit: 'A/mm², minus = out of the page', label: 'Current density', start: 3, color: '#f97316' },
  magnet: { name: 'Permanent magnet', mode: 'magnetic', unit: 'T', label: 'Remanence (strength)', start: 1.2, color: '#dc2626' },
  iron: { name: 'Iron', mode: 'magnetic', unit: '× air', label: 'Relative permeability', start: 1000, color: '#71717a' },
  electrode: { name: 'Electrode', mode: 'electric', unit: 'V', label: 'Voltage', start: 100, color: '#eab308' },
  dielectric: { name: 'Insulator', mode: 'electric', unit: '× air', label: 'Relative permittivity', start: 4, color: '#06b6d4' },
};
const read = (): FieldModel => {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Partial<FieldModel> | null;
    if (!v || (v.mode !== 'magnetic' && v.mode !== 'electric') || !Array.isArray(v.regions)) return FIELD_PRESETS[0].make();
    const num = (x: unknown, d: number, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
    const width = num(v.width, 200, 20, 5000), height = num(v.height, 160, 20, 5000);
    return { mode: v.mode, width, height, regions: v.regions.filter((r) => r && r.kind in KINDS && KINDS[r.kind].mode === v.mode).slice(0, 40).map((r) => ({
      id: String(r.id), kind: r.kind, round: r.round === true, x: num(r.x, 0, 0, width), y: num(r.y, 0, 0, height), w: num(r.w, 10, 0.5, width), h: num(r.h, 10, 0.5, height),
      value: num(r.value, KINDS[r.kind].start, -1e5, 1e6), angle: num(r.angle, 90, -360, 360) })) };
  } catch { return FIELD_PRESETS[0].make(); }
};
const fmt = (v: number, unit: string) => {
  const a = Math.abs(v);
  if (!a) return `0 ${unit}`;
  const p = [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]] as const;
  const [s, f] = p.find(([, f2]) => a >= f2) ?? p[p.length - 1];
  return `${+(v / f).toPrecision(3)} ${s}${unit}`;
};

export function FieldsBench() {
  const dark = useDarkMode();
  const [model, setModelNow] = useState<FieldModel>(read);
  const [selId, setSelId] = useState<string | null>(null);
  const [out, setOut] = useState<FromFields | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null), seq = useRef(0), waiting = useRef<FieldModel | null>(null), running = useRef(false), keepTimer = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const magnetic = model.mode === 'magnetic';

  const setModel = (f: (m: FieldModel) => FieldModel) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });
  const send = useEffectEvent((m: FieldModel) => {
    if (!worker.current) return;
    if (running.current) { waiting.current = m; return; }
    running.current = true;
    setBusy(true);
    worker.current.postMessage({ id: ++seq.current, model: m } satisfies ToFields);
  });
  useEffect(() => {
    const w = new Worker(new URL('./fields.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromFields>) => {
      running.current = false;
      setOut(e.data);
      const next = waiting.current;
      waiting.current = null;
      if (next) send(next); else setBusy(false);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => { const t = window.setTimeout(() => send(model), 80); return () => clearTimeout(t); }, [model]);

  const res = out?.result ?? null;
  const sel = model.regions.find((r) => r.id === selId) ?? null;
  const force = sel && res ? res.forces.find((f) => f.id === sel.id) : null;
  const turbo = useMemo(() => mapOf('turbo', 256)!, []);
  // A colour scale that ignores the hottest 1% (a corner of iron or an electrode's edge would wash everything out).
  const top = useMemo(() => { if (!res) return 1; const s = Float64Array.from(res.mag).sort(); return s[Math.floor(s.length * 0.99)] || res.peak || 1; }, [res]);

  // Draw: the field's size, the lines, the parts' outlines.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const box = c.parentElement!, Wpx = box.clientWidth, Hpx = box.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Wpx * dpr; c.height = Hpx * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wpx, Hpx);
    const s = Math.min((Wpx - 24) / model.width, (Hpx - 24) / model.height), ox = (Wpx - model.width * s) / 2, oy = (Hpx + model.height * s) / 2;
    const X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s;
    if (res) {
      const img = new ImageData(res.nx, res.ny);
      for (let j = 0; j < res.ny; j++) for (let i = 0; i < res.nx; i++) {
        const v = Math.min(1, res.mag[j * res.nx + i] / top), row = turbo[Math.min(255, Math.floor(v * 255))], k = ((res.ny - 1 - j) * res.nx + i) * 4;
        img.data[k] = row[0] * 255; img.data[k + 1] = row[1] * 255; img.data[k + 2] = row[2] * 255; img.data[k + 3] = 255;
      }
      const off = new OffscreenCanvas(res.nx, res.ny);
      off.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(off, X(0), Y(res.ny * res.h), res.nx * res.h * s, res.ny * res.h * s);
      g.beginPath();
      for (const [x0, y0, x1, y1] of out!.lines) { g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); }
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.stroke();
    }
    model.regions.forEach((r) => {
      g.beginPath();
      if (r.round) g.ellipse(X(r.x + r.w / 2), Y(r.y + r.h / 2), (r.w / 2) * s, (r.h / 2) * s, 0, 0, Math.PI * 2); else g.rect(X(r.x), Y(r.y + r.h), r.w * s, r.h * s);
      g.strokeStyle = r.id === selId ? (dark ? '#fff' : '#000') : KINDS[r.kind].color; g.lineWidth = r.id === selId ? 2.5 : 1.5; g.stroke();
      const cx = X(r.x + r.w / 2), cy = Y(r.y + r.h / 2);
      g.fillStyle = '#fff'; g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (r.kind === 'coil') g.fillText(r.value >= 0 ? '⊗' : '⊙', cx, cy);
      if (r.kind === 'magnet') { const a = ((r.angle ?? 0) * Math.PI) / 180, l = Math.min(r.w, r.h) * s * 0.35; g.beginPath(); g.moveTo(cx - Math.cos(a) * l, cy + Math.sin(a) * l); g.lineTo(cx + Math.cos(a) * l, cy - Math.sin(a) * l); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.fillText('N', cx + Math.cos(a) * l * 1.5, cy - Math.sin(a) * l * 1.5); }
      if (r.kind === 'electrode') g.fillText(`${r.value} V`, cx, cy);
    });
    g.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.strokeRect(X(0), Y(model.height), model.width * s, model.height * s);
    (c as HTMLCanvasElement & { toMM?: (px: number, py: number) => [number, number] }).toMM = (px, py) => [(px - ox) / s, (oy - py) / s];
  }, [res, out, model, selId, dark, turbo, top]);

  const toMM = (e: React.PointerEvent) => {
    const c = canvas.current as (HTMLCanvasElement & { toMM?: (px: number, py: number) => [number, number] }) | null, b = c?.getBoundingClientRect();
    return c?.toMM && b ? c.toMM(e.clientX - b.left, e.clientY - b.top) : null;
  };
  const hit = (x: number, y: number) => [...model.regions].reverse().find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;
  const setRegion = (id: string, f: (r: Region) => Region) => setModel((m) => ({ ...m, regions: m.regions.map((r) => (r.id === id ? f(r) : r)) }));
  const add = (kind: RegionKind) => {
    const id = newRegionId(), w = model.width / 6, h = model.height / 6;
    setModel((m) => ({ ...m, regions: [...m.regions, { id, kind, x: m.width / 2 - w / 2, y: m.height / 2 - h / 2, w, h, value: KINDS[kind].start, angle: 90 }] }));
    setSelId(id);
  };
  const png = () => canvas.current?.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `fields-${model.mode}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  const { item, on, small, label, select } = ui;
  const kinds = (Object.keys(KINDS) as RegionKind[]).filter((k) => KINDS[k].mode === model.mode);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[22rem_1fr]">
      <section className="panel space-y-3 p-3" aria-label="Study">
        <div><span className={label}>What to solve</span>
          <div className="mt-1"><Segmented<FieldMode> label="What to solve" value={model.mode} onChange={(v) => { setModel(() => FIELD_PRESETS.find((p) => p.make().mode === v)!.make()); setSelId(null); }} segments={[{ value: 'magnetic', label: 'Magnetic' }, { value: 'electric', label: 'Electric' }]} /></div>
        </div>
        <label className={label}>Start from
          <select className={cn(select, 'mt-1 w-full')} value="" onChange={(e) => { const p = FIELD_PRESETS.find((x) => x.id === e.target.value); if (p) { setModel(() => p.make()); setSelId(null); } }}>
            <option value="">Choose a ready-made study…</option>{FIELD_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Box width" unit="mm" min={20} value={model.width} onChange={(v) => setModel((m) => ({ ...m, width: Math.max(20, Math.min(5000, v)) }))} />
          <NumField label="Box height" unit="mm" min={20} value={model.height} onChange={(v) => setModel((m) => ({ ...m, height: Math.max(20, Math.min(5000, v)) }))} />
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{magnetic ? <Magnet className="h-3.5 w-3.5" aria-hidden /> : <Zap className="h-3.5 w-3.5" aria-hidden />}<span className="flex-1">Parts</span>
            <select aria-label="Add a part" value="" onChange={(e) => { if (e.target.value) add(e.target.value as RegionKind); }} className={ui.add}>
              <option value="">+ Add</option>{kinds.map((k) => <option key={k} value={k}>{KINDS[k].name}</option>)}
            </select>
          </div>
          <div className="mt-1 space-y-0.5">
            {model.regions.map((r) => (
              <button key={r.id} type="button" className={cn(item, r.id === selId && on)} aria-current={r.id === selId || undefined} onClick={() => setSelId(r.id)}>
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: KINDS[r.kind].color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{KINDS[r.kind].name}<span className="font-normal text-zinc-500 dark:text-zinc-400">: {r.value} {KINDS[r.kind].unit.split(',')[0]}</span></span>
              </button>
            ))}
            {!model.regions.length && <p className="px-2 text-xs text-zinc-500 dark:text-zinc-400">No parts yet: add one.</p>}
          </div>
        </div>
        {sel && (
          <div className="space-y-2 rounded-xl border border-zinc-200 p-2.5 dark:border-white/10">
            <NumField label={KINDS[sel.kind].label} unit={KINDS[sel.kind].unit} value={sel.value} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, value: v }))} />
            {sel.kind === 'magnet' && <NumField label="North points at" unit="degrees, 0 = right, 90 = up" value={sel.angle ?? 90} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, angle: v }))} />}
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Left" unit="mm" value={+sel.x.toFixed(2)} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, x: v }))} />
              <NumField label="Bottom" unit="mm" value={+sel.y.toFixed(2)} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, y: v }))} />
              <NumField label="Width" unit="mm" min={0.5} value={+sel.w.toFixed(2)} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, w: Math.max(0.5, v) }))} />
              <NumField label="Height" unit="mm" min={0.5} value={+sel.h.toFixed(2)} onChange={(v) => setRegion(sel.id, (r) => ({ ...r, h: Math.max(0.5, v) }))} />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={!!sel.round} onChange={(e) => setRegion(sel.id, (r) => ({ ...r, round: e.target.checked }))} className="h-4 w-4 accent-violet-600" />Round</label>
            {force && <p className="text-xs text-zinc-600 dark:text-zinc-300">Force on it: <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">{fmt(Math.hypot(force.fx, force.fy), 'N')}</span> per metre of length, x {fmt(force.fx, 'N')}, y {fmt(force.fy, 'N')}.</p>}
            <button type="button" className={small} onClick={() => { setModel((m) => ({ ...m, regions: m.regions.filter((r) => r.id !== sel.id) })); setSelId(null); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove</button>
          </div>
        )}
        {out?.error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{out.error}</p>}
        {res && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" data-fields-facts>
            {[[magnetic ? 'Strongest field' : 'Strongest field', magnetic ? fmt(res.peak, 'T') : fmt(res.peak, 'V/m')], ['Energy stored', `${fmt(res.energy, 'J')}/m`],
              ...(res.capacitance !== null ? [['Capacitance', `${fmt(res.capacitance, 'F')}/m`]] : []), ['Solved', busy ? 'solving…' : `${Math.round(out!.ms)} ms`]].map(([k, v]) => (
              <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>))}
          </dl>
        )}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {magnetic ? 'A slice through something long (a motor, a busbar, an electromagnet): coils carry current into the page (⊗) or out of it (⊙), magnets point their north along the arrow, iron gathers the field. The white lines are the field lines; the box holds all the flux.'
            : 'A slice through something long (a cable, a capacitor, a sensor): electrodes are held at their voltages, insulators store more field. The white lines join points at the same voltage; the field leaves freely through the box’s sides.'}
          {' '}Press a part to choose it, drag it to move it. Forces and energy are per metre out of the page.
        </p>
        <button type="button" className={small} onClick={png}><ImageIcon className="h-3.5 w-3.5" aria-hidden />Picture (PNG)</button>
      </section>
      <section className="panel relative min-h-[26rem] overflow-hidden p-0" aria-label="Graphics">
        <div className="absolute start-3 top-3 z-10 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-200">
          {magnetic ? 'Magnetic field strength' : 'Electric field strength'}: 0 to {res ? (magnetic ? fmt(top, 'T') : fmt(top, 'V/m')) : '…'}
        </div>
        <div className="absolute inset-0">
          <canvas ref={canvas} className="h-full w-full touch-none" role="img" aria-label={`${magnetic ? 'Magnetic' : 'Electric'} field${res ? `, strongest ${magnetic ? fmt(res.peak, 'T') : fmt(res.peak, 'V/m')}` : ''}`}
            onPointerDown={(e) => { const p = toMM(e); if (!p) return; const r = hit(p[0], p[1]); setSelId(r?.id ?? null); if (r) { drag.current = { id: r.id, dx: p[0] - r.x, dy: p[1] - r.y }; e.currentTarget.setPointerCapture(e.pointerId); } }}
            onPointerMove={(e) => { const d = drag.current, p = d && toMM(e); if (!d || !p) return; setRegion(d.id, (r) => ({ ...r, x: Math.max(0, Math.min(model.width - r.w, p[0] - d.dx)), y: Math.max(0, Math.min(model.height - r.h, p[1] - d.dy)) })); }}
            onPointerUp={() => { drag.current = null; }} />
        </div>
        {!model.regions.length && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-zinc-500 dark:text-zinc-400"><span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" aria-hidden />Add a part to see its field.</span></div>}
      </section>
    </div>
  );
}
