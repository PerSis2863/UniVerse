'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleHelp, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chartOf, type Diagram, type ProveRules } from '@/lib/sim/blocks';
import type { Iv, Proof } from '@/lib/sim/prove';
import { ui } from './bench-ui';
import type { FromProve, ToProve } from './prove.worker';
import { watchWorker } from '@/lib/error-monitor';
import { toast } from 'sonner';

// Hyperion Simulate → Blocks → Verify → Prove (M573): a Chart block's logic proved for every input value, forever
// (abstract interpretation), with a counterexample to replay when a property fails. M574: what's typed is kept with the
// diagram (`Diagram.prove`, per chart), and the inputs' ranges can come from the rest of the diagram (`prove-diagram.ts`).

const NONE: ProveRules = { props: [], ranges: {} };
const fmt = (v: number) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : String(+v.toPrecision(5)));

const ICON = { proved: CheckCircle2, falsified: XCircle, undecided: CircleHelp } as const;
const WORD = { proved: 'Proved', falsified: 'Fails', undecided: 'Not decided' } as const;
const TONE = { proved: 'text-emerald-700 dark:text-emerald-400', falsified: 'text-red-700 dark:text-red-400', undecided: 'text-amber-800 dark:text-amber-300' } as const;

function Trace({ p }: { p: Proof }) {
  if (!p.trace?.length) return null;
  const ins = Object.keys(p.trace[0].inputs);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-300">{p.verdict === 'falsified' ? 'The counterexample' : 'An example'}: {p.trace.length} step{p.trace.length === 1 ? '' : 's'}</summary>
      <div className="mt-1 max-h-48 overflow-auto">
        <table className="text-xs">
          <thead><tr className="text-zinc-500 dark:text-zinc-400">{['Time (s)', ...ins, 'State after'].map((h) => <th key={h} scope="col" className="pe-3 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{p.trace.map((s, i) => <tr key={i}><td className="pe-3 font-mono tabular-nums">{s.t}</td>{ins.map((x) => <td key={x} className="pe-3 font-mono tabular-nums">{+s.inputs[x].toPrecision(6)}</td>)}<td className="pe-3">{s.state}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export function BlocksProve({ dg, names, setRules }: { dg: Diagram; names: Map<string, string>; setRules: (chart: string, r: ProveRules) => void }) {
  const charts = dg.blocks.filter((b) => b.kind === 'chart');
  const [pick, setPick] = useState<string | null>(null);
  const block = charts.find((b) => b.id === pick) ?? charts[0] ?? null;
  const ch = (() => { if (!block) return null; try { return chartOf(block); } catch { return null; } })();
  const rules = (block && dg.prove?.[block.id]) || NONE, { ranges, props } = rules, fromDiagram = !!rules.fromDiagram;
  const save = (r: Partial<ProveRules>) => { if (block) setRules(block.id, { ...rules, ...r }); };
  const setRanges = (f: (r: Record<string, [string, string]>) => Record<string, [string, string]>) => save({ ranges: f(ranges) });
  const setProps = (p: string[]) => save({ props: p });
  const [draft, setDraft] = useState('');
  const [res, setRes] = useState<FromProve | null>(null), [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null), asked = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./prove.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromProve>) => { if (e.data.id !== asked.current) return; setBusy(false); setRes(e.data); };
    watchWorker(w, 'prover', (msg) => { setBusy(false); toast.error(msg); });
    worker.current = w;
    return () => w.terminate();
  }, []);
  if (!charts.length) return null;
  const go = () => {
    if (!block || !ch) return;
    const iv: Record<string, Iv> = {};
    for (const x of ch.inputs) { const [a, b] = ranges[x] ?? ['', '']; iv[x] = [a.trim() === '' ? -Infinity : Number(a), b.trim() === '' ? Infinity : Number(b)]; }
    asked.current += 1; setBusy(true);
    worker.current?.postMessage({ id: asked.current, dg, chart: block.id, ranges: iv, props, fromDiagram } satisfies ToProve);
  };
  const ok = res && 'ok' in res ? res.ok : null;
  const groups: [string, Proof[]][] = ok ? [['Your properties', ok.proofs.filter((p) => p.kind === 'always')], ['States', ok.proofs.filter((p) => p.kind === 'reach')], ['Dead transitions', ok.proofs.filter((p) => p.kind === 'fire')], ['Output bounds', ok.proofs.filter((p) => p.kind === 'range')]] : [];

  return (
    <section aria-label="Prove for every input" className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10">
      <p className="text-xs font-semibold text-zinc-900 dark:text-white">Prove for every input</p>
      <p className="max-w-[75ch] text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Tests try some inputs; a proof covers every value the chart’s inputs can take, at every step, for ever. Hyperion works out a range for each of the chart’s values in each state that holds on every possible run: what is true over those ranges is proved. When they can’t decide, it searches for real input steps that break the property (a counterexample to replay). Properties are conditions that must always hold, over the chart’s outputs, its own values, its inputs and <span className="font-mono">in(State)</span>, for example <span className="font-mono">!(pump == 1 &amp;&amp; alarm == 1)</span>.</p>
      <div className="flex flex-wrap items-end gap-3">
        {charts.length > 1 && <label className={ui.label}>Chart<select value={block!.id} onChange={(e) => { setPick(e.target.value); setRes(null); }} className="input mt-1 block">{charts.map((b) => <option key={b.id} value={b.id}>{names.get(b.id)}</option>)}</select></label>}
        {!!ch?.inputs.length && <label className="flex items-center gap-2 self-center text-xs text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={fromDiagram} onChange={(e) => { save({ fromDiagram: e.target.checked }); setRes(null); }} />Inputs from the rest of the diagram</label>}
        {!fromDiagram && ch?.inputs.map((x) => (
          <fieldset key={x} className="flex items-end gap-1">
            <legend className={ui.label}>{x} from … to (blank: any)</legend>
            {[0, 1].map((k) => <input key={k} aria-label={`${x} ${k ? 'highest' : 'lowest'}`} inputMode="decimal" value={ranges[x]?.[k] ?? ''} onChange={(e) => setRanges((r) => { const cur = r[x] ?? ['', '']; const next: [string, string] = k ? [cur[0], e.target.value] : [e.target.value, cur[1]]; return { ...r, [x]: next }; })} className="input w-20 font-mono" placeholder={k ? '∞' : '−∞'} />)}
          </fieldset>
        ))}
      </div>
      {fromDiagram && <p className="max-w-[75ch] text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Hyperion works out every value the diagram can feed this chart: sources’ own ranges, through saturations, delays and other charts; the gains, sums, integrators, transfer functions and PIDs as one system (a stable loop is bounded forever); and this chart together with what it drives and reads back (a tank’s level held by the pump it switches). The proof then covers the chart inside this diagram, not any input.</p>}
      {!ch && <p className="text-xs text-red-700 dark:text-red-400">This chart has a mistake in its text: fix it first.</p>}
      <ul className="space-y-1">
        {props.map((p, i) => <li key={i} className="flex items-center gap-2"><span className="font-mono">always {p}</span><button type="button" className={ui.small} onClick={() => setProps(props.filter((_, j) => j !== i))} aria-label={`Remove always ${p}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button></li>)}
      </ul>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setProps([...props, draft.trim()]); setDraft(''); } }}>
        <label className={cn(ui.label, 'min-w-60 flex-1')}>A property that must always hold<input value={draft} onChange={(e) => setDraft(e.target.value)} className="input mt-1 block w-full font-mono" placeholder="!(pump == 1 && alarm == 1)" translate="no" /></label>
        <button type="submit" className={ui.small}><Plus className="h-3.5 w-3.5" aria-hidden />Add</button>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !ch} onClick={go}><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{busy ? 'Proving…' : 'Prove'}</button>
      </form>
      {res && 'error' in res && <p className="text-xs text-red-700 dark:text-red-400">{res.error}</p>}
      {ok && (
        <div className="space-y-3" data-proofs>
          {fromDiagram && 'ranges' in res! && <p className="text-xs text-zinc-700 dark:text-zinc-200">The diagram feeds it: {Object.entries(res.ranges).map(([x, [lo, hi]]) => <span key={x} className="me-3 font-mono" translate="no">{x} ∈ [{fmt(lo)}, {fmt(hi)}]</span>)}{res.widened ? ' (a loop kept growing, so some ranges were opened to ∞: still sound)' : ''}. {res.forever ? 'These hold after the run too, so the proof does.' : `These hold during the run (0 … ${dg.stop} s), so the proof covers the run.`}</p>}
          <p className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">{ok.states} reachable state{ok.states === 1 ? '' : 's'} analysed{ok.widened ? ' (some values grow without a bound found: their ranges were opened to ∞, which keeps the proof sound)' : ''}; {ok.tries} runs searched for examples, in {(res!.ms / 1000).toFixed(1)} s.</p>
          {groups.filter(([, list]) => list.length).map(([title, list]) => (
            <div key={title}>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white">{title}</p>
              <ul className="mt-1 space-y-1">
                {list.map((p, i) => { const I = ICON[p.verdict]; return <li key={i}><span className={cn('inline-flex items-start gap-1.5', TONE[p.verdict])}><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><span className="font-medium">{WORD[p.verdict]}</span>: <span className="text-zinc-800 dark:text-zinc-100">{p.text}</span></span></span><Trace p={p} /></li>; })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
