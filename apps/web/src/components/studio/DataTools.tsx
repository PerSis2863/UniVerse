'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { m as motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Download, Minus, Plus, Printer, RotateCcw, Trash2, Upload } from 'lucide-react';
import { compile, histogram, invoice, numbers, stats, type Line } from '@/lib/big-tools';
import { parseTable, tableAs } from '@/lib/quick-tools';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Histo, Ring } from '@/components/instruments/parts';
import { Btn, Field, area, copy, save } from './QuickTools';
import { BRANCH } from './PlanTools';
import { printOnly, today, uid, useKept } from './kept';

// Collaborate → Create → Maths and data (M72): a graph plotter, statistics, a data explorer for CSV
// files, a budget planner, an invoice maker and a world clock. All on this device.

export type DataId = 'graph' | 'stats' | 'explore' | 'budget' | 'invoice' | 'zones';

export function DataTool({ id }: { id: DataId }) {
  const T = { graph: Graph, stats: Stats, explore: Explore, budget: Budget, invoice: Invoice, zones: Zones }[id];
  return <T />;
}

const nf = (n: number, d = 4) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
const Stat = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{v}</dd></div>
);

/** Graph plotter: up to six functions of x; drag to move, scroll or pinch buttons to zoom. */
function Graph() {
  const [fns, setFns] = useKept('uv-graph', ['x^2 - 2', 'sin(x)', '']);
  const [view, setView] = useState({ cx: 0, cy: 0, scale: 40 });
  const [hover, setHover] = useState<{ x: number; ys: (number | null)[] } | null>(null);
  const ref = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const compiled = useMemo(() => fns.map((f) => { if (!f.trim()) return null; try { return { f: compile(f) }; } catch (e) { return { err: (e as Error).message }; } }), [fns]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr);
    const { cx, cy, scale } = view, X = (x: number) => W / 2 + (x - cx) * scale, Y = (y: number) => H / 2 - (y - cy) * scale;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => s * scale >= 40) ?? 1000;
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#5b6077'; g.lineWidth = 1;
    const x0 = Math.floor((cx - W / 2 / scale) / step) * step, y0 = Math.floor((cy - H / 2 / scale) / step) * step;
    for (let x = x0; X(x) < W; x += step) { g.strokeStyle = Math.abs(x) < 1e-9 ? '#141320' : '#e6e8ef'; g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); if (Math.abs(x) > 1e-9) g.fillText(nf(x, 2), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) + 13))); }
    for (let y = y0; Y(y) > 0; y += step) { g.strokeStyle = Math.abs(y) < 1e-9 ? '#141320' : '#e6e8ef'; g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); if (Math.abs(y) > 1e-9) g.fillText(nf(y, 2), Math.min(W - 30, Math.max(3, X(0) + 4)), Y(y) - 3); }
    compiled.forEach((cf, k) => {
      if (!cf?.f) return;
      g.strokeStyle = BRANCH[k % BRANCH.length]; g.lineWidth = 2.5; g.beginPath(); let pen = false, lastY = 0;
      for (let px = 0; px <= W; px += 1) {
        const y = cf.f(cx + (px - W / 2) / scale), py = Y(y);
        if (!Number.isFinite(y) || Math.abs(py - lastY) > H * 2) { pen = false; lastY = py; continue; }
        if (pen) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; lastY = py;
      }
      g.stroke();
    });
    if (hover) { g.strokeStyle = '#ec4899'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(hover.x), 0); g.lineTo(X(hover.x), H); g.stroke(); g.setLineDash([]); hover.ys.forEach((y, k) => { if (y == null || !Number.isFinite(y)) return; g.fillStyle = BRANCH[k % BRANCH.length]; g.beginPath(); g.arc(X(hover.x), Y(y), 5, 0, Math.PI * 2); g.fill(); }); }
  }, [compiled, view, hover]);
  const zoom = (f: number) => setView((v) => ({ ...v, scale: Math.max(2, Math.min(4000, v.scale * f)) }));
  // Scrolling over the graph zooms it instead of the page (needs a non-passive listener).
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const h = (e: WheelEvent) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; setView((v) => ({ ...v, scale: Math.max(2, Math.min(4000, v.scale * f)) })); };
    c.addEventListener('wheel', h, { passive: false });
    return () => c.removeEventListener('wheel', h);
  }, []);
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return view.cx + (e.clientX - r.left - r.width / 2) / view.scale; };
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {fns.map((f, k) => (
          <label key={k} className="block">
            <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200"><span className="w-3 h-3 rounded-full" style={{ background: BRANCH[k % BRANCH.length] }} aria-hidden />y =</span>
            <input className={cn('input mt-1 font-mono', compiled[k]?.err && 'ring-2 ring-rose-500')} value={f} onChange={(e) => setFns(fns.map((x, j) => (j === k ? e.target.value : x)))} placeholder="e.g. 2x + 1" aria-invalid={!!compiled[k]?.err} />
            {compiled[k]?.err && <span className="text-xs text-rose-700 dark:text-rose-300">{compiled[k]?.err}</span>}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {fns.length < 6 && <Btn onClick={() => setFns([...fns, ''])}><Plus className="w-3.5 h-3.5" aria-hidden />Another</Btn>}
        <Btn onClick={() => zoom(1.4)}><Plus className="w-3.5 h-3.5" aria-hidden />Zoom in</Btn>
        <Btn onClick={() => zoom(1 / 1.4)}><Minus className="w-3.5 h-3.5" aria-hidden />Zoom out</Btn>
        <Btn onClick={() => setView({ cx: 0, cy: 0, scale: 40 })}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Centre</Btn>
        <Btn onClick={() => ref.current?.toBlob((b) => b && save('graph.png', b, 'image/png'))}><Download className="w-3.5 h-3.5" aria-hidden />Save picture</Btn>
      </div>
      <canvas ref={ref} role="img" aria-label={`Graph of ${fns.filter(Boolean).join(', ')}`} className="w-full h-[420px] rounded-xl ring-1 ring-black/10 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; }}
        onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) / v.scale, cy: d.cy + (e.clientY - d.y) / v.scale })); else { const x = at(e); setHover({ x, ys: compiled.map((c) => (c?.f ? c.f(x) : null)) }); } }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; setHover(null); }}
        />
      <p className={cn('text-xs text-zinc-600 dark:text-zinc-300 min-h-4', hover && 'font-mono tabular-nums')} role="status">{hover ? `x = ${nf(hover.x, 3)}  ${hover.ys.map((y, k) => (y == null ? '' : `y${k + 1} = ${nf(y, 3)}`)).filter(Boolean).join('  ')}` : 'Drag to move, scroll to zoom. Write 2x, x^2, sqrt(x), sin, cos, tan, ln, log, abs, pi, e.'}</p>
    </div>
  );
}

