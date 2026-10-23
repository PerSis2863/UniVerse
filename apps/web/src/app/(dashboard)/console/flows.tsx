'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FlowCard } from '@/components/landing/FlowCard';
import { FLOWS } from '@/components/landing/flows';
import { card } from './shared';

// Feature flows (M13): the jobs UniVerse runs by itself between people, the same cards as the
// landing page's (src/components/landing/flows.ts). Pick one on the left; it runs on the right.

export function FlowsPanel() {
  const [open, setOpen] = useState(FLOWS[0].id);
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-6 items-start">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Feature flows</h2>
        <p className="mt-1 text-sm text-zinc-500 max-w-xl">
          {FLOWS.length} jobs UniVerse runs by itself: something happens, one question, and the two ways it can go. A person is only asked where the card shows it.
        </p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {FLOWS.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setOpen(f.id)} aria-pressed={open === f.id}
                className={cn(card, 'w-full flex items-center gap-3 p-3 text-start transition-colors', open === f.id ? 'border-fuchsia-400/60 dark:border-fuchsia-400/40 ring-2 ring-fuchsia-400/20' : 'hover:border-indigo-400/40')}>
                <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 dark:from-indigo-500/25 dark:to-fuchsia-500/20">
                  <f.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-200" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{f.name}</span>
                  <span className="block font-mono text-[11px] text-zinc-500 truncate">{f.feature.toLowerCase()} · {f.person === 'yes' ? f.yes[0] : f.no[0]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="lg:sticky lg:top-4 flex justify-center">
        <FlowCard key={open} flow={open} className="rise-in" />
      </div>
    </div>
  );
}
