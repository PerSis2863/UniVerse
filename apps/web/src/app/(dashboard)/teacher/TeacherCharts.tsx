'use client';

import { DetailChart } from '@/components/instruments/Board';
import { niceTicks } from '@/lib/instruments';
import { cn } from '@/lib/utils';

// The teacher dashboard's two charts in the instrument look (components/instruments): columns in
// the text colour with the biggest group in hot pink, and the line you can read point by point.

export function GradeDistributionChart({ data }: { data: { grade: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const top = data.findIndex((d) => d.count === max);
  return (
    <div className="h-full flex flex-col text-zinc-800 dark:text-zinc-100" role="img" aria-label={data.map((d) => `${d.grade}: ${d.count}`).join(', ')}>
      <div className="flex-1 flex items-end gap-2">
        {data.map((d, i) => (
          <div key={d.grade} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${d.grade}: ${d.count}`}>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{d.count}</span>
            <div className={cn('w-full max-w-12 rounded-md ins-rise', i === top ? 'bg-[var(--ins-hot)]' : 'bg-current')}
              style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 85)}%`, opacity: i === top ? 1 : d.count ? 0.8 : 0.15, animationDelay: `${i * 60}ms` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">{data.map((d) => <span key={d.grade} className="flex-1 text-center font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{d.grade}</span>)}</div>
    </div>
  );
}

export function PerformanceTrendChart({ data }: { data: { month: string; avgScore: number }[] }) {
  const ticks = niceTicks(Math.max(100, ...data.map((d) => d.avgScore)));
  return <DetailChart series={data.map((d) => d.avgScore)} labels={data.map((d) => d.month)} unit="%" top={ticks[ticks.length - 1]} ticks={ticks} height={240} />;
}
