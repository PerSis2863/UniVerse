'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Play, Plus, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { blockId, KINDS, type Diagram, type Req, type ReqKind } from '@/lib/sim/blocks';
import { safeNames } from '@/lib/sim/blockir';
import type { Verified } from '@/lib/sim/verify';
import { ui } from './bench-ui';
import type { FromVerify, ToVerify } from './verify.worker';

// Hyperion Simulate → Blocks → Verify (M566): requirements written against the diagram's signals, then one press runs
// them on the model and on tests made to reach every decision, measures coverage, checks the model, and offers a
// report that ties requirements to blocks, tests and the generated code's names.

const KIND_TEXT: Record<ReqKind, { name: string; a: string; b?: string; from: string }> = {
  range: { name: 'stays between', a: 'Lowest', b: 'Highest', from: 'From time (s)' },
  settle: { name: 'settles at', a: 'Value', b: 'Within ±', from: 'By time (s)' },
  reach: { name: 'reaches', a: 'Level', from: 'By time (s)' },
  overshoot: { name: 'overshoots at most', a: 'Percent', from: 'After time (s)' },
};
const say = (r: Req, sig: string) => {
  const f = (v: number) => String(+v.toPrecision(4));
  return { range: `${sig} stays between ${f(r.a)} and ${f(r.b)} from ${f(r.from)} s`, settle: `${sig} is within ${f(r.b)} of ${f(r.a)} from ${f(r.from)} s on`, reach: `${sig} reaches ${f(r.a)} by ${f(r.from)} s`, overshoot: `${sig} overshoots at most ${f(r.a)} % after ${f(r.from)} s` }[r.kind];
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function report(dg: Diagram, v: Verified, names: Map<string, string>, sigName: (s: string) => string) {
  const code = safeNames(dg), reqs = dg.reqs ?? [], cov = v.all.length ? Math.round((v.hit.length / v.all.length) * 100) : 100;
  const rows = (cells: string[][]) => cells.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Verification report</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#111}table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}td,th{border:1px solid #ccc;padding:.3rem .5rem;text-align:start;vertical-align:top}th{background:#f3f4f6}.pass{color:#047857}.fail{color:#b91c1c}code{font-family:ui-monospace,monospace}</style></head><body>
<h1>Verification report</h1>
<p>Made by Hyperion on ${esc(new Date().toISOString().slice(0, 10))}. The model: ${dg.blocks.length} blocks, ${dg.wires.length} wires, run for ${dg.stop} s in steps of ${dg.dt} s.</p>
<h2>Requirements</h2><table><tr><th>Requirement</th><th>Says</th><th>The model as it is</th><th>Under the generated tests</th></tr>${rows(v.results.map((r, i) => [esc(r.req.text || `R${i + 1}`), esc(say(r.req, sigName(r.req.signal))), `<span class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'Passes' : 'Fails'}</span>: ${esc(r.detail)}`, `${v.perTest.filter((p) => p.results[i]).length} of ${v.perTest.length} pass`]))}</table>
<h2>Traceability</h2><table><tr><th>Requirement</th><th>Block</th><th>Name in the generated code</th><th>Tests that check it</th></tr>${rows(reqs.map((r, i) => { const id = r.signal.split('#')[0]; return [esc(r.text || `R${i + 1}`), esc(names.get(id) ?? id), `<code>${esc(code.get(id) ?? '')}</code>`, esc(['The model as it is', ...v.perTest.map((p) => p.test)].join(', '))]; }))}</table>
<h2>Coverage</h2><p>${v.hit.length} of ${v.all.length} decision outcomes reached (${cov} %) by ${v.tests.length} tests, from ${v.runs} runs.</p>
${v.all.filter((o) => !v.hit.includes(o.id)).length ? `<p>Not reached:</p><ul>${v.all.filter((o) => !v.hit.includes(o.id)).map((o) => `<li>${esc(names.get(o.block) ?? '')}: ${esc(o.label)}</li>`).join('')}</ul>` : '<p>Every outcome was reached.</p>'}
<h2>Tests</h2><table><tr><th>Test</th><th>Inputs changed</th><th>Outcomes reached</th></tr>${rows(v.tests.map((t) => [esc(t.name), esc(t.changes.map((c) => `${names.get(c.block)}: ${c.key} = ${c.value}`).join('; ') || 'none'), String(t.hit.length)]))}</table>
<h2>Model checks</h2><ul>${v.checks.map((c) => `<li><strong>${c.level}</strong>: ${esc(c.text)}</li>`).join('')}</ul>
<h2>Signal ranges seen</h2><table><tr><th>Block</th><th>Code name</th><th>Lowest</th><th>Highest</th></tr>${rows(Object.entries(v.ranges).map(([id, [lo, hi]]) => [esc(names.get(id) ?? id), `<code>${esc(code.get(id) ?? '')}</code>`, String(+lo.toPrecision(5)), String(+hi.toPrecision(5))]))}</table>
<h2>What this is evidence for</h2><p>Requirements-based tests, decision coverage of the model, model and run-time checks and traceability are objectives of IEC 61508, ISO 26262 and DO-178C. This report is evidence toward them, not a certificate: certifying needs a qualified tool chain, the standard's full process and an assessor. Ranges are those the tests saw (dynamic), not a proof over every input.</p>
</body></html>`;
}

export function BlocksVerify({ dg, names, setReqs }: { dg: Diagram; names: Map<string, string>; setReqs: (r: Req[]) => void }) {
  const reqs = dg.reqs ?? [];
  const signals = dg.blocks.flatMap((b) => Array.from({ length: KINDS[b.kind].outs(b.p) }, (_, k) => ({ id: `${b.id}#${k}`, label: `${names.get(b.id)}${KINDS[b.kind].outs(b.p) > 1 ? ` output ${k + 1}` : ''}` })));
  const sigName = (s: string) => signals.find((x) => x.id === s)?.label ?? s;
  const [draft, setDraft] = useState<Omit<Req, 'id'>>({ text: '', signal: '', kind: 'settle', a: 1, b: 0.05, from: 5 });
  const [res, setRes] = useState<{ v?: Verified; error?: string; ms: number } | null>(null);
  const [busy, setBusy] = useState(false), [budget, setBudget] = useState(60);
  const worker = useRef<Worker | null>(null), asked = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./verify.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromVerify>) => { if (e.data.id !== asked.current) return; setBusy(false); setRes('ok' in e.data ? { v: e.data.ok, ms: e.data.ms } : { error: e.data.error, ms: e.data.ms }); };
    worker.current = w;
    return () => w.terminate();
  }, []);
  const go = () => { asked.current += 1; setBusy(true); worker.current?.postMessage({ id: asked.current, diagram: dg, budget } satisfies ToVerify); };
  const signal = draft.signal || signals[0]?.id || '';
  const add = () => { if (!signal) return; setReqs([...reqs, { ...draft, signal, id: blockId('r') }]); setDraft((d) => ({ ...d, text: '' })); };
  const v = res?.v, cov = v && v.all.length ? Math.round((v.hit.length / v.all.length) * 100) : null;
  const k = KIND_TEXT[draft.kind];
  const download = () => {
    if (!v) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report(dg, v, names, sigName)], { type: 'text/html' }));
    a.download = 'verification-report.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4 text-[13px]">
      <section aria-label="Requirements" className="space-y-2">
        <p className="text-xs font-semibold text-zinc-900 dark:text-white">Requirements</p>
        {reqs.length === 0 && <p className="text-xs text-zinc-600 dark:text-zinc-300">None yet. Write what a signal must do; Verify checks it on the model and on every test it makes.</p>}
        <ul className="space-y-1">
          {reqs.map((r, i) => {
            const got = v?.results.find((x) => x.req.id === r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                {got ? (got.pass ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="Passes" /> : <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-label="Fails" />) : <span className="w-4" aria-hidden />}
                <span className="font-medium">R{i + 1}</span><span>{r.text && `${r.text}: `}{say(r, sigName(r.signal))}</span>
                {got && <span className="text-xs text-zinc-600 dark:text-zinc-300">({got.detail}; {v!.perTest.filter((p) => p.results[i]).length} of {v!.perTest.length} generated tests pass)</span>}
                <button type="button" className={cn(ui.small, 'ms-auto text-red-700 dark:text-red-400')} onClick={() => setReqs(reqs.filter((x) => x.id !== r.id))} aria-label={`Delete requirement R${i + 1}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-2 dark:border-white/10">
          <label className={ui.label}>Signal<select value={signal} onChange={(e) => setDraft({ ...draft, signal: e.target.value })} className="input mt-1 block">{signals.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className={ui.label}>Must<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ReqKind })} className="input mt-1 block">{(Object.keys(KIND_TEXT) as ReqKind[]).map((x) => <option key={x} value={x}>{KIND_TEXT[x].name}</option>)}</select></label>
          {([['a', k.a], ...(k.b ? [['b', k.b]] : []), ['from', k.from]] as [keyof Req, string][]).map(([key, lab]) => (
            <label key={key} className={ui.label}>{lab}<input type="number" step="any" value={Number(draft[key])} onChange={(e) => { const x = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(x)) setDraft({ ...draft, [key]: x }); }} className="input mt-1 block w-24 font-mono" /></label>
          ))}
          <label className={cn(ui.label, 'min-w-40 flex-1')}>Its name or reference (optional)<input value={draft.text} maxLength={300} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="e.g. SYS-12 speed holds" className="input mt-1 block w-full" /></label>
          <button type="button" className={ui.small} disabled={!signal} onClick={add}><Plus className="h-3.5 w-3.5" aria-hidden />Add requirement</button>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={go}><Play className="h-3.5 w-3.5" aria-hidden />{busy ? 'Verifying…' : 'Run verification'}</button>
        <label className="text-xs text-zinc-600 dark:text-zinc-300">Up to <input type="number" min={1} max={300} value={budget} onChange={(e) => { const x = Math.round(Number(e.target.value)); if (x >= 1 && x <= 300) setBudget(x); }} className="input mx-1 inline-block w-16 font-mono" /> runs to make tests</label>
        {v && <button type="button" className={ui.small} onClick={download}><Download className="h-3.5 w-3.5" aria-hidden />Download the report</button>}
        {res && <span className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">{res.error ?? `${v!.runs} runs in ${(res.ms / 1000).toFixed(1)} s`}</span>}
      </div>
      {v && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <section aria-label="Coverage" className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">Coverage <span className="font-mono font-normal tabular-nums" data-coverage>{cov === null ? 'no decisions in this model' : `${v.hit.length} of ${v.all.length} outcomes (${cov} %)`}</span></p>
            <ul className="mt-1 max-h-60 space-y-0.5 overflow-y-auto">
              {v.all.map((o) => <li key={o.id} className={cn('flex justify-between gap-2', !v.hit.includes(o.id) && 'text-amber-800 dark:text-amber-300')}><span className="min-w-0 truncate">{names.get(o.block)}: {o.label}</span><span className="shrink-0">{v.hit.includes(o.id) ? '✓' : 'not reached'}</span></li>)}
            </ul>
          </section>
          <section aria-label="Generated tests" className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">Tests made ({v.tests.length})</p>
            <ol className="mt-1 max-h-60 space-y-1 overflow-y-auto">
              {v.tests.map((t) => <li key={t.name}><span className="font-medium">{t.name}</span>: <span className="text-zinc-600 dark:text-zinc-300">{t.changes.map((c) => `${names.get(c.block)} ${c.key} = ${c.value}`).join(', ') || 'no changes'}</span></li>)}
            </ol>
          </section>
          <section aria-label="Model checks" className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">Model checks</p>
            <ul className="mt-1 max-h-60 space-y-1 overflow-y-auto">
              {v.checks.map((c, i) => <li key={i} className={cn(c.level === 'error' ? 'text-red-700 dark:text-red-400' : c.level === 'warning' ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-200')}><span className="font-medium capitalize">{c.level}</span>: {c.text}</li>)}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
