'use client';

import { cn } from '@/lib/utils';

// Hyperion Simulate: the parts every workbench shares (M404 Structures, M407 Heat): the outline's and details' styles,
// a number field with its unit, and the edges as ticks (beside picking them in the picture).

export const ui = {
  item: 'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]',
  on: 'bg-violet-100 font-semibold text-violet-950 hover:bg-violet-100 dark:bg-violet-500/20 dark:text-white dark:hover:bg-violet-500/20',
  small: 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.08]',
  label: 'block text-xs font-medium text-zinc-600 dark:text-zinc-300',
  input: 'input mt-1 w-full font-mono tabular-nums',
  select: 'rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] text-zinc-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-white',
  add: 'rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-zinc-200',
};

/** A number with its label and unit; ignores what isn't a number while typing. */
export function NumField({ label, unit, value, onChange, min }: { label: string; unit?: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className={ui.label}>{label}{unit && <span className="font-normal text-zinc-500 dark:text-zinc-400"> ({unit})</span>}
      <input type="number" inputMode="decimal" step="any" min={min} value={Number.isFinite(value) ? value : ''} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(v); }} className={ui.input} />
    </label>
  );
}

/** The part's edges as ticks: the chosen ones ticked; a tick adds or takes one away. */
export function EdgeTicks({ groups, ids, onToggle }: { groups: { label: string; ids: string[] }[]; ids: string[]; onToggle: (firstId: string) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className={ui.label}>Edges <span className="font-normal text-zinc-500 dark:text-zinc-400">(or press them in the picture)</span></legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {groups.map((g) => {
          const ticked = g.ids.every((i) => ids.includes(i));
          return (
            <label key={g.label} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs', ticked ? 'border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-400/60 dark:bg-violet-500/15 dark:text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/15 dark:text-zinc-200')}>
              <input type="checkbox" checked={ticked} onChange={() => onToggle(g.ids[0])} className="h-3.5 w-3.5 accent-violet-600" />{g.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
