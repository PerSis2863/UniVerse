'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Anchor, ArrowDown, Box, CheckCircle2, Download, Grid3x3, Image as ImageIcon, Layers, Pause, Play, RotateCcw, Trash2, TriangleAlert, Weight } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import { TEMPLATES } from '@/lib/sim/part';
import { MATERIALS, peak, type Load, type SupportKind } from '@/lib/sim/structure';
import { edgeGroups, FIELDS, LOAD_NAMES, modelProblem, newId, partOf, readModel, startModel, SUPPORT_NAMES, verdict, type Field, type Model } from '@/lib/sim/model';
import type { Fineness } from '@/lib/sim/mesh';
import { SimCanvas, type SimView } from './SimCanvas';
import type { FromSim, ToSim } from './sim.worker';

// Hyperion Simulate → Structures (M404): the workbench, laid out like engineering software. On the left the outline of
// the study (the part, its material, the mesh, the supports, the loads, the solution) and the details of what is
// chosen; on the right the graphics window. Every change solves again at once (a medium mesh takes milliseconds), so the
// colours follow the sizes and the loads as they are typed.

const KEEP = 'uv-sim-structure';
type Sel = { k: 'geometry' | 'material' | 'mesh' | 'solution' } | { k: 'support' | 'load'; id: string };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIRECTIONS = [{ a: -90, label: 'Down' }, { a: 90, label: 'Up' }, { a: 0, label: 'Right' }, { a: 180, label: 'Left' }];

