'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { RotateCcw, Upload } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/utils';
import { tfInline } from '@/lib/lab/lti-text';
import type { Gains, PidType } from '@/lib/lab/pidtune';
import { coeffs, type Diagram } from '@/lib/sim/blocks';
import { ui } from './bench-ui';
import { fmt, ScopePlot, ticks } from './scope-plot';
import type { FromTune, Report, ToTune } from './tune.worker';

// Hyperion Simulate → Blocks → Tune (M562, the owner's picture of MATLAB's PID Tuner): the plant is the diagram as one
// of its PID blocks sees it (linearised where the model is at a chosen moment) or a transfer function typed in. Two
// sliders move the design (response time: the crossover frequency; transient behaviour: the phase margin), the step
// plot and the tables put it beside the baseline (the block's own gains), and "Update block" writes it back.

type View = 'track' | 'disturb' | 'effort' | 'bode';
const TYPES: PidType[] = ['P', 'I', 'PI', 'PD', 'PID', 'PIDF'];
const pmOf = (aggr: number) => Math.round(85 - 55 * aggr);
const ZERO: Gains = { Kp: 1, Ki: 0, Kd: 0, Tf: 0 };
const blockGains = (p: Record<string, number | string>): Gains => {
  const Kd = Number(p.Kd) || 0, N = Number(p.N) || 100;
  return { Kp: Number(p.Kp) || 0, Ki: Number(p.Ki) || 0, Kd, Tf: Kd ? 1 / N : 0 };
};
const g = (v: number, unit = '') => (Number.isFinite(v) ? `${fmt(v)}${unit}` : v === Infinity ? 'Inf' : '—');

