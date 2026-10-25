'use client';

import { useMemo } from 'react';
import type * as Y from 'yjs';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Trash2 } from 'lucide-react';
import type { Calc } from '@/lib/sheet/calc';
import { CHART_TYPES, type ChartJSON, type ChartType } from '@/lib/sheet/book';
import { display } from '@/lib/sheet/format';
import { cellsOf, getMeta, setMeta } from '@/lib/sheet/model';
import { areaText, keyOf, parseArea } from '@/lib/sheet/refs';
import type { V } from '@/lib/sheet/values';

// Charts of a sheet's cells (Office suite), drawn with recharts (loaded only for sheets with
// charts). Like Excel: series go along the shorter side of the data; a first row of text names the
// series (or the points, when series run along rows) and a first column of text names the points.

const COLORS = ['#2a2927', '#0891b2', '#16a34a', '#ea580c', '#db2777', '#2a2927', '#ca8a04', '#475569'];

export interface ChartData { labels: string[]; series: { name: string; values: (number | null)[] }[] }

/** The series and labels of a chart, from its cells' values. */
export function chartData(m: V[][], shown: (r: number, c: number) => string): ChartData {
  const rows = m.length, cols = m[0]?.length ?? 0;
  if (!rows || !cols) return { labels: [], series: [] };
  const isText = (v: V) => typeof v === 'string' || v === null;
  const head = rows > 1 && m[0].slice(1).some((v) => typeof v === 'string') && m[0].every(isText);
  const side = cols > 1 && m.slice(head ? 1 : 0).every((row) => isText(row[0])) && m.slice(head ? 1 : 0).some((row) => typeof row[0] === 'string');
  const r0 = head ? 1 : 0, c0 = side ? 1 : 0;
  const num = (v: V) => (typeof v === 'number' ? v : null);
  // Fewer rows than columns of numbers: each row is a series.
  if (rows - r0 < cols - c0) {
    const labels = Array.from({ length: cols - c0 }, (_, j) => (head ? shown(0, c0 + j) : String(j + 1)));
    const series = Array.from({ length: rows - r0 }, (_, i) => ({ name: side ? shown(r0 + i, 0) : `Series ${i + 1}`, values: m[r0 + i].slice(c0).map(num) }));
    return { labels, series };
  }
  const labels = Array.from({ length: rows - r0 }, (_, i) => (side ? shown(r0 + i, 0) : String(i + 1)));
  const series = Array.from({ length: cols - c0 }, (_, j) => ({ name: head ? shown(0, c0 + j) : `Series ${j + 1}`, values: m.slice(r0).map((row) => num(row[c0 + j])) }));
  return { labels, series };
}

export function SheetCharts({ doc, sheet, calc, version, canEdit }: { doc: Y.Doc; sheet: string; calc: Calc; version: number; canEdit: boolean }) {
  const charts = useMemo(() => { void version; return getMeta(doc, sheet, 'charts') ?? []; }, [doc, sheet, version]);
  const save = (next: ChartJSON[]) => setMeta(doc, sheet, 'charts', next);
  return (
    <div className="flex gap-3 overflow-x-auto p-3 pt-0">
      {charts.map((ch) => <ChartCard key={ch.id} ch={ch} doc={doc} sheet={sheet} calc={calc} version={version} canEdit={canEdit}
        onChange={(p) => save(charts.map((x) => (x.id === ch.id ? { ...x, ...p } : x)))} onRemove={() => save(charts.filter((x) => x.id !== ch.id))} />)}
    </div>
  );
}

