import { cn } from '@/lib/utils';

// M143: the Ballast reels' small column chart on each card: one column a day, older days grey, the
// latest few in the accent, "14 days ago" and "Today" under it. The columns rise in one after another
// (the M143 block in globals.css). Screen readers get the total and the last few days in words.

export function MiniColumns({ values, recent = 5, unit = 'hand-in', className }: { values: number[]; recent?: number; unit?: string; className?: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const last = values.slice(-recent).reduce((a, b) => a + b, 0);
  const many = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return (
    <figure className={className}>
      <div className="flex items-end gap-[3px] h-12" aria-hidden>
        {values.map((v, i) => (
          <span key={i} className={cn('mini-col flex-1 rounded-[2px]', i >= values.length - recent ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-white/[0.12]')}
            style={{ height: `${v ? Math.max(8, (v / max) * 100) : 4}%`, ['--i' as string]: i }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden>
        <span>{values.length} days ago</span><span>Today</span>
      </div>
      <figcaption className="sr-only">{many(total)} in the last {values.length} days, {many(last)} in the last {recent}.</figcaption>
    </figure>
  );
}
