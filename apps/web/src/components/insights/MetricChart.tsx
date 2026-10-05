'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue, type MetricResult, type MetricRow } from '@/lib/school-metrics';

// The chart for one school-analytics answer, in one hue: bars for courses, departments and people,
// a line for rates and counts over time, columns for amounts per month. Loaded only when a chart
// is on screen (recharts is large). One value per chart, so no legend: the title names it.

const INK = '#6366f1';
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Tip({ active, payload, result }: { active?: boolean; payload?: { payload: MetricRow }[]; result: MetricResult }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-3 py-2 shadow-xl text-xs space-y-0.5">
      <p className="font-semibold text-zinc-900 dark:text-white">
        {row.label}
        {row.name ? <span className="font-normal text-zinc-500"> · {row.name}</span> : null}
      </p>
      {result.columns.slice(1).filter((c) => c.unit).map((c) => (
        <p key={c.key} className="text-zinc-600 dark:text-zinc-300">
          <span className="text-zinc-500">{c.label}: </span>
          <b className="tabular-nums">{formatValue(Number(row[c.key]), c.unit)}</b>
        </p>
      ))}
    </div>
  );
}

export default function MetricChart({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const pct = result.unit === '%';
  const axis = { stroke: 'currentColor', tick: { fontSize: 11, fill: 'currentColor' }, tickLine: false, axisLine: false };
  const tick = (v: number) => formatValue(v, result.unit, false);
  const label = `${result.title}, ${result.range}. ${result.headline}`;

  if (result.kind === 'bar') {
    const rows = result.rows.slice(0, compact ? 6 : 15);
    const width = Math.min(170, Math.max(56, Math.max(...rows.map((r) => short(r.label).length)) * 6.6 + 8));
    return (
      <div role="img" aria-label={label} className="text-zinc-500 dark:text-zinc-400" style={{ height: rows.length * 30 + 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis type="number" domain={pct ? [0, 100] : [0, 'auto']} allowDecimals={result.unit !== 'count'} tickFormatter={tick} {...axis} />
            <YAxis type="category" dataKey="label" width={width} interval={0} tickFormatter={(v: string) => short(v)} {...axis} />
            <Tooltip content={<Tip result={result} />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
            <Bar dataKey="value" fill={INK} radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const rows = result.rows;
  const height = compact ? 110 : 240;
  if (result.kind === 'column') {
    return (
      <div role="img" aria-label={label} className="text-zinc-500 dark:text-zinc-400" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: compact ? -24 : -12, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={12} tickFormatter={(v: string) => v.split(' ')[0]} {...axis} />
            <YAxis allowDecimals={false} tickFormatter={tick} width={44} hide={compact} {...axis} />
            <Tooltip content={<Tip result={result} />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
            <Bar dataKey="value" fill={INK} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Line: rates zoom to their range (a line needn't start at zero); counts start at zero.
  const last = rows.length - 1;
  const endDot = (p: { cx?: number; cy?: number; index?: number }) =>
    p.index === last && p.cx !== undefined && p.cy !== undefined
      ? <circle key="end" cx={p.cx} cy={p.cy} r={4} fill={INK} strokeWidth={2} className="stroke-white dark:stroke-zinc-900" />
      : <g key={`dot-${p.index}`} />;
  return (
    <div role="img" aria-label={label} className="text-zinc-500 dark:text-zinc-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: compact ? -24 : -12, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axis} />
          <YAxis
            domain={pct ? [(min: number) => Math.max(0, Math.floor(min - 5)), (max: number) => Math.min(100, Math.ceil(max + 5))] : [0, 'auto']}
            allowDecimals={false} tickFormatter={tick} width={44} hide={compact} {...axis}
          />
          <Tooltip content={<Tip result={result} />} cursor={{ stroke: INK, strokeOpacity: 0.35 }} />
          <Line type="monotone" dataKey="value" stroke={INK} strokeWidth={2} dot={endDot} activeDot={{ r: 5, strokeWidth: 2, className: 'stroke-white dark:stroke-zinc-900' }} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
