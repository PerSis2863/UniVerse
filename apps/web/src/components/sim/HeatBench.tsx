'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Box, CheckCircle2, Clock, Download, Flame, Grid3x3, Image as ImageIcon, Layers, Pause, Play, RotateCcw, Thermometer, Trash2, TriangleAlert, Wind } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import { shapeOf, TEMPLATES } from '@/lib/sim/part';
import { ShapeSketch } from './ShapeSketch';
import { MATERIALS } from '@/lib/sim/structure';
import { edgeGroups, newId, partOf, templateInfo } from '@/lib/sim/model';
import { HEAT_NAMES, heatProblem, readHeat, startHeat, type HeatModel } from '@/lib/sim/heat-model';
import type { HeatBc } from '@/lib/sim/heat';
import type { Fineness } from '@/lib/sim/mesh';
import { SimCanvas, type Shown, type SimView } from './SimCanvas';
import { EdgeTicks, NumField, ui } from './bench-ui';
import type { FromSim, ToSim } from './sim.worker';

// Hyperion Simulate → Heat (M407): the thermal workbench, laid out like Structures: the study's outline and details on
// the left, the part in colour on the right. Every change solves again; over time, a slider and Play step through it.

const KEEP = 'uv-sim-heat';
type Sel = { k: 'geometry' | 'material' | 'mesh' | 'inside' | 'faces' | 'time' | 'solution' } | { k: 'bc'; id: string };
const COLOURS: Record<HeatBc['kind'], string> = { temp: '#ea580c', flux: '#dc2626', convection: '#0284c7' };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function HeatBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [model, setModelNow] = useState<HeatModel>(() => { try { return readHeat(JSON.parse(localStorage.getItem(KEEP) ?? 'null')); } catch { return startHeat(); } });
  const [sel, setSel] = useState<Sel>({ k: 'solution' });
  const [out, setOut] = useState<FromSim | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<'T' | 'flux'>('T');
  const [showMesh, setShowMesh] = useState(false);
  const [frame, setFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const worker = useRef<Worker | null>(null), seq = useRef(0), waiting = useRef<HeatModel | null>(null), running = useRef(false), keepTimer = useRef(0);
  const view = useRef<SimView>(null);

  const setModel = (f: (m: HeatModel) => HeatModel) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });
  const send = useEffectEvent((m: HeatModel) => {
    if (!worker.current) return;
    if (running.current) { waiting.current = m; return; }
    running.current = true;
    setBusy(true);
    worker.current.postMessage({ id: ++seq.current, heat: m, solve: !heatProblem(m) } satisfies ToSim);
  });
  useEffect(() => {
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromSim>) => {
      running.current = false;
      setOut(e.data);
      const next = waiting.current;
      waiting.current = null;
      if (next) send(next); else setBusy(false);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => { const t = window.setTimeout(() => send(model), 120); return () => clearTimeout(t); }, [model]);

  const { part, edges } = useMemo(() => partOf(model), [model]);
  const groups = useMemo(() => edgeGroups(edges), [edges]);
  const problem = heatProblem(model);
  const heat = out?.heat ?? null, mesh = out?.mesh ?? null;
  const material = MATERIALS.find((m) => m.id === model.material) ?? MATERIALS[0];
  const tpl = templateInfo(model.template);
  const frames = heat?.frames.length ? heat.frames : null;
  const k = frames ? Math.min(frame ?? frames.length - 1, frames.length - 1) : 0;
  const T = frames ? frames[k] : heat?.T ?? null;
  // Step through time while playing (looping back to the start).
  useEffect(() => {
    if (!playing || !frames) return;
    const t = window.setTimeout(() => setFrame((f) => ((f ?? frames.length - 1) + 1) % frames.length), 90);
    return () => clearTimeout(t);
  }, [playing, frames, frame]);

  const where = (ids: string[]) => groups.filter((g) => g.ids.some((i) => ids.includes(i))).map((g) => g.label).join(', ') || 'no edge yet';
  const letterOf = (id: string) => LETTERS[model.bcs.findIndex((b) => b.id === id) % 26];
  const toggleEdge = (id: string) => {
    if (sel.k !== 'bc') return;
    const ids = groups.find((g) => g.ids.includes(id))?.ids ?? [id];
    setModel((m) => ({ ...m, bcs: m.bcs.map((b) => (b.id === sel.id ? { ...b, edges: ids.every((i) => b.edges.includes(i)) ? b.edges.filter((i) => !ids.includes(i)) : [...new Set([...b.edges, ...ids])] } : b)) }));
  };
  const addBc = (kind: HeatBc['kind']) => {
    const id = newId('t');
    const bc: HeatBc = kind === 'temp' ? { id, kind, edges: [], T: 100 } : kind === 'flux' ? { id, kind, edges: [], q: 5000 } : { id, kind, edges: [], h: 25, Tinf: 20 };
    setModel((m) => ({ ...m, bcs: [...m.bcs, bc] }));
    setSel({ k: 'bc', id });
  };
  const setBc = (id: string, patch: Partial<HeatBc>) => setModel((m) => ({ ...m, bcs: m.bcs.map((b) => (b.id === id ? ({ ...b, ...patch } as HeatBc) : b)) }));
  const download = (name: string, body: BlobPart, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const csv = () => {
    if (!heat || !mesh) return;
    const rows = ['node,x_mm,y_mm,temperature_C,heat_flow_W_per_m2'];
    for (let n = 0; n < mesh.x.length; n++) rows.push([n + 1, +mesh.x[n].toPrecision(7), +mesh.y[n].toPrecision(7), +heat.T[n].toPrecision(7), +heat.flux[n].toPrecision(7)].join(','));
    download(`${tpl.name.replace(/\W+/g, '-').toLowerCase()}-heat.csv`, `${rows.join('\n')}\n`, 'text/csv');
  };
  const png = async () => { const b = await view.current?.png(); if (b) download(`${tpl.name.replace(/\W+/g, '-').toLowerCase()}-heat.png`, b, 'image/png'); };
  const { item, on, small, label } = ui;
  const isSel = (kk: string, id?: string) => sel.k === kk && (!id || ('id' in sel && sel.id === id));
  const row = (kk: Sel['k'], Icon: typeof Box, name: string, note: string) => (
    <button type="button" className={cn(item, isSel(kk) && on)} aria-current={isSel(kk) || undefined} onClick={() => setSel({ k: kk } as Sel)}>
      <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden /><span className="flex-1">{name}</span><span className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">{note}</span>
    </button>
  );
  const hottest = T ? Math.max(...T) : 0, coolest = T ? Math.min(...T) : 0;

  const outline = (
    <nav aria-label="Study outline" className="space-y-0.5">
      {row('geometry', Box, 'Geometry', tpl.name)}
      {row('material', Layers, 'Material', material.name)}
      {row('mesh', Grid3x3, 'Mesh', mesh ? `${mesh.x.length.toLocaleString()} nodes` : '…')}
      <div className="flex items-center gap-2 px-2 pt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><Thermometer className="h-3.5 w-3.5" aria-hidden /><span className="flex-1">On the edges</span>
        <select aria-label="Add a condition on edges" value="" onChange={(e) => { if (e.target.value) addBc(e.target.value as HeatBc['kind']); }} className={ui.add}>
          <option value="">+ Add</option>{(Object.keys(HEAT_NAMES) as HeatBc['kind'][]).map((kk) => <option key={kk} value={kk}>{HEAT_NAMES[kk]}</option>)}
        </select>
      </div>
      {model.bcs.map((b) => (
        <button key={b.id} type="button" className={cn(item, 'ps-4', isSel('bc', b.id) && on)} aria-current={isSel('bc', b.id) || undefined} onClick={() => setSel({ k: 'bc', id: b.id })}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-bold text-white" style={{ background: COLOURS[b.kind] }} aria-hidden>{letterOf(b.id)}</span>
          <span className="min-w-0 flex-1 truncate">{b.kind === 'temp' ? `${b.T} °C` : b.kind === 'flux' ? `${b.q.toLocaleString()} W/m² in` : `Air ${b.Tinf} °C`}<span className="font-normal text-zinc-500 dark:text-zinc-400">: {where(b.edges)}</span></span>
        </button>
      ))}
      <div className="px-2 pt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">The whole part</div>
      {row('inside', Flame, 'Heat made inside', model.generation ? `${model.generation.toLocaleString()} W/m³` : 'none')}
      {row('faces', Wind, 'Air on its faces', model.faces.h > 0 ? `${model.faces.h} W/m²K at ${model.faces.Tinf} °C` : 'none')}
      {row('time', Clock, 'Over time', model.transient.on ? `${model.transient.seconds.toLocaleString()} s` : 'settled (steady)')}
      <button type="button" className={cn(item, 'mt-1', isSel('solution') && on)} aria-current={isSel('solution') || undefined} onClick={() => setSel({ k: 'solution' })}>
        {heat ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
        <span className="flex-1">Solution</span><span className="text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{busy ? 'solving…' : heat && out ? `${Math.round(out.ms.mesh + out.ms.solve)} ms` : 'not solved'}</span>
      </button>
    </nav>
  );

  let details: ReactNode = null;
  if (sel.k === 'geometry') {
    details = (
      <div className="space-y-3">
        <label className={label}>Shape
          <select value={model.template} onChange={(e) => {
            // Your own shape starts as the shape there was (its supports and loads stay on the same sides).
            if (e.target.value === 'custom') { const from = shapeOf(part); setModel((m) => ({ ...m, template: 'custom', custom: from ?? startHeat('custom').custom })); if (!from) toast.message('Started from an L shape: drag its corners.'); return; }
            setModel(() => ({ ...startHeat(e.target.value), material: model.material, thickness: model.thickness, fineness: model.fineness })); toast.message('New shape: it was warmed and cooled the usual way.');
          }} className="input mt-1 w-full">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="custom">Your own shape (draw it)</option>
          </select>
        </label>
        {model.template === 'custom' && model.custom && <ShapeSketch shape={model.custom} onChange={(c) => setModel((m) => ({ ...m, custom: c }))} />}
        <div className="grid grid-cols-2 gap-2">
          {tpl.params.map((p) => <NumField key={p.key} label={p.label} unit="mm" min={p.min} value={model.values[p.key]} onChange={(v) => setModel((m) => ({ ...m, values: { ...m.values, [p.key]: Math.max(p.min, Math.min(p.max, v)) } }))} />)}
          <NumField label="Thickness" unit="mm" min={0.01} value={model.thickness} onChange={(v) => setModel((m) => ({ ...m, thickness: Math.max(0.01, v) }))} />
        </div>
      </div>
    );
  } else if (sel.k === 'material') {
    details = (
      <div className="space-y-3">
        <label className={label}>Material
          <select value={model.material} onChange={(e) => setModel((m) => ({ ...m, material: e.target.value }))} className="input mt-1 w-full">
            {MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {[['Conducts heat (k)', `${material.k} W/(m·K)`], ['Stores heat (c)', `${material.c} J/(kg·K)`], ['Density', `${material.rho.toLocaleString()} kg/m³`]].map(([a, b]) => <div key={a}><dt className="text-zinc-500 dark:text-zinc-400">{a}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{b}</dd></div>)}
        </dl>
      </div>
    );
  } else if (sel.k === 'mesh') {
    details = (
      <div className="space-y-3">
        <div><span className={label}>Element size</span>
          <div className="mt-1"><Segmented<Fineness> label="Element size" value={model.fineness} onChange={(v) => setModel((m) => ({ ...m, fineness: v }))} segments={[{ value: 'coarse', label: 'Coarse' }, { value: 'medium', label: 'Medium' }, { value: 'fine', label: 'Fine' }, { value: 'finest', label: 'Finest' }]} /></div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} className="h-4 w-4 accent-violet-600" />Show the mesh</label>
      </div>
    );
  } else if (sel.k === 'inside') {
    details = (
      <div className="space-y-2">
        <NumField label="Heat made inside" unit="W/m³" value={model.generation} onChange={(v) => setModel((m) => ({ ...m, generation: v }))} />
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Heat made all through the part, such as an electric current in a conductor or a battery cell. 0 for none.</p>
      </div>
    );
  } else if (sel.k === 'faces') {
    details = (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="How well the air takes heat (h)" unit="W/m²K" min={0} value={model.faces.h} onChange={(v) => setModel((m) => ({ ...m, faces: { ...m.faces, h: Math.max(0, v) } }))} />
          <NumField label="Air temperature" unit="°C" value={model.faces.Tinf} onChange={(v) => setModel((m) => ({ ...m, faces: { ...m.faces, Tinf: v } }))} />
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Both flat faces give heat to the air. Still air is about 5–25, a fan 25–250, water 500 and more. 0 for none (the faces wrapped).</p>
      </div>
    );
  } else if (sel.k === 'time') {
    details = (
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={model.transient.on} onChange={(e) => setModel((m) => ({ ...m, transient: { ...m.transient, on: e.target.checked } }))} className="h-4 w-4 accent-violet-600" />Follow it over time</label>
        {model.transient.on && (
          <div className="grid grid-cols-2 gap-2">
            <NumField label="For" unit="seconds" min={1} value={model.transient.seconds} onChange={(v) => setModel((m) => ({ ...m, transient: { ...m.transient, seconds: Math.max(1, v) } }))} />
            <NumField label="Steps" min={1} value={model.transient.steps} onChange={(v) => setModel((m) => ({ ...m, transient: { ...m.transient, steps: Math.max(1, Math.min(200, Math.round(v))) } }))} />
            <NumField label="Start temperature" unit="°C" value={model.transient.T0} onChange={(v) => setModel((m) => ({ ...m, transient: { ...m.transient, T0: v } }))} />
          </div>
        )}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Off: the temperatures it settles at in the end. On: how it warms or cools from the start temperature, step by step.</p>
      </div>
    );
  } else if (sel.k === 'bc' && model.bcs.some((b) => b.id === sel.id)) {
    const b = model.bcs.find((x) => x.id === sel.id)!;
    details = (
      <div className="space-y-3">
        <label className={label}>Kind
          <select value={b.kind} onChange={(e) => { const kk = e.target.value as HeatBc['kind']; setBc(b.id, kk === 'temp' ? { kind: kk, T: 100 } as Partial<HeatBc> : kk === 'flux' ? { kind: kk, q: 5000 } as Partial<HeatBc> : { kind: kk, h: 25, Tinf: 20 } as Partial<HeatBc>); }} className="input mt-1 w-full">
            {(Object.keys(HEAT_NAMES) as HeatBc['kind'][]).map((kk) => <option key={kk} value={kk}>{HEAT_NAMES[kk]}</option>)}
          </select>
        </label>
        {b.kind === 'temp' && <NumField label="Temperature" unit="°C" value={b.T} onChange={(v) => setBc(b.id, { T: v })} />}
        {b.kind === 'flux' && <NumField label="Heat flowing in (a minus takes it out)" unit="W/m²" value={b.q} onChange={(v) => setBc(b.id, { q: v })} />}
        {b.kind === 'convection' && (
          <div className="grid grid-cols-2 gap-2">
            <NumField label="How well it takes heat (h)" unit="W/m²K" min={0} value={b.h} onChange={(v) => setBc(b.id, { h: Math.max(0, v) })} />
            <NumField label="Its temperature" unit="°C" value={b.Tinf} onChange={(v) => setBc(b.id, { Tinf: v })} />
          </div>
        )}
        <EdgeTicks groups={groups} ids={b.edges} onToggle={toggleEdge} />
        <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => { setModel((m) => ({ ...m, bcs: m.bcs.filter((x) => x.id !== b.id) })); setSel({ k: 'solution' }); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>
      </div>
    );
  }
  if (!details) {
    details = (
      <div className="space-y-3">
        {problem ? <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{problem}</p>
          : out?.error ? <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{out.error}</p>
            : T && <p className="rounded-lg bg-orange-50 p-2.5 text-xs leading-relaxed text-orange-950 dark:bg-orange-950/40 dark:text-orange-100">{frames ? `After ${(heat!.times[k]).toLocaleString()} s the` : 'In the end the'} hottest place is <b>{+hottest.toPrecision(4)} °C</b> and the coolest <b>{+coolest.toPrecision(4)} °C</b>.</p>}
        {heat && heat.through.length > 0 && (
          <div>
            <p className={label}>Heat leaving through each held edge</p>
            <table className="mt-1 w-full text-xs tabular-nums">
              <tbody>
                {heat.through.map((r) => <tr key={r.id} className="border-t border-zinc-100 dark:border-white/[0.06]"><td className="py-1">{letterOf(r.id)}: {where(model.bcs.find((b) => b.id === r.id)?.edges ?? [])}</td><td className="py-1 text-end font-mono">{(+r.watts.toPrecision(4)).toLocaleString()} W</td></tr>)}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">A minus means heat goes into the part there.{frames ? ' At the last step.' : ''}</p>
          </div>
        )}
        {heat && (
          <div className="flex flex-wrap gap-1">
            <button type="button" className={small} onClick={() => void png()}><ImageIcon className="h-3.5 w-3.5" aria-hidden />Picture (PNG)</button>
            <button type="button" className={small} onClick={csv}><Download className="h-3.5 w-3.5" aria-hidden />Results (CSV)</button>
          </div>
        )}
        <button type="button" className={small} onClick={() => { if (confirm('Start this study again?')) { setModel(() => startHeat(model.template)); setSel({ k: 'solution' }); } }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Start again</button>
      </div>
    );
  }

  const picking = sel.k === 'bc';
  const chosen = picking ? model.bcs.find((b) => b.id === sel.id)?.edges ?? [] : [];
  const zeros = useMemo(() => (mesh ? new Float64Array(mesh.x.length) : null), [mesh]);
  const shown: Shown | null = !problem && T && heat && zeros ? (field === 'T' ? { ux: zeros, uy: zeros, values: T, name: 'Temperature', unit: '°C' } : { ux: zeros, uy: zeros, values: heat.flux, name: 'Heat flow', unit: 'W/m²' }) : null;
  const marks = model.bcs.map((b) => ({ id: b.id, edges: b.edges, colour: COLOURS[b.kind], letter: letterOf(b.id) }));
  const graphic = (
    <section className="panel flex min-h-[22rem] flex-1 flex-col overflow-hidden p-0" aria-label="Graphics">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Show
          <select value={field} onChange={(e) => setField(e.target.value as 'T' | 'flux')} className={ui.select}><option value="T">Temperature</option><option value="flux">Heat flow</option></select>
        </label>
        <button type="button" className={small} aria-pressed={showMesh} onClick={() => setShowMesh((v) => !v)}><Grid3x3 className="h-3.5 w-3.5" aria-hidden />Mesh</button>
        {frames && (
          <span className="inline-flex min-w-[16rem] flex-1 items-center gap-2">
            <button type="button" className={small} aria-pressed={playing} disabled={still} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={0} max={frames.length - 1} value={k} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} aria-label="Time" className="min-w-0 flex-1 accent-violet-600" />
            <span className="w-20 text-end font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">{(heat!.times[k]).toLocaleString()} s</span>
          </span>
        )}
        {busy && <span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">solving…</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <SimCanvas ref={view} part={part} edges={edges} mesh={mesh} shown={shown} deform="none" showMesh={showMesh || sel.k === 'mesh'} playing={false}
          supports={[]} loads={[]} marks={marks} chosen={chosen} picking={picking} onPick={toggleEdge} dark={dark}
          label={shown ? `${tpl.name}: ${shown.name} from ${+Math.min(...shown.values).toPrecision(3)} to ${+Math.max(...shown.values).toPrecision(3)} ${shown.unit}` : `${tpl.name}: not solved yet`} />
      </div>
      {picking && <p className="border-t border-zinc-200/80 px-3 py-1.5 text-xs text-violet-800 dark:border-white/10 dark:text-violet-200">Press an edge in the picture to add it to {letterOf(sel.id)} or take it away.</p>}
    </section>
  );
  return (
    <div className="flex h-[calc(100dvh-9rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden p-0" aria-label="Study">
        <div className="max-h-[50%] shrink-0 overflow-y-auto border-b border-zinc-200/80 p-2 dark:border-white/10" data-no-motion>{outline}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-live="polite" data-no-motion>{details}</div>
      </aside>
      {graphic}
    </div>
  );
}
