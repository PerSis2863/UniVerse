'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FileUp, Image as ImageIcon } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { boxStl, parseStl, SIDES, type Side } from '@/lib/sim/stl';
import { MATERIALS, peak, type Load, type Study } from '@/lib/sim/structure';
import { verdict } from '@/lib/sim/model';
import { Sim3DView } from './Sim3DView';
import type { SimView } from './SimCanvas';
import { NumField, ui } from './bench-ui';
import type { FromStl, ToStl } from './stl.worker';

// Hyperion Simulate → 3D file (M552): stress in a part from an STL file (3D printing and CAD's export format, in mm).
// The part is filled with small cubes (shown, with their size), its six sides named after the box around it (the
// file's z is up), and each side can be held, pushed or left free. The file stays in this tab only (reopen it after a
// reload); the settings are kept on this device.

const KEEP = 'uv-sim-file';
type SideSet = { kind: 'free' | 'fixed' | 'force'; F: number; dir: 'down' | 'up' | 'left' | 'right' };
interface FileModel { material: string; sides: Record<Side, SideSet> }
const FREE: SideSet = { kind: 'free', F: 1000, dir: 'down' };
const START: FileModel = { material: 'aluminium', sides: { Bottom: FREE, Top: FREE, Left: { ...FREE, kind: 'fixed' }, Right: { ...FREE, kind: 'force' }, Front: FREE, Back: FREE } };
const ANGLE = { down: -90, up: 90, left: 180, right: 0 } as const;
const read = (): FileModel => {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Partial<FileModel> | null;
    if (!v?.sides) return START;
    return { material: MATERIALS.some((m) => m.id === v.material) ? v.material! : START.material, sides: Object.fromEntries(SIDES.map((s) => {
      const x = v.sides?.[s];
      return [s, { kind: x?.kind === 'fixed' || x?.kind === 'force' ? x.kind : 'free', F: typeof x?.F === 'number' && Number.isFinite(x.F) ? x.F : 1000, dir: x && ['down', 'up', 'left', 'right'].includes(x.dir) ? x.dir : 'down' }];
    })) as Record<Side, SideSet> };
  } catch { return START; }
};
const FIELDS = [['vm', 'Equivalent stress (von Mises)', 'MPa'], ['u', 'Total deformation', 'mm'], ['safety', 'Safety factor', '']] as const;

