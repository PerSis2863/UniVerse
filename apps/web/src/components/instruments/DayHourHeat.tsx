import { heatLevel } from '@/lib/activity-heat';
import { cn } from '@/lib/utils';

// M141: the Ballast reels' activity heatmap: the days down the side, the 24 hours across, each square
// shaded by how much happened then (the accent, five steps), "Less … More" under it. The squares fill in
// one by one on their own (scroll-motion's `data-cells`). Screen readers get the busiest times in words.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHADE = ['bg-zinc-100 dark:bg-white/[0.06]', 'bg-indigo-500/25', 'bg-indigo-500/45', 'bg-indigo-500/70', 'bg-indigo-600'];
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

export function DayHourHeat({ cells, unit = 'action' }: { cells: number[][]; unit?: string }) {
  const max = Math.max(0, ...cells.flat());
  const busiest = cells
    .flatMap((row, d) => row.map((n, h) => ({ n, d, h })))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const many = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return (
    <figure>
      <div aria-hidden>
        {/* The labels' column stretches to the squares' height, so each name sits on its row. */}
        <div className="flex gap-2">
          <div className="w-8 shrink-0 grid grid-rows-7 gap-[3px]">
            {DAYS.map((d) => <span key={d} className="text-[11px] leading-none text-zinc-500 dark:text-zinc-400 flex items-center">{d.slice(0, 3)}</span>)}
          </div>
          <div data-cells className="flex-1 min-w-0 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
            {cells.flatMap((row, d) => row.map((n, h) => (
              <span key={`${d}:${h}`} title={`${DAYS[d]}, ${hourName(h)}: ${many(n)}`}
                className={cn('heat-cell aspect-square rounded-[3px]', SHADE[heatLevel(n, max)])} />
            )))}
          </div>
        </div>
        <div className="ms-10 grid grid-cols-4 mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {[0, 6, 12, 18].map((h) => <span key={h}>{hourName(h)}</span>)}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-2 text-[11px] text-zinc-500 dark:text-zinc-400" aria-hidden>
        Less{SHADE.map((s) => <span key={s} className={cn('w-2.5 h-2.5 rounded-[3px]', s)} />)}More
      </div>
      <figcaption className="sr-only">
        {busiest.length ? `Busiest: ${busiest.map((c) => `${DAYS[c.d]} at ${hourName(c.h)} (${many(c.n)})`).join('; ')}.` : 'Nothing in these dates.'}
      </figcaption>
    </figure>
  );
}