function ChartCard({ ch, doc, sheet, calc, version, canEdit, onChange, onRemove }: { ch: ChartJSON; doc: Y.Doc; sheet: string; calc: Calc; version: number; canEdit: boolean; onChange: (p: Partial<ChartJSON>) => void; onRemove: () => void }) {
  const data = useMemo(() => {
    void version;
    const a = parseArea(ch.area);
    if (!a) return null;
    const m: V[][] = [];
    for (let r = a.r1; r <= Math.min(a.r2, a.r1 + 500); r++) { const row: V[] = []; for (let c = a.c1; c <= Math.min(a.c2, a.c1 + 30); c++) row.push(calc.value(sheet, r, c)); m.push(row); }
    const cells = cellsOf(doc, sheet);
    return chartData(m, (r, c) => display(m[r][c], cells?.get(keyOf(a.r1 + r, a.c1 + c))?.s));
  }, [ch.area, calc, doc, sheet, version]);
  const rows = data ? data.labels.map((label, i) => ({ label, ...Object.fromEntries(data.series.map((s, k) => [`s${k}`, s.values[i]])) })) : [];
  const tick = { fill: 'currentColor', fontSize: 11 };
  const chart = (type: ChartType) => {
    if (!data || !data.series.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400 p-4">No numbers in {ch.area}.</p>;
    const axes = (<><CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} /><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} width={44} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></>);
    if (type === 'pie') {
      const s = data.series[0];
      return <PieChart><Pie data={data.labels.map((l, i) => ({ name: l, value: Math.max(0, s.values[i] ?? 0) }))} dataKey="value" nameKey="name" outerRadius="75%" label={{ fontSize: 11 }}>{data.labels.map((l, i) => <Cell key={l + i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>;
    }
    if (type === 'scatter') return <ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} /><XAxis dataKey="x" type="number" tick={tick} name={data.series[0]?.name} /><YAxis dataKey="y" type="number" tick={tick} width={44} name={data.series[1]?.name ?? 'y'} /><Tooltip /><Scatter data={data.series[0].values.map((x, i) => ({ x, y: data.series[1]?.values[i] ?? null }))} fill={COLORS[0]} /></ScatterChart>;
    if (type === 'line') return <LineChart data={rows}>{axes}{data.series.map((s, k) => <Line key={k} dataKey={`s${k}`} name={s.name} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />)}</LineChart>;
    if (type === 'area') return <AreaChart data={rows}>{axes}{data.series.map((s, k) => <Area key={k} dataKey={`s${k}`} name={s.name} stroke={COLORS[k % COLORS.length]} fill={COLORS[k % COLORS.length]} fillOpacity={0.25} isAnimationActive={false} />)}</AreaChart>;
    return <BarChart data={rows} layout={type === 'bar' ? 'vertical' : 'horizontal'}>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
      {type === 'bar' ? <><XAxis type="number" tick={tick} /><YAxis type="category" dataKey="label" tick={tick} width={80} /></> : <><XAxis dataKey="label" tick={tick} /><YAxis tick={tick} width={44} /></>}
      <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
      {data.series.map((s, k) => <Bar key={k} dataKey={`s${k}`} name={s.name} fill={COLORS[k % COLORS.length]} isAnimationActive={false} />)}
    </BarChart>;
  };
  return (
    <figure className="shrink-0 w-[min(28rem,85vw)] rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-white/10 p-3 text-zinc-700 dark:text-zinc-300">
      <figcaption className="flex items-center gap-2 mb-2">
        <input aria-label="Chart title" value={ch.title} readOnly={!canEdit} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} placeholder="Chart title" className="flex-1 min-w-0 bg-transparent font-semibold text-sm text-zinc-900 dark:text-white outline-none" />
        <select aria-label="Kind of chart" disabled={!canEdit} value={ch.type} onChange={(e) => onChange({ type: e.target.value as ChartType })} className="text-xs rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-1 py-1">{CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <input aria-label="Chart cells" defaultValue={ch.area} readOnly={!canEdit} onBlur={(e) => { const a = parseArea(e.target.value.toUpperCase().replace(/\$/g, '')); if (a) onChange({ area: areaText(a) }); else e.target.value = ch.area; }} className="w-24 text-xs font-mono rounded-lg border border-zinc-200 dark:border-white/10 bg-transparent px-1.5 py-1" />
        {canEdit && <button type="button" aria-label="Remove the chart" onClick={onRemove} className="p-1.5 text-zinc-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
      </figcaption>
      <div className="h-56" role="img" aria-label={`${ch.title || 'Chart'}: ${CHART_TYPES.find((t) => t.value === ch.type)?.label} of ${ch.area}`}>
        <ResponsiveContainer width="100%" height="100%">{chart(ch.type)}</ResponsiveContainer>
      </div>
    </figure>
  );
}
