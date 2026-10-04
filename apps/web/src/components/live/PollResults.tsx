import { cn } from '@/lib/utils';

/** A poll's answers as one-hue bars with the count and share as text (counts are one series). */
export function PollResults({ options, results, total, mine }: { options: string[]; results: number[]; total: number; mine?: number | null }) {
  return (
    <ul className="space-y-2" aria-label="Results">
      {options.map((o, i) => {
        const share = total ? Math.round((results[i] / total) * 100) : 0;
        return (
          <li key={i} title={`${o}: ${results[i]} (${share}%)`}>
            <div className="flex justify-between gap-3 text-sm">
              <span className={cn('text-zinc-800 dark:text-zinc-200', mine === i && 'font-semibold')}>{o}{mine === i ? ' · your answer' : ''}</span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0">{results[i]} · {share}%</span>
            </div>
            <div className="h-2 mt-1 rounded-full bg-zinc-200 dark:bg-white/[0.08] overflow-hidden" aria-hidden>
              <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${share}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
