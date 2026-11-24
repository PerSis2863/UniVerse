'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';
import { HELP, SECTIONS } from '@/lib/lab/help';

// M391: every function of Hyperion by section, searchable by name or by what it does; choosing one puts how to call it
// in the command window.

/** The first way of calling it: "fft(x, n), fft(A)" → "fft(x, n)" (commas inside brackets don't split). */
export function firstForm(syntax: string): string {
  let depth = 0;
  for (let i = 0; i < syntax.length; i++) {
    const ch = syntax[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) return syntax.slice(0, i).trim();
  }
  return syntax.trim();
}

export function FunctionBrowser({ onClose, onPick, initial = '' }: { onClose: () => void; onPick: (syntax: string) => void; /** M472: the toolstrip's help search. */ initial?: string }) {
  const [q, setQ] = useState(initial);
  const [section, setSection] = useState<string | null>(null);
  const all = useMemo(() => [...HELP.values()], []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((e) => (!section || e.section === section) && words.every((w) => `${e.name} ${e.text}`.toLowerCase().includes(w)));
  const chip = (on: boolean) => cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150', on ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.12]');
  return (
    <Sheet title="Functions" onClose={onClose} wide>
      <div className="flex min-h-0 flex-col gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 focus-within:border-violet-500 dark:border-white/15">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: a name or what it does (fourier, sort rows, picture…)" aria-label="Search functions" className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:shadow-none!" autoFocus />
          <span className="text-xs tabular-nums text-zinc-500">{shown.length}</span>
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Sections">
          <button type="button" className={chip(!section)} aria-pressed={!section} onClick={() => setSection(null)}>All</button>
          {SECTIONS.map((s) => <button key={s} type="button" className={chip(section === s)} aria-pressed={section === s} onClick={() => setSection(section === s ? null : s)}>{s}</button>)}
        </div>
        <ul className="max-h-[55vh] divide-y divide-zinc-100 overflow-auto rounded-xl border border-zinc-200/80 dark:divide-white/[0.06] dark:border-white/10" data-no-motion>
          {shown.slice(0, 300).map((e) => (
            <li key={e.name}>
              <button type="button" onClick={() => onPick(firstForm(e.syntax))} className="grid w-full grid-cols-1 gap-0.5 px-3 py-2 text-start hover:bg-zinc-50 sm:grid-cols-[9rem_1fr] sm:gap-3 dark:hover:bg-white/[0.04]">
                <span className="font-mono text-[13px] font-semibold text-zinc-900 dark:text-white" translate="no">{e.name}</span>
                <span className="text-[13px] text-zinc-700 dark:text-zinc-200">{e.text}<span className="block font-mono text-xs text-zinc-500 dark:text-zinc-400" translate="no">{e.syntax}</span></span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-3 py-6 text-center text-[13px] text-zinc-500">Nothing found: try other words.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