function BodePlot({ w, lines, colours }: { w: number[]; lines: { label: string; mag: number[]; phase: number[] }[]; colours: string[] }) {
  const PW = 900, PH = 170, L = 58, R = 14, T = 8, B = 28;
  const lx = (x: number) => L + ((Math.log10(x) - Math.log10(w[0])) / (Math.log10(w.at(-1)!) - Math.log10(w[0]))) * (PW - L - R);
  const decades = Array.from({ length: Math.floor(Math.log10(w.at(-1)!)) - Math.ceil(Math.log10(w[0])) + 1 }, (_, i) => 10 ** (Math.ceil(Math.log10(w[0])) + i));
  const panel = (key: 'mag' | 'phase', unit: string) => {
    const vals = lines.flatMap((l) => (key === 'mag' ? l.mag.map((m) => 20 * Math.log10(m)) : l.phase)).filter(Number.isFinite);
    const yt = ticks(Math.max(Math.min(...vals), key === 'mag' ? -120 : -720), Math.min(Math.max(...vals), key === 'mag' ? 120 : 360), 4), lo = yt[0], hi = yt.at(-1)!;
    const Y = (v: number) => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (PH - T - B);
    return (
      <svg viewBox={`0 0 ${PW} ${PH}`} className="h-auto w-full" role="img" aria-label={`Open loop ${key === 'mag' ? 'gain' : 'phase'} against frequency`}>
        {yt.map((v) => <g key={v}><line x1={L} x2={PW - R} y1={Y(v)} y2={Y(v)} className="stroke-zinc-200 dark:stroke-white/10" /><text x={L - 6} y={Y(v) + 4} fontSize={12} textAnchor="end" className="fill-zinc-600 font-mono dark:fill-zinc-300">{v}</text></g>)}
        {decades.map((x) => <g key={x}><line x1={lx(x)} x2={lx(x)} y1={T} y2={PH - B} className="stroke-zinc-200 dark:stroke-white/10" /><text x={lx(x)} y={PH - B + 15} fontSize={12} textAnchor="middle" className="fill-zinc-600 font-mono dark:fill-zinc-300">{fmt(x)}</text></g>)}
        {key === 'mag' && <line x1={L} x2={PW - R} y1={Y(0)} y2={Y(0)} className="stroke-zinc-400 dark:stroke-zinc-500" strokeDasharray="4 3" />}
        {key === 'phase' && <line x1={L} x2={PW - R} y1={Y(-180)} y2={Y(-180)} className="stroke-zinc-400 dark:stroke-zinc-500" strokeDasharray="4 3" />}
        <text x={12} y={(PH - B) / 2} fontSize={12} className="fill-zinc-500 dark:fill-zinc-400" transform={`rotate(-90 12 ${(PH - B) / 2})`} textAnchor="middle">{unit}</text>
        {lines.map((l, i) => <polyline key={l.label} fill="none" stroke={colours[i]} strokeWidth={1.8} points={w.map((x, k) => { const v = key === 'mag' ? 20 * Math.log10(l.mag[k]) : l.phase[k]; return Number.isFinite(v) ? `${lx(x).toFixed(1)},${Y(v).toFixed(1)}` : ''; }).filter(Boolean).join(' ')} />)}
      </svg>
    );
  };
  return <figure className="min-w-0 rounded-lg border border-zinc-200 p-2 dark:border-white/10"><figcaption className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">Open loop C·G (frequency in rad/s)</figcaption>{panel('mag', 'dB')}{panel('phase', 'degrees')}</figure>;
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: [string, string, string][] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-zinc-900 dark:text-white">{title}</p>
      <table className="w-full text-[13px]">
        <thead><tr className="text-start text-xs text-zinc-500 dark:text-zinc-400">{head.map((h, i) => <th key={i} scope="col" className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(([a, b, c]) => <tr key={a} className="border-t border-zinc-200/80 dark:border-white/10"><th scope="row" className="py-1 pe-2 text-start font-normal text-zinc-700 dark:text-zinc-200">{a}</th><td className="py-1 pe-2 font-mono tabular-nums">{b}</td><td className="py-1 font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{c}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function BlocksTune({ dg, names, colours, setParams }: { dg: Diagram; names: Map<string, string>; colours: string[]; setParams: (id: string, p: Record<string, number>) => void }) {
  const pids = dg.blocks.filter((b) => b.kind === 'pid');
  const [source, setSource] = useState<string>(() => pids[0]?.id ?? 'typed');
  const [num, setNum] = useState('1'), [den, setDen] = useState('1 3 3 1');
  const [type, setType] = useState<PidType>('PIDF');
  const [speed, setSpeed] = useState(0), [aggr, setAggr] = useState((85 - 60) / 55);
  const [at, setAt] = useState(0), [N, setN] = useState(10);
  const [typedBase, setTypedBase] = useState<Gains>(ZERO);
  const [view, setView] = useState<View>('track');
  const [res, setRes] = useState<FromTune | null>(null);
  const worker = useRef<Worker | null>(null), asked = useRef(0);
  const block = pids.find((b) => b.id === source) ?? null;
  const src = block ? block.id : 'typed';
  const baseline = block ? blockGains(block.p) : typedBase;
  const tf = useMemo(() => ({ n: coeffs(num), d: coeffs(den) }), [num, den]);

  useEffect(() => {
    const w = new Worker(new URL('./tune.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromTune>) => { if (e.data.id === asked.current) setRes(e.data); };
    worker.current = w;
    return () => w.terminate();
  }, []);
  const logic = JSON.stringify([src, block ? [dg.blocks.map((b) => [b.id, b.kind, b.p]), dg.wires, dg.dt] : tf, type, speed, aggr, at, N, baseline]);
  const ask = useEffectEvent(() => {
    asked.current += 1;
    const plant: ToTune['plant'] = block ? { diagram: dg, pid: block.id, at } : { tf };
    worker.current?.postMessage({ id: asked.current, plant, type, speed, pm: pmOf(aggr), N, baseline } satisfies ToTune);
  });
  useEffect(() => { const t = window.setTimeout(ask, 60); return () => clearTimeout(t); }, [logic]);

  const tuned = res && !res.error ? res.tuned! : null;
  const gm = (r: Report) => (r.Gm === Infinity ? 'Inf' : `${g(20 * Math.log10(r.Gm), ' dB')} @ ${g(r.Wcg)} rad/s`);
  const pmS = (r: Report) => (Number.isFinite(r.Wcp) ? `${g(r.Pm, '°')} @ ${g(r.Wcp)} rad/s` : 'Inf');
  const step = (r: Report, k: 'rise' | 'settle' | 'overshoot' | 'peak', unit = '') => (r.stable ? g(r[k], unit) : '—');
  const perf: [string, string, string][] = res && !res.error ? (() => {
    const t = res.tunedRep!, b = res.baseRep!;
    return [
      ['Rise time', step(t, 'rise', ' s'), step(b, 'rise', ' s')], ['Settling time', step(t, 'settle', ' s'), step(b, 'settle', ' s')],
      ['Overshoot', step(t, 'overshoot', ' %'), step(b, 'overshoot', ' %')], ['Peak', step(t, 'peak'), step(b, 'peak')],
      ['Gain margin', gm(t), gm(b)], ['Phase margin', pmS(t), pmS(b)], ['Closed loop', t.stable ? 'Stable' : 'Unstable', b.stable ? 'Stable' : 'Unstable'],
    ];
  })() : [];
  const params: [string, string, string][] = tuned ? [['P (Kp)', g(tuned.Kp), g(baseline.Kp)], ['I (Ki)', g(tuned.Ki), g(baseline.Ki)], ['D (Kd)', g(tuned.Kd), g(baseline.Kd)], ['Filter Tf', tuned.Tf ? `${g(tuned.Tf)} s` : '—', baseline.Tf ? `${g(baseline.Tf)} s` : '—']] : [];
  const update = () => { if (!tuned || !block) return; setParams(block.id, { Kp: +tuned.Kp.toPrecision(6), Ki: +tuned.Ki.toPrecision(6), Kd: +tuned.Kd.toPrecision(6), N: tuned.Tf ? +(1 / tuned.Tf).toPrecision(6) : 100 }); };
  const base = block ? `${names.get(block.id)}'s own gains` : 'Baseline';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-zinc-200 p-2 dark:border-white/10">
        <label className={ui.label}>Plant
          <select value={src} onChange={(e) => setSource(e.target.value)} className="input mt-1 block">
            {pids.map((b) => <option key={b.id} value={b.id}>As {names.get(b.id)} sees it</option>)}
            <option value="typed">A transfer function I type</option>
          </select>
        </label>
        {block ? (
          <label className={ui.label}>Linearised at <span className="font-normal text-zinc-500 dark:text-zinc-400">(s)</span>
            <input type="number" min={0} step="any" value={at} onChange={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= dg.stop) setAt(v); }} className="input mt-1 block w-24 font-mono" />
          </label>
        ) : (
          <>
            <label className={ui.label}>Numerator<input value={num} onChange={(e) => setNum(e.target.value)} className="input mt-1 block w-28 font-mono" /></label>
            <label className={ui.label}>Denominator<input value={den} onChange={(e) => setDen(e.target.value)} className="input mt-1 block w-32 font-mono" /></label>
          </>
        )}
        <label className={ui.label}>Type
          <select value={type} onChange={(e) => setType(e.target.value as PidType)} className="input mt-1 block">{TYPES.map((t) => <option key={t} value={t}>{t === 'PIDF' ? 'PID with filter' : t}</option>)}</select>
        </label>
        {type === 'PIDF' && <label className={ui.label}>Filter N<input type="number" min={2} max={1000} value={N} onChange={(e) => { const v = Number(e.target.value); if (v >= 2 && v <= 1000) setN(v); }} className="input mt-1 block w-20 font-mono" /></label>}
        <label className={cn(ui.label, 'min-w-48 flex-1')}>Response time <span className="font-normal text-zinc-500 dark:text-zinc-400">(crossover {res?.wc ? `${g(res.wc)} rad/s` : '—'})</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">Slower<input type="range" min={-1} max={1} step={0.01} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-violet-600" aria-valuetext={res?.wc ? `${g(res.wc)} radians a second` : undefined} />Faster</span>
        </label>
        <label className={cn(ui.label, 'min-w-48 flex-1')}>Transient behaviour <span className="font-normal text-zinc-500 dark:text-zinc-400">(phase margin {pmOf(aggr)}°)</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">Robust<input type="range" min={0} max={1} step={0.01} value={aggr} onChange={(e) => setAggr(Number(e.target.value))} className="w-full accent-violet-600" aria-valuetext={`${pmOf(aggr)} degrees of phase margin`} />Aggressive</span>
        </label>
        <div className="flex gap-1">
          <button type="button" className={ui.small} onClick={() => { setSpeed(0); setAggr((85 - 60) / 55); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset design</button>
          {block ? <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!tuned} onClick={update}><Upload className="h-3.5 w-3.5" aria-hidden />Update block</button>
            : <button type="button" className={ui.small} disabled={!tuned} onClick={() => tuned && setTypedBase(tuned)}>Keep as baseline</button>}
        </div>
      </div>
      {res?.error ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{res.error}</p> : res?.plant && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Plant: <span className="font-mono" translate="no">G(s) = {tfInline(res.plant.n.map((v) => +v.toPrecision(5)), res.plant.d.map((v) => +v.toPrecision(5)))}</span>{block ? ` (the diagram from ${names.get(block.id)}'s output back to its input, at ${g(at)} s)` : ''}</p>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-2">
          <Segmented<View> label="What to plot" value={view} onChange={setView} segments={[{ value: 'track', label: 'Reference tracking' }, { value: 'disturb', label: 'Disturbance' }, { value: 'effort', label: 'Controller effort' }, { value: 'bode', label: 'Bode' }]} />
          {res && !res.error && (view === 'bode'
            ? <BodePlot w={res.w!} lines={[{ label: 'Tuned', ...res.bode!.tuned }, { label: base, ...res.bode!.base }]} colours={colours} />
            : <ScopePlot title={{ track: 'Step: reference tracking', disturb: 'Step: a push at the plant’s input', effort: 'Step: the controller’s output' }[view]} t={res.t!} traces={[{ label: 'Tuned', v: res.curves![view].tuned }, { label: base, v: res.curves![view].base }]} colours={colours} />)}
        </div>
        <div className="space-y-3">
          <Table title="Controller parameters" head={['', 'Tuned', block ? 'Block' : 'Baseline']} rows={params} />
          <Table title="Performance and robustness" head={['', 'Tuned', block ? 'Block' : 'Baseline']} rows={perf} />
        </div>
      </div>
    </div>
  );
}