export function StructureBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [model, setModelNow] = useState<Model>(() => { try { return readModel(JSON.parse(localStorage.getItem(KEEP) ?? 'null')); } catch { return startModel(); } });
  const [sel, setSel] = useState<Sel>({ k: 'solution' });
  const [out, setOut] = useState<FromSim | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<Field>('vm');
  const [deform, setDeform] = useState<'auto' | 'true' | 'none'>('auto');
  const [showMesh, setShowMesh] = useState(false);
  const [playing, setPlaying] = useState(false);
  const worker = useRef<Worker | null>(null), seq = useRef(0), waiting = useRef<Model | null>(null), running = useRef(false), keepTimer = useRef(0);
  const view = useRef<SimView>(null);

  const setModel = (f: (m: Model) => Model) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });
  const send = useEffectEvent((m: Model) => {
    if (!worker.current) return;
    if (running.current) { waiting.current = m; return; }
    running.current = true;
    setBusy(true);
    worker.current.postMessage({ id: ++seq.current, model: m, solve: !modelProblem(m) } satisfies ToSim);
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
  // Solve again whenever the study changes (a short pause first while typing).
  useEffect(() => { const t = window.setTimeout(() => send(model), 120); return () => clearTimeout(t); }, [model]);

  const { part, edges } = useMemo(() => partOf(model), [model]);
  const groups = useMemo(() => edgeGroups(edges), [edges]);
  const problem = modelProblem(model);
  const result = out?.result ?? null, mesh = out?.mesh ?? null;
  const material = MATERIALS.find((m) => m.id === model.material) ?? MATERIALS[0];
  const tpl = TEMPLATES.find((t) => t.id === model.template) ?? TEMPLATES[0];
  const maxVm = result ? peak(result.vm).value : 0, maxU = result ? peak(result.u).value : 0;
  const says = result ? verdict(maxVm, material.yieldMPa, material.name) : null;
  const groupOf = (id: string) => groups.find((g) => g.ids.includes(id));
  const where = (ids: string[]) => groups.filter((g) => g.ids.some((i) => ids.includes(i))).map((g) => g.label).join(', ') || 'no edge yet';
  const letterOf = (id: string) => { const i = [...model.supports.map((s) => s.id), ...model.loads.map((l) => l.id)].indexOf(id); return LETTERS[i % 26]; };

  /** A press on an edge (or a tick in the list) adds it to the chosen support or load, or takes it away. */
  const toggleEdge = (id: string) => {
    if (sel.k !== 'support' && sel.k !== 'load') return;
    const ids = groupOf(id)?.ids ?? [id];
    const flip = (list: string[]) => (ids.every((i) => list.includes(i)) ? list.filter((i) => !ids.includes(i)) : [...new Set([...list, ...ids])]);
    if (sel.k === 'support') setModel((m) => ({ ...m, supports: m.supports.map((s) => (s.id === sel.id ? { ...s, edges: flip(s.edges) } : s)) }));
    else setModel((m) => ({ ...m, loads: m.loads.map((l) => (l.id === sel.id ? { ...l, edges: flip(l.edges) } : l)) }));
  };
  const addSupport = (kind: SupportKind) => { const id = newId('s'); setModel((m) => ({ ...m, supports: [...m.supports, { id, kind, edges: [] }] })); setSel({ k: 'support', id }); };
  const addLoad = (kind: Load['kind']) => {
    const id = newId('l');
    const load: Load = kind === 'pressure' ? { id, kind, edges: [], p: 1 } : { id, kind, edges: [], F: 1000, angle: -90 };
    setModel((m) => ({ ...m, loads: [...m.loads, load] }));
    setSel({ k: 'load', id });
  };
  const remove = (id: string) => { setModel((m) => ({ ...m, supports: m.supports.filter((s) => s.id !== id), loads: m.loads.filter((l) => l.id !== id) })); setSel({ k: 'solution' }); };
  /** A force for a table: 0 when it is only rounding (a millionth of the loads). */
  const force = (v: number) => { const scale = result ? Math.max(1, Math.abs(result.applied.fx), Math.abs(result.applied.fy)) : 1; return Math.abs(v) < scale * 1e-6 ? '0' : (+v.toPrecision(5)).toLocaleString(); };
  const download = (name: string, body: BlobPart, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const csv = () => {
    if (!result || !mesh) return;
    const rows = ['node,x_mm,y_mm,ux_mm,uy_mm,u_mm,von_mises_MPa,s1_MPa,s2_MPa,sx_MPa,sy_MPa,sxy_MPa,safety'];
    for (let n = 0; n < mesh.x.length; n++) rows.push([n + 1, mesh.x[n], mesh.y[n], result.ux[n], result.uy[n], result.u[n], result.vm[n], result.s1[n], result.s2[n], result.sx[n], result.sy[n], result.sxy[n], result.safety[n]].map((v) => (typeof v === 'number' ? +v.toPrecision(7) : v)).join(','));
    download(`${tpl.name.replace(/\W+/g, '-').toLowerCase()}-results.csv`, `${rows.join('\n')}\n`, 'text/csv');
  };
  const png = async () => { const b = await view.current?.png(); if (b) download(`${tpl.name.replace(/\W+/g, '-').toLowerCase()}.png`, b, 'image/png'); };

  const item = 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]';
  const on = 'bg-violet-100 font-semibold text-violet-950 hover:bg-violet-100 dark:bg-violet-500/20 dark:text-white dark:hover:bg-violet-500/20';
  const small = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.08]';
  const label = 'block text-xs font-medium text-zinc-600 dark:text-zinc-300';
  const input = 'input mt-1 w-full font-mono tabular-nums';
  const isSel = (k: string, id?: string) => sel.k === k && (!id || ('id' in sel && sel.id === id));

  const outline = (
    <nav aria-label="Study outline" className="space-y-0.5">
      <button type="button" className={cn(item, isSel('geometry') && on)} aria-current={isSel('geometry') || undefined} onClick={() => setSel({ k: 'geometry' })}><Box className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden /><span className="flex-1">Geometry</span><span className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">{tpl.name}</span></button>
      <button type="button" className={cn(item, isSel('material') && on)} aria-current={isSel('material') || undefined} onClick={() => setSel({ k: 'material' })}><Layers className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden /><span className="flex-1">Material</span><span className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">{material.name}</span></button>
      <button type="button" className={cn(item, isSel('mesh') && on)} aria-current={isSel('mesh') || undefined} onClick={() => setSel({ k: 'mesh' })}><Grid3x3 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden /><span className="flex-1">Mesh</span><span className="text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{mesh ? `${mesh.x.length.toLocaleString()} nodes` : '…'}</span></button>
      <div className="flex items-center gap-2 px-2 pt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><Anchor className="h-3.5 w-3.5" aria-hidden /><span className="flex-1">Supports</span>
        <select aria-label="Add a support" value="" onChange={(e) => { if (e.target.value) addSupport(e.target.value as SupportKind); }} className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-zinc-200">
          <option value="">+ Add</option>{(Object.keys(SUPPORT_NAMES) as SupportKind[]).map((k) => <option key={k} value={k}>{SUPPORT_NAMES[k]}</option>)}
        </select>
      </div>
      {model.supports.map((s) => (
        <button key={s.id} type="button" className={cn(item, 'ps-4', isSel('support', s.id) && on)} aria-current={isSel('support', s.id) || undefined} onClick={() => setSel({ k: 'support', id: s.id })}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-blue-600 text-[11px] font-bold text-white" aria-hidden>{letterOf(s.id)}</span>
          <span className="min-w-0 flex-1 truncate">{SUPPORT_NAMES[s.kind]}<span className="font-normal text-zinc-500 dark:text-zinc-400">: {where(s.edges)}</span></span>
        </button>
      ))}
      <div className="flex items-center gap-2 px-2 pt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><ArrowDown className="h-3.5 w-3.5" aria-hidden /><span className="flex-1">Loads</span>
        <select aria-label="Add a load" value="" onChange={(e) => { if (e.target.value) addLoad(e.target.value as Load['kind']); }} className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-zinc-200">
          <option value="">+ Add</option>{(Object.keys(LOAD_NAMES) as Load['kind'][]).map((k) => <option key={k} value={k}>{LOAD_NAMES[k]}</option>)}
        </select>
      </div>
      {model.loads.map((l) => (
        <button key={l.id} type="button" className={cn(item, 'ps-4', isSel('load', l.id) && on)} aria-current={isSel('load', l.id) || undefined} onClick={() => setSel({ k: 'load', id: l.id })}>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-red-600 text-[11px] font-bold text-white" aria-hidden>{letterOf(l.id)}</span>
          <span className="min-w-0 flex-1 truncate">{LOAD_NAMES[l.kind]} {l.kind === 'pressure' ? `${l.p} MPa` : `${l.F.toLocaleString()} N`}<span className="font-normal text-zinc-500 dark:text-zinc-400">: {where(l.edges)}</span></span>
        </button>
      ))}
      <label className="flex items-center gap-2 px-2 py-1.5 ps-4 text-[13px] text-zinc-700 dark:text-zinc-200">
        <input type="checkbox" checked={model.gravity} onChange={(e) => setModel((m) => ({ ...m, gravity: e.target.checked }))} className="h-4 w-4 accent-violet-600" />
        <Weight className="h-3.5 w-3.5 text-zinc-500" aria-hidden />Its own weight (gravity, down)
      </label>
      <button type="button" className={cn(item, 'mt-1', isSel('solution') && on)} aria-current={isSel('solution') || undefined} onClick={() => setSel({ k: 'solution' })}>
        {result ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
        <span className="flex-1">Solution</span><span className="text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{busy ? 'solving…' : result && out ? `${Math.round(out.ms.mesh + out.ms.solve)} ms` : 'not solved'}</span>
      </button>
    </nav>
  );

  const edgeList = (ids: string[]) => (
    <fieldset className="space-y-1">
      <legend className={label}>Edges <span className="font-normal text-zinc-500 dark:text-zinc-400">(or press them in the picture)</span></legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {groups.map((g) => {
          const ticked = g.ids.every((i) => ids.includes(i));
          return (
            <label key={g.label} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs', ticked ? 'border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/15 dark:text-zinc-200')}>
              <input type="checkbox" checked={ticked} onChange={() => toggleEdge(g.ids[0])} className="h-3.5 w-3.5 accent-violet-600" />{g.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
  const num = (value: number, onChange: (v: number) => void, props: { label: string; unit?: string; min?: number; step?: string }) => (
    <label className={label}>{props.label}{props.unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({props.unit})</span>}
      <input type="number" inputMode="decimal" step={props.step ?? 'any'} min={props.min} value={Number.isFinite(value) ? value : ''} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(v); }} className={input} />
    </label>
  );

  let details: ReactNode = null;
  if (sel.k === 'geometry') {
    details = (
      <div className="space-y-3">
        <label className={label}>Shape
          <select value={model.template} onChange={(e) => { setModel(() => ({ ...startModel(e.target.value), material: model.material, thickness: model.thickness, fineness: model.fineness })); toast.message('New shape: its usual supports and loads were put on.'); }} className="input mt-1 w-full">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {tpl.params.map((p) => <div key={p.key}>{num(model.values[p.key], (v) => setModel((m) => ({ ...m, values: { ...m.values, [p.key]: Math.max(p.min, Math.min(p.max, v)) } })), { label: p.label, unit: 'mm', min: p.min })}</div>)}
          {num(model.thickness, (v) => setModel((m) => ({ ...m, thickness: Math.max(0.01, v) })), { label: 'Thickness', unit: 'mm', min: 0.01 })}
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">A flat part of this thickness, loaded in its own plane (plane stress). Sizes in millimetres; forces in newtons.</p>
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
          {[['Stiffness (Young’s modulus)', `${material.E.toLocaleString()} MPa`], ['Poisson’s ratio', String(material.nu)], ['Density', `${material.rho.toLocaleString()} kg/m³`], ['Yield strength', `${material.yieldMPa} MPa`]].map(([k, v]) => (
            <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
          ))}
        </dl>
      </div>
    );
  } else if (sel.k === 'mesh') {
    details = (
      <div className="space-y-3">
        <div><span className={label}>Element size</span>
          <div className="mt-1"><Segmented<Fineness> label="Element size" value={model.fineness} onChange={(v) => setModel((m) => ({ ...m, fineness: v }))} segments={[{ value: 'coarse', label: 'Coarse' }, { value: 'medium', label: 'Medium' }, { value: 'fine', label: 'Fine' }, { value: 'finest', label: 'Finest' }]} /></div>
        </div>
        {mesh && (
          <dl className="grid grid-cols-3 gap-2 text-xs">
            {[['Nodes', mesh.x.length.toLocaleString()], ['Elements', (mesh.tri.length / 6).toLocaleString()], ['Smallest angle', `${Math.round(mesh.minAngle)}°`]].map(([k, v]) => <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>)}
          </dl>
        )}
        <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} className="h-4 w-4 accent-violet-600" />Show the mesh</label>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Six-node triangles. A finer mesh is more exact where stress changes fast (round holes, inside corners) and takes longer. If the highest stress still changes much from Fine to Finest, look closer there.</p>
      </div>
    );
  } else if (sel.k === 'support' && model.supports.some((x) => x.id === sel.id)) {
    const s = model.supports.find((x) => x.id === sel.id)!;
    details = (
      <div className="space-y-3">
        <label className={label}>Kind
          <select value={s.kind} onChange={(e) => setModel((m) => ({ ...m, supports: m.supports.map((x) => (x.id === s.id ? { ...x, kind: e.target.value as SupportKind } : x)) }))} className="input mt-1 w-full">
            {(Object.keys(SUPPORT_NAMES) as SupportKind[]).map((k) => <option key={k} value={k}>{SUPPORT_NAMES[k]}</option>)}
          </select>
        </label>
        {edgeList(s.edges)}
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{s.kind === 'fixed' ? 'Held completely still, like welded or clamped.' : s.kind === 'slideX' ? 'Free to slide left and right, held up and down (a roller).' : 'Free to slide up and down, held left and right (a roller).'}</p>
        <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete this support</button>
      </div>
    );
  } else if (sel.k === 'load') {
    const l = model.loads.find((x) => x.id === sel.id);
    if (l) {
      const set = (patch: Partial<Load>) => setModel((m) => ({ ...m, loads: m.loads.map((x) => (x.id === l.id ? ({ ...x, ...patch } as Load) : x)) }));
      details = (
        <div className="space-y-3">
          <label className={label}>Kind
            <select value={l.kind} onChange={(e) => { const k = e.target.value as Load['kind']; set(k === 'pressure' ? { kind: k, p: 1 } as Partial<Load> : { kind: k, F: 'F' in l ? l.F : 1000, angle: 'angle' in l ? l.angle : -90 } as Partial<Load>); }} className="input mt-1 w-full">
              {(Object.keys(LOAD_NAMES) as Load['kind'][]).map((k) => <option key={k} value={k}>{LOAD_NAMES[k]}</option>)}
            </select>
          </label>
          {l.kind === 'pressure' ? num(l.p, (v) => set({ p: v }), { label: 'Pressure (a minus pulls)', unit: 'MPa' }) : (
            <>
              {num(l.F, (v) => set({ F: v }), { label: l.kind === 'bearing' ? 'Pull on the bolt' : 'Total force', unit: 'N' })}
              <div><span className={label}>Direction</span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {DIRECTIONS.map((d) => <button key={d.a} type="button" aria-pressed={l.angle === d.a} onClick={() => set({ angle: d.a })} className={cn('rounded-lg border px-2 py-1 text-xs', l.angle === d.a ? 'border-violet-400 bg-violet-50 font-semibold text-violet-950 dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/15 dark:text-zinc-200')}>{d.label}</button>)}
                  <label className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">or<input type="number" step="any" value={l.angle} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ angle: v }); }} className="w-16 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-white/15 dark:bg-white/[0.06]" aria-label="Angle in degrees" />°</label>
                </div>
              </div>
            </>
          )}
          {edgeList(l.edges)}
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{l.kind === 'force' ? 'The force is spread evenly along the edges.' : l.kind === 'pressure' ? 'Pushes square onto the edges (thickness × pressure per mm).' : 'A bolt or pin in a hole, pulled one way: it presses on that side of the hole, hardest in the middle.'}</p>
          <button type="button" className={cn(small, 'text-red-700 dark:text-red-400')} onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete this load</button>
        </div>
      );
    }
  }
  if (!details) {
    details = (
      <div className="space-y-3">
        {problem ? <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{problem}</p>
          : out?.error ? <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{out.error}</p>
            : says && <p className={cn('rounded-lg p-2.5 text-xs leading-relaxed', says.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200')}>{says.text}</p>}
        {result && (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {[['Largest movement', `${+maxU.toPrecision(3)} mm`], ['Highest stress', `${+maxVm.toPrecision(4)} MPa`], ['Weight of the part', `${+(result.massKg).toPrecision(3)} kg`], ['Unknowns solved', result.dofs.toLocaleString()]].map(([k, v]) => <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>)}
            </dl>
            <div>
              <p className={label}>What the supports carry</p>
              <table className="mt-1 w-full text-xs tabular-nums">
                <thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Support</th><th className="py-1 text-end font-medium">x (N)</th><th className="py-1 text-end font-medium">y (N)</th></tr></thead>
                <tbody>
                  {result.reactions.map((r) => <tr key={r.id} className="border-t border-zinc-100 dark:border-white/[0.06]"><td className="py-1">{letterOf(r.id)}: {SUPPORT_NAMES[model.supports.find((s) => s.id === r.id)?.kind ?? 'fixed']}</td><td className="py-1 text-end font-mono">{force(r.fx)}</td><td className="py-1 text-end font-mono">{force(r.fy)}</td></tr>)}
                  <tr className="border-t border-zinc-200 text-zinc-500 dark:border-white/10 dark:text-zinc-400"><td className="py-1">Loads, in all</td><td className="py-1 text-end font-mono">{force(result.applied.fx)}</td><td className="py-1 text-end font-mono">{force(result.applied.fy)}</td></tr>
                </tbody>
              </table>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">The supports push back exactly as hard as the loads push (a check that the answer balances).</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" className={small} onClick={() => void png()}><ImageIcon className="h-3.5 w-3.5" aria-hidden />Picture (PNG)</button>
              <button type="button" className={small} onClick={csv}><Download className="h-3.5 w-3.5" aria-hidden />Results (CSV)</button>
            </div>
          </>
        )}
        <button type="button" className={small} onClick={() => { if (confirm('Start this study again from the usual supports and loads?')) { setModel(() => startModel(model.template)); setSel({ k: 'solution' }); } }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Start again</button>
      </div>
    );
  }

  const picking = sel.k === 'support' || sel.k === 'load';
  const chosenEdges = picking ? ((sel.k === 'support' ? model.supports : model.loads).find((x) => x.id === sel.id)?.edges ?? []) : [];
  const fieldInfo = FIELDS.find((f) => f.id === field)!;
  const graphic = (
    <section className="panel flex min-h-[22rem] flex-1 flex-col overflow-hidden p-0" aria-label="Graphics">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Show
          <select value={field} onChange={(e) => setField(e.target.value as Field)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] text-zinc-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-white">
            {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Bent shape
          <select value={deform} onChange={(e) => setDeform(e.target.value as typeof deform)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] text-zinc-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-white">
            <option value="auto">Made visible</option><option value="true">True size</option><option value="none">Not bent</option>
          </select>
        </label>
        <button type="button" className={small} aria-pressed={showMesh} onClick={() => setShowMesh((v) => !v)}><Grid3x3 className="h-3.5 w-3.5" aria-hidden />Mesh</button>
        <button type="button" className={small} disabled={!result || deform === 'none'} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? 'Stop' : 'Animate'}</button>
        {busy && <span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">solving…</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <SimCanvas ref={view} part={part} edges={edges} mesh={mesh} result={problem ? null : result} field={field} deform={deform} showMesh={showMesh || sel.k === 'mesh'} playing={playing && !still}
          supports={model.supports} loads={model.loads} chosen={chosenEdges} picking={picking} onPick={toggleEdge} dark={dark}
          label={result ? `${tpl.name}: ${fieldInfo.name} from ${+Math.min(...result[field]).toPrecision(3)} to ${+Math.max(...result[field]).toPrecision(3)} ${fieldInfo.unit}` : `${tpl.name}: not solved yet`} />
      </div>
      {picking && <p className="border-t border-zinc-200/80 px-3 py-1.5 text-xs text-violet-800 dark:border-white/10 dark:text-violet-200">Press an edge in the picture to add it to {letterOf(sel.id)} or take it away.</p>}
    </section>
  );
  const side = (
    <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden p-0" aria-label="Study">
      <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-zinc-200/80 p-2 dark:border-white/10" data-no-motion>{outline}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-live="polite" data-no-motion>{details}</div>
      {sel.k !== 'solution' && <div className="border-t border-zinc-200/80 p-2 dark:border-white/10"><button type="button" className={cn(small, 'w-full justify-center')} onClick={() => setSel({ k: 'solution' })}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Back to the results</button></div>}
    </aside>
  );
  // Computers only (M405): the study on the left, the graphics window filling the rest.
  return <div className="flex h-[calc(100dvh-10.5rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">{side}{graphic}</div>;
}