/** Statistics: paste numbers, get the average, spread and a histogram. */
function Stats() {
  const [t, setT] = useKept('uv-stats', '12 15 11 18 14 15 21 9 15 13 17 16');
  const xs = useMemo(() => numbers(t), [t]);
  const s = useMemo(() => stats(xs), [xs]);
  const bins = useMemo(() => histogram(xs, Math.min(12, Math.max(4, Math.round(Math.sqrt(xs.length))))), [xs]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Field label="Numbers (any separators)"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      {s ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <Stat k="Count" v={s.n} /><Stat k="Average (mean)" v={nf(s.mean)} /><Stat k="Middle (median)" v={nf(s.median)} />
            <Stat k="Most common (mode)" v={s.mode.length ? s.mode.slice(0, 3).map((m) => nf(m)).join(', ') : 'none'} /><Stat k="Smallest" v={nf(s.min)} /><Stat k="Largest" v={nf(s.max)} />
            <Stat k="Range" v={nf(s.range)} /><Stat k="Spread (SD)" v={nf(s.sd)} /><Stat k="Sample SD" v={nf(s.sampleSd)} />
            <Stat k="Lower quartile" v={nf(s.q1)} /><Stat k="Upper quartile" v={nf(s.q3)} /><Stat k="Sum" v={nf(s.sum)} />
          </dl>
          <div className="rounded-xl ring-1 ring-zinc-200 dark:ring-white/10 p-3 text-indigo-700 dark:text-aqua-300"><Histo bins={bins} marker={Math.min(bins.length - 1, Math.floor(((s.mean - s.min) / (s.range || 1)) * bins.length))} label="How the numbers spread (the average marked)" /></div>
          <Btn onClick={() => void copy(`Count ${s.n}\nMean ${s.mean}\nMedian ${s.median}\nSD ${s.sd}\nMin ${s.min}\nMax ${s.max}\nQ1 ${s.q1}\nQ3 ${s.q3}`)}>Copy the results</Btn>
        </div>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">Type or paste some numbers.</p>}
    </div>
  );
}

/** Data explorer: open a CSV or paste a table; sort, filter, and total by a column. */
function Explore() {
  const [t, setT] = useState('Name,Class,Score,Hours\nAisha,7A,82,5\nBen,7B,74,3\nCarlos,7A,91,6\nDara,7C,65,2\nElif,7B,88,5\nFinn,7C,79,4');
  const [sort, setSort] = useState<{ col: number; up: boolean } | null>(null);
  const [q, setQ] = useState(''), [groupBy, setGroupBy] = useState(1), [sumCol, setSumCol] = useState(2);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => parseTable(t), [t]);
  const head = useMemo(() => rows[0] ?? [], [rows]), body = useMemo(() => rows.slice(1), [rows]);
  const nums = useMemo(() => head.map((_, c) => body.length > 0 && body.every((r) => r[c] === '' || r[c] === undefined || Number.isFinite(Number(r[c])))), [head, body]);
  const isNum = (c: number) => !!nums[c];
  const shown = useMemo(() => {
    const f = q ? body.filter((r) => r.some((v) => v.toLowerCase().includes(q.toLowerCase()))) : body;
    if (!sort) return f;
    const n = !!nums[sort.col];
    return [...f].sort((a, b) => (n ? Number(a[sort.col]) - Number(b[sort.col]) : (a[sort.col] ?? '').localeCompare(b[sort.col] ?? '')) * (sort.up ? 1 : -1));
  }, [body, q, sort, nums]);
  const groups = useMemo(() => {
    const m = new Map<string, { n: number; sum: number }>();
    for (const r of shown) { const k = r[groupBy] ?? ''; const g = m.get(k) ?? { n: 0, sum: 0 }; g.n++; g.sum += Number(r[sumCol]) || 0; m.set(k, g); }
    return [...m].sort((a, b) => b[1].sum - a[1].sum);
  }, [shown, groupBy, sumCol]);
  const top = Math.max(1, ...groups.map(([, g]) => Math.abs(g.sum)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" aria-label="Open a CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setT(await f.text()); setSort(null); } e.target.value = ''; }} />
        <Btn onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" aria-hidden />Open a CSV</Btn>
        <Btn onClick={() => save('data.csv', tableAs([head, ...shown], 'csv'), 'text/csv')}><Download className="w-3.5 h-3.5" aria-hidden />Save what&rsquo;s shown</Btn>
        <input className="input flex-1 min-w-[160px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…" aria-label="Filter rows" />
      </div>
      <details className="rounded-xl ring-1 ring-zinc-200 dark:ring-white/10 px-3 py-2"><summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Paste or edit the data</summary><textarea className={cn(area, 'mt-2')} value={t} onChange={(e) => { setT(e.target.value); setSort(null); }} aria-label="Data" /></details>
      <div className="overflow-auto max-h-[380px] rounded-xl ring-1 ring-zinc-200 dark:ring-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-100 dark:bg-indigo-900"><tr>{head.map((h, c) => (
            <th key={c} className="p-0" aria-sort={sort?.col === c ? (sort.up ? 'ascending' : 'descending') : undefined}>
              <button type="button" onClick={() => setSort(sort?.col === c ? { col: c, up: !sort.up } : { col: c, up: true })} className="w-full flex items-center gap-1 px-3 py-2 text-start font-bold text-zinc-900 dark:text-white whitespace-nowrap">{h}{sort?.col === c && (sort.up ? <ArrowUp className="w-3.5 h-3.5" aria-hidden /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden />)}</button>
            </th>
          ))}</tr></thead>
          <tbody>{shown.slice(0, 500).map((r, i) => <tr key={i} className="border-t border-zinc-200 dark:border-white/10">{head.map((_, c) => <td key={c} className={cn('px-3 py-1.5 text-zinc-800 dark:text-zinc-100', isNum(c) && 'font-mono tabular-nums text-end')} translate="no">{r[c]}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300" role="status">{shown.length} of {body.length} rows{shown.length > 500 ? ' (the first 500 shown)' : ''}</p>
      {head.length > 1 && (
        <section className="space-y-2" aria-labelledby="grp-h">
          <h3 id="grp-h" className="font-bold text-zinc-900 dark:text-white">Totals by group</h3>
          <div className="flex flex-wrap gap-2">
            <Field label="Group by"><select className="input" value={groupBy} onChange={(e) => setGroupBy(+e.target.value)}>{head.map((h, c) => <option key={c} value={c}>{h}</option>)}</select></Field>
            <Field label="Add up"><select className="input" value={sumCol} onChange={(e) => setSumCol(+e.target.value)}>{head.map((h, c) => isNum(c) && <option key={c} value={c}>{h}</option>)}</select></Field>
          </div>
          <ul className="space-y-1.5">{groups.slice(0, 20).map(([k, g]) => (
            <li key={k} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate font-semibold text-zinc-900 dark:text-white" translate="no">{k || '(empty)'}</span>
              <span className="h-3 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full rounded-full bg-indigo-500 dark:bg-aqua-300/80" initial={{ width: 0 }} animate={{ width: `${(Math.abs(g.sum) / top) * 100}%` }} transition={spring.smooth} /></span>
              <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{nf(g.sum, 2)} <span className="text-xs text-zinc-600 dark:text-zinc-300">({g.n}, avg {nf(g.sum / g.n, 1)})</span></span>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

interface Entry { id: string; what: string; cat: string; amount: number; out: boolean }
const CATS = ['Home', 'Food', 'Transport', 'Fun', 'Study', 'Bills', 'Savings', 'Other'];
/** Budget planner: money in and out by category, what's left, and where it goes. */
function Budget() {
  const [b, setB] = useKept('uv-budget', () => ({ cur: '₹', rows: [{ id: uid(), what: 'Pocket money', cat: 'Other', amount: 3000, out: false }, { id: uid(), what: 'Phone', cat: 'Bills', amount: 300, out: true }, { id: uid(), what: 'Lunches', cat: 'Food', amount: 1200, out: true }, { id: uid(), what: 'Bus pass', cat: 'Transport', amount: 500, out: true }] as Entry[] }));
  const [what, setWhat] = useState(''), [amt, setAmt] = useState(''), [cat, setCat] = useState('Food'), [out, setOut] = useState(true);
  const inc = b.rows.filter((r) => !r.out).reduce((a, r) => a + r.amount, 0), spend = b.rows.filter((r) => r.out).reduce((a, r) => a + r.amount, 0);
  const byCat = CATS.map((c) => ({ c, v: b.rows.filter((r) => r.out && r.cat === c).reduce((a, r) => a + r.amount, 0) })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v);
  const money = (n: number) => `${b.cur}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm items-center">
        <Stat k="Money in" v={money(inc)} /><Stat k="Spent" v={money(spend)} /><Stat k="Left" v={<span className={cn(inc - spend < 0 && 'text-rose-600 dark:text-rose-300')}>{money(inc - spend)}</span>} />
        <div className="justify-self-center text-indigo-700 dark:text-aqua-300"><Ring pct={inc ? Math.max(0, Math.min(100, ((inc - spend) / inc) * 100)) : 0} label="kept" size={96} /></div>
      </dl>
      <form onSubmit={(e) => { e.preventDefault(); const a = Number(amt); if (!what.trim() || !Number.isFinite(a) || a <= 0) return; setB({ ...b, rows: [{ id: uid(), what: what.trim(), cat, amount: a, out }, ...b.rows] }); setWhat(''); setAmt(''); }} className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto_auto] items-end">
        <Field label="What"><input className="input" value={what} onChange={(e) => setWhat(e.target.value)} /></Field>
        <Field label="Amount"><input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Kind"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="flex gap-1"><Btn on={out} onClick={() => setOut(true)}>Out</Btn><Btn on={!out} onClick={() => setOut(false)}>In</Btn></div>
        <button type="submit" className="btn-primary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-1">
          {b.rows.map((r) => (
            <motion.li key={r.id} layout="position" transition={spring.snappy} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
              <span className="flex-1 min-w-0 truncate text-sm text-zinc-900 dark:text-white" translate="no">{r.what} <span className="text-xs text-zinc-600 dark:text-zinc-300">· {r.cat}</span></span>
              <span className={cn('font-mono tabular-nums text-sm', r.out ? 'text-zinc-900 dark:text-white' : 'text-emerald-700 dark:text-emerald-300')}>{r.out ? '−' : '+'}{money(r.amount)}</span>
              <button type="button" onClick={() => setB({ ...b, rows: b.rows.filter((x) => x.id !== r.id) })} aria-label={`Remove ${r.what}`} className="btn-ghost btn-icon"><Trash2 className="w-4 h-4" aria-hidden /></button>
            </motion.li>
          ))}
        </ul>
        <section aria-labelledby="where-h" className="space-y-1.5">
          <h3 id="where-h" className="text-sm font-bold text-zinc-900 dark:text-white">Where it goes</h3>
          {byCat.map((x, k) => (
            <div key={x.c} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-sm">
              <span className="text-zinc-800 dark:text-zinc-100">{x.c}</span>
              <span className="h-3 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full rounded-full" style={{ background: BRANCH[k % BRANCH.length] }} initial={{ width: 0 }} animate={{ width: `${(x.v / (byCat[0]?.v || 1)) * 100}%` }} transition={spring.smooth} /></span>
              <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{spend ? Math.round((x.v / spend) * 100) : 0}%</span>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <Field label="Money sign"><select className="input w-24" value={b.cur} onChange={(e) => setB({ ...b, cur: e.target.value })}>{['₹', '$', '€', '£', '¥', '₦', 'R', 'KSh '].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Btn onClick={() => save('budget.csv', tableAs([['What', 'Kind', 'In/Out', 'Amount'], ...b.rows.map((r) => [r.what, r.cat, r.out ? 'Out' : 'In', String(r.amount)])], 'csv'), 'text/csv')}><Download className="w-3.5 h-3.5" aria-hidden />CSV</Btn>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Invoice maker: who, what, how much; tax and discount; print or save as PDF. */
function Invoice() {
  const [v, setV] = useKept('uv-invoice', () => ({ no: 'INV-001', date: today(), from: 'Your name or school\nAddress', to: 'Customer\nAddress', cur: '₹', tax: 18, discount: 0, notes: 'Thank you!', lines: [{ what: 'Tutoring session', qty: 4, price: 500 }, { what: 'Workbook', qty: 1, price: 250 }] as Line[] }));
  const tot = invoice(v.lines, v.discount, v.tax), money = (n: number) => `${v.cur}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const setLine = (k: number, p: Partial<Line>) => setV({ ...v, lines: v.lines.map((l, j) => (j === k ? { ...l, ...p } : l)) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => printOnly('invoice-sheet')}><Printer className="w-3.5 h-3.5" aria-hidden />Print or save as PDF</Btn>
        <Btn onClick={() => setV({ ...v, no: v.no.replace(/\d+$/, (d) => String(+d + 1).padStart(d.length, '0')), date: today() })}>Next invoice number</Btn>
      </div>
      <div id="invoice-sheet" className="rounded-2xl bg-white text-zinc-900 ring-1 ring-black/10 p-5 sm:p-8 space-y-5">
        <div className="flex flex-wrap justify-between gap-4">
          <div><p className="text-3xl font-bold tracking-tight">Invoice</p>
            <label className="mt-1 flex items-center gap-2 text-sm text-[#4b5068]">No.<input aria-label="Invoice number" className="bg-transparent font-mono outline-none focus:bg-zinc-100 rounded px-1" value={v.no} onChange={(e) => setV({ ...v, no: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm text-[#4b5068]">Date<input type="date" aria-label="Date" className="bg-transparent outline-none focus:bg-zinc-100 rounded px-1" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label></div>
          <textarea aria-label="From" rows={3} className="w-56 resize-none bg-transparent text-sm text-end outline-none focus:bg-zinc-100 rounded p-1" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />
        </div>
        <div><p className="text-xs font-bold uppercase text-[#4b5068]">Bill to</p><textarea aria-label="Bill to" rows={3} className="w-64 resize-none bg-transparent text-sm outline-none focus:bg-zinc-100 rounded p-1" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-zinc-900 text-start"><th className="py-2 text-start">Item</th><th className="py-2 w-16 text-end">Qty</th><th className="py-2 w-28 text-end">Price</th><th className="py-2 w-28 text-end">Amount</th><th className="w-8"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{v.lines.map((l, k) => (
            <tr key={k} className="border-b border-zinc-200">
              <td><input aria-label={`Item ${k + 1}`} className="w-full bg-transparent py-1.5 outline-none focus:bg-zinc-100 rounded px-1" value={l.what} onChange={(e) => setLine(k, { what: e.target.value })} /></td>
              <td><input aria-label="Quantity" inputMode="decimal" className="w-full bg-transparent py-1.5 text-end font-mono outline-none focus:bg-zinc-100 rounded px-1" value={l.qty} onChange={(e) => setLine(k, { qty: +e.target.value || 0 })} /></td>
              <td><input aria-label="Price" inputMode="decimal" className="w-full bg-transparent py-1.5 text-end font-mono outline-none focus:bg-zinc-100 rounded px-1" value={l.price} onChange={(e) => setLine(k, { price: +e.target.value || 0 })} /></td>
              <td className="text-end font-mono tabular-nums">{money(l.qty * l.price)}</td>
              <td><button type="button" onClick={() => setV({ ...v, lines: v.lines.filter((_, j) => j !== k) })} aria-label={`Remove ${l.what}`} className="p-1 text-[#4b5068] print:hidden"><Trash2 className="w-4 h-4" aria-hidden /></button></td>
            </tr>
          ))}</tbody>
        </table>
        <button type="button" onClick={() => setV({ ...v, lines: [...v.lines, { what: '', qty: 1, price: 0 }] })} className="text-sm font-semibold text-pink-700 print:hidden">+ Add a line</button>
        <dl className="ms-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono tabular-nums">{money(tot.sub)}</dd></div>
          <div className="flex justify-between items-center"><dt className="flex items-center gap-1">Discount<input aria-label="Discount %" className="w-12 bg-zinc-100 rounded px-1 text-end" value={v.discount} onChange={(e) => setV({ ...v, discount: +e.target.value || 0 })} />%</dt><dd className="font-mono tabular-nums">−{money(tot.discount)}</dd></div>
          <div className="flex justify-between items-center"><dt className="flex items-center gap-1">Tax<input aria-label="Tax %" className="w-12 bg-zinc-100 rounded px-1 text-end" value={v.tax} onChange={(e) => setV({ ...v, tax: +e.target.value || 0 })} />%</dt><dd className="font-mono tabular-nums">{money(tot.tax)}</dd></div>
          <div className="flex justify-between border-t-2 border-zinc-900 pt-1 text-base font-bold"><dt>Total</dt><dd className="font-mono tabular-nums">{money(tot.total)}</dd></div>
        </dl>
        <div className="flex flex-wrap justify-between gap-2 items-end">
          <textarea aria-label="Notes" rows={2} className="flex-1 resize-none bg-transparent text-sm text-[#4b5068] outline-none focus:bg-zinc-100 rounded p-1" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          <label className="text-xs text-[#4b5068] print:hidden">Money sign <select className="bg-zinc-100 rounded px-1" value={v.cur} onChange={(e) => setV({ ...v, cur: e.target.value })}>{['₹', '$', '€', '£', '¥', '₦', 'R', 'KSh '].map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
      </div>
    </div>
  );
}

const ZONES = ['Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Africa/Nairobi', 'Africa/Lagos', 'America/Sao_Paulo', 'America/Chicago', 'Asia/Shanghai', 'Pacific/Auckland', 'UTC'];
/** World clock and meeting planner: what time is it there, and which hours suit everyone. */
function Zones() {
  const here = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [zones, setZones] = useKept('uv-zones', () => [here, 'Europe/London', 'America/New_York']);
  const [now, setNow] = useState(() => Date.now()), [pick, setPick] = useState(ZONES[0]), [shift, setShift] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const all = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ZONES; } catch { return ZONES; } }, []);
  const at = now + shift * 3_600_000;
  const hourIn = (tz: string, t: number) => +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(t);
  const start = Math.floor(now / 3_600_000) * 3_600_000;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add a place"><select className="input max-w-[260px]" value={pick} onChange={(e) => setPick(e.target.value)}>{all.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></Field>
        <Btn onClick={() => !zones.includes(pick) && setZones([...zones, pick])}><Plus className="w-3.5 h-3.5" aria-hidden />Add</Btn>
        <Field label={shift ? `${shift > 0 ? '+' : ''}${shift} hours from now` : 'Now'}><input type="range" min={-12} max={36} value={shift} onChange={(e) => setShift(+e.target.value)} className="w-56 accent-pink-500" /></Field>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {zones.map((z) => { const h = hourIn(z, at), day = h >= 7 && h < 21; return (
          <li key={z} className={cn('relative rounded-2xl p-4 ring-1 transition-colors duration-300', day ? 'bg-amber-50 ring-amber-200 text-zinc-900' : 'bg-indigo-900 ring-indigo-700 text-white')}>
            <p className="text-sm font-semibold">{z.split('/').pop()?.replace(/_/g, ' ')}{z === here && <span className="ms-1 text-xs font-normal">(here)</span>}</p>
            <p className="text-3xl font-bold font-mono tabular-nums">{new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: z }).format(at)}</p>
            <p className="text-xs opacity-80">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: z, timeZoneName: 'short' }).format(at)}</p>
            {zones.length > 1 && <button type="button" onClick={() => setZones(zones.filter((x) => x !== z))} aria-label={`Remove ${z}`} className="absolute top-2 end-2 p-1.5 rounded-full opacity-70 hover:opacity-100"><Trash2 className="w-4 h-4" aria-hidden /></button>}
          </li>
        ); })}
      </ul>
      <section aria-labelledby="meet-h" className="space-y-2">
        <h3 id="meet-h" className="font-bold text-zinc-900 dark:text-white">Good hours to meet (next 24)</h3>
        <div tabIndex={0} role="region" aria-label="Hours in each place" className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-pink-500">
          <table className="text-[11px] font-mono tabular-nums border-separate border-spacing-0.5">
            <tbody>
              {zones.map((z) => (
                <tr key={z}><th className="pe-2 text-start font-sans font-semibold text-xs text-zinc-800 dark:text-zinc-100 whitespace-nowrap">{z.split('/').pop()?.replace(/_/g, ' ')}</th>
                  {Array.from({ length: 24 }, (_, k) => { const h = hourIn(z, start + k * 3_600_000), ok = h >= 9 && h < 18, fine = h >= 7 && h < 22; return <td key={k} className={cn('w-7 h-7 text-center rounded', ok ? 'bg-emerald-700 text-white' : fine ? 'bg-amber-200 text-zinc-900' : 'bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300')}>{h}</td>; })}
                </tr>
              ))}
              <tr><th className="pe-2 text-start font-sans text-xs text-zinc-600 dark:text-zinc-300">Everyone at work</th>{Array.from({ length: 24 }, (_, k) => { const all9 = zones.every((z) => { const h = hourIn(z, start + k * 3_600_000); return h >= 9 && h < 18; }); return <td key={k} className="text-center text-pink-600 dark:text-pink-300 font-bold">{all9 ? '★' : ''}</td>; })}</tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Green: 9 to 6, working hours; yellow: awake; grey: night. ★: a time that suits everyone.</p>
      </section>
    </div>
  );
}
