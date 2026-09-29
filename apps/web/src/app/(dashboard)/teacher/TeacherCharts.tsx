'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function GradeDistributionChart({ data: gradeDistributionData }: { data: { grade: string; count: number }[] }) {
  return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={gradeDistributionData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 dark:opacity-20 text-zinc-300 dark:text-zinc-700" />
          <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="text-zinc-500" />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="text-zinc-500" />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
            cursor={{ fill: 'var(--tw-colors-zinc-100)', opacity: 0.5 }}
          />
          <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
  );
}

export function PerformanceTrendChart({ data: performanceTrendData }: { data: { month: string; avgScore: number }[] }) {
  return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={performanceTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10 dark:opacity-20 text-zinc-300 dark:text-zinc-700" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="text-zinc-500" />
          <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="text-zinc-500" />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
          />
          <Line type="monotone" dataKey="avgScore" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
  );
}
