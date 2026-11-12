'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// M142: the Ballast reels' "Start from" cards (their "New agent" window): a grid of choices, each a
// card with its icon, name and two grey lines, and a round check that fills when chosen. One choice
// (a radio group): the arrow keys move and choose, Tab enters on the chosen one. The cards settle in
// one after another when the window opens; the check pops in on a spring.

export interface TemplateOption<T extends string> { value: T; title: string; sub: string; icon: LucideIcon }

export function TemplateCards<T extends string>({ options, value, onChange, label, className }: {
  options: TemplateOption<T>[];
  /** The chosen one, or null before any is chosen. */
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rtl = document.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = options[(at + step + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className={cn('grid gap-3 grid-cols-1 min-[440px]:grid-cols-2', className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-value={o.value} tabIndex={i === at ? 0 : -1} onClick={() => onChange(o.value)}
            style={{ ['--i' as string]: i }}
            className={cn('tpl-card relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-start bg-[var(--card-bg)]',
              on ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400' : 'border-zinc-200 dark:border-white/[0.1] hover:border-zinc-300 dark:hover:border-white/[0.2]')}>
            <span className="w-9 h-9 rounded-lg grid place-items-center bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200" aria-hidden><Icon className="w-4 h-4" /></span>
            <span aria-hidden className={cn('absolute top-3.5 end-3.5 w-[18px] h-[18px] rounded-full border grid place-items-center', on ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300 dark:border-white/25')}>
              {on && <span className="tpl-check w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
            <span className="block">
              <span className="block text-[13.5px] font-semibold text-zinc-900 dark:text-white">{o.title}</span>
              <span className="block mt-0.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{o.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
