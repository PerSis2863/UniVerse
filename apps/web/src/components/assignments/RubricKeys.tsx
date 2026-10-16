'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

// Quick rubric scoring (Stage 5 · B3.3): six levels per criterion, 0 to 5 fifths of its points. In a
// row, the keys 0–5 pick a level and move on to the next criterion; the arrow keys move along the row.

const LEVELS = [0, 1, 2, 3, 4, 5];
/** The points for level `k` of a criterion worth `points`, to the nearest half. */
export const levelScore = (points: number, k: number) => Math.round(((points * k) / 5) * 2) / 2;

export function RubricLevels({ criterion, points, value, onPick }: { criterion: string; points: number; value: string; onPick: (score: number) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const picked = LEVELS.find((k) => value !== '' && levelScore(points, k) === Number(value));
  const focusAt = (k: number) => row.current?.querySelectorAll<HTMLButtonElement>('button')[k]?.focus();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (/^[0-5]$/.test(e.key)) {
      e.preventDefault();
      onPick(levelScore(points, Number(e.key)));
      // On to the next criterion's row.
      const rows = [...document.querySelectorAll<HTMLElement>('[data-rubric-levels]')];
      const next = rows[rows.indexOf(row.current!) + 1];
      (next?.querySelector<HTMLButtonElement>('button[tabindex="0"]') ?? next?.querySelector('button'))?.focus();
      return;
    }
    const at = LEVELS.indexOf(Number((document.activeElement as HTMLElement | null)?.dataset.level ?? -1));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(Math.min(5, Math.max(0, at + (e.key === 'ArrowRight' ? 1 : -1))));
    }
  };
  return (
    <div ref={row} data-rubric-levels role="radiogroup" aria-label={`Level for ${criterion} (keys 0 to 5)`} onKeyDown={onKey} className="flex flex-wrap gap-1 mt-1.5">
      {LEVELS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          data-level={k}
          aria-checked={picked === k}
          aria-label={`${k} of 5: ${levelScore(points, k)} point${levelScore(points, k) === 1 ? '' : 's'}`}
          tabIndex={(picked ?? 0) === k ? 0 : -1}
          onClick={() => onPick(levelScore(points, k))}
          className={cn('min-w-7 h-7 px-1.5 rounded-lg text-xs font-semibold border tabular-nums',
            picked === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}
        >{k}</button>
      ))}
    </div>
  );
}
