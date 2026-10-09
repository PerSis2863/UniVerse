'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// The admin analytics trend charts, loaded on their own (recharts is large) by page.tsx.

const nf = new Intl.NumberFormat('en-US');

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-500 mb-0.5">{label}</div>
      <div className="font-bold text-zinc-900 dark:text-white">{nf.format(payload[0].value)} {unit}</div>
    </div>
  );
}

export default function TrendChartBody({ data, unit, kind }: { data: { month: string; value: number }[]; unit: string; kind: 'area' | 'bar' }) {
  const axis = { stroke: 'currentColor', tick: { fontSize: 11, fill: 'currentColor' }, tickLine: false, axisLine: false };
  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === 'area' ? (
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 4 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="month" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: '#6366f1', strokeOpacity: 0.4 }} />
          <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#areaFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background, #fff)' }} animationDuration={900} />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ left: -20, right: 8, top: 4 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="month" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
          <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={900} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