export function FileBench() {
  const dark = useDarkMode();
  const [model, setModelNow] = useState<FileModel>(read);
  const [file, setFile] = useState<{ name: string; tris: Float32Array; key: string }>(() => ({ name: 'A sample bar (100 × 20 × 20 mm)', tris: boxStl(100, 20, 20), key: 'sample' }));
  const [out, setOut] = useState<FromStl | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<(typeof FIELDS)[number][0]>('vm');
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null), seq = useRef(0), view = useRef<SimView>(null), keepTimer = useRef(0), picker = useRef<HTMLInputElement>(null);

  const setModel = (f: (m: FileModel) => FileModel) => setModelNow((m) => {
    const next = f(m);
    clearTimeout(keepTimer.current);
    keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 300);
    return next;
  });
  const material = MATERIALS.find((m) => m.id === model.material) ?? MATERIALS[0];
  const studyOf = (m: FileModel): Study => ({
    thickness: 1, material: MATERIALS.find((x) => x.id === m.material) ?? MATERIALS[0], gravity: false,
    supports: SIDES.filter((s) => m.sides[s].kind === 'fixed').map((s) => ({ id: s, kind: 'fixed', edges: [s] })),
    loads: SIDES.filter((s) => m.sides[s].kind === 'force').map((s): Load => ({ id: s, kind: 'force', edges: [s], F: m.sides[s].F, angle: ANGLE[m.sides[s].dir] })),
  });
  const send = useEffectEvent(() => {
    if (!worker.current) return;
    setBusy(true);
    worker.current.postMessage({ id: ++seq.current, tris: file.tris, key: file.key, study: studyOf(model) } satisfies ToStl);
  });
  useEffect(() => {
    const w = new Worker(new URL('./stl.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromStl>) => { if (e.data.id === seq.current) { setOut(e.data); setBusy(false); } };
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => { const t = window.setTimeout(() => send(), 150); return () => clearTimeout(t); }, [model, file]);

  const open = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 30_000_000) { setError('That file is over 30 MB: export it with fewer triangles.'); return; }
    try { const tris = parseStl(await f.arrayBuffer()); setFile({ name: f.name, tris, key: `${f.name}:${f.size}:${f.lastModified}` }); }
    catch (err) { setError(err instanceof Error ? err.message : 'That file couldn’t be read.'); }
  };
  const res = out?.result ?? null, solid = out?.solid ?? null;
  const maxVm = res ? peak(res.vm).value : 0, says = res ? verdict(maxVm, material.yieldMPa, material.name) : null;
  const info = FIELDS.find((f) => f[0] === field)!;
  const png = async () => { const b = await view.current?.png(); if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'part.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const { label, select, small } = ui;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[22rem_1fr]">
      <section className="panel space-y-3 p-3" aria-label="Study">
        <div className="space-y-1.5">
          <span className={label}>The part</span>
          <p className="truncate text-[13px] font-medium text-zinc-900 dark:text-white" translate="no">{file.name}</p>
          <input ref={picker} type="file" accept=".stl,model/stl,application/sla" className="sr-only" aria-label="Open an STL file" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn-primary w-full text-[13px]" onClick={() => picker.current?.click()}><FileUp className="me-1.5 inline h-4 w-4" aria-hidden />Open an STL file</button>
          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
          {out && !out.error && <p className="text-xs text-zinc-500 dark:text-zinc-400">{out.size.map((v) => +v.toPrecision(3)).join(' × ')} mm, filled with {solid?.tets.toLocaleString()} pieces from cubes of {+out.cube.toPrecision(2)} mm (fine details smaller than that are smoothed out).</p>}
        </div>
        <label className={label}>Material
          <select className={cn(select, 'mt-1 w-full')} value={model.material} onChange={(e) => setModel((m) => ({ ...m, material: e.target.value }))}>{MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        <fieldset className="space-y-2">
          <legend className={label}>Its sides <span className="font-normal text-zinc-500 dark:text-zinc-400">(the box around it; up is the file’s z)</span></legend>
          {SIDES.map((s) => {
            const v = model.sides[s], set = (p: Partial<SideSet>) => setModel((m) => ({ ...m, sides: { ...m.sides, [s]: { ...m.sides[s], ...p } } }));
            return (
              <div key={s} className="rounded-lg border border-zinc-200 p-2 dark:border-white/10">
                <label className="flex items-center justify-between gap-2 text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{s}
                  <select className={select} value={v.kind} onChange={(e) => set({ kind: e.target.value as SideSet['kind'] })}><option value="free">Free</option><option value="fixed">Held (fixed)</option><option value="force">Pushed</option></select>
                </label>
                {v.kind === 'force' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <NumField label="Force" unit="N" value={v.F} onChange={(F) => set({ F })} />
                    <label className={label}>Direction<select className={cn(select, 'mt-1 w-full')} value={v.dir} onChange={(e) => set({ dir: e.target.value as SideSet['dir'] })}><option value="down">Down</option><option value="up">Up</option><option value="left">Left</option><option value="right">Right</option></select></label>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
        {busy && res && <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">Solving again… (a big part takes a few seconds)</p>}
        {out?.error ? <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{out.error}</p>
          : !res ? <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{busy ? 'Solving…' : 'Hold at least one side to solve it.'}</p>
            : says && <p data-file-verdict className={cn('rounded-lg p-2.5 text-xs leading-relaxed', says.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200')}>{says.text}</p>}
        {res && <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">{[['Largest movement', `${+peak(res.u).value.toPrecision(3)} mm`], ['Highest stress', `${+maxVm.toPrecision(4)} MPa`], ['Unknowns solved', (solid?.dofs ?? 0).toLocaleString()], ['Solved in', `${Math.round(out!.ms)} ms`]].map(([k, v]) => <div key={k}><dt className="text-zinc-500 dark:text-zinc-400">{k}</dt><dd className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>)}</dl>}
      </section>
      <section className="panel flex min-h-[26rem] flex-col overflow-hidden p-0" aria-label="Graphics">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">Show
            <select value={field} onChange={(e) => setField(e.target.value as typeof field)} className={select}>{FIELDS.map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}</select>
          </label>
          <button type="button" className={small} onClick={() => void png()}><ImageIcon className="h-3.5 w-3.5" aria-hidden />Picture</button>
        </div>
        <div className="relative flex-1">
          {solid ? <Sim3DView ref={view} solid={solid} dark={dark} showMesh={false} playing={false} deform="auto" label={`The part: ${info[1]}`}
            shown={res ? { ux: res.ux, uy: res.uy, uz: res.uz, values: res[info[0]], name: info[1], unit: info[2], reverse: info[0] === 'safety' } : null} />
            : <div className="grid h-full place-items-center text-[13px] text-zinc-500 dark:text-zinc-400">{busy ? 'Filling the part…' : 'Open an STL file.'}</div>}
        </div>
      </section>
    </div>
  );
}
