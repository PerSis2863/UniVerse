'use client';

import type { LucideIcon } from 'lucide-react';
import { Fill } from '@/components/ui/Fill';
import { CardHead } from '@/components/ui/CardMenu';
import { RELIEF_KINDS, RELIEF_KIND_LABEL, type ReliefKind } from '@/lib/relief';
import { cn } from '@/lib/utils';

// M371 (the owner, 20 Nov, a picture of the old "Help, moving" box: "remove this and add something professinonal and it
// should be ultra smooth"): in its place, what's needed most. Open needs by kind, most first, each with its people
// waiting and how many are urgent, a bar that slides (`Fill`, the graphics chip runs it) and a press that shows only
// that kind on the map. The map's own cards already carry the totals (open, being helped, urgent, helped in 30 days).

type Post = { type: string; status: string; kind: ReliefKind; urgency: string; people: number };

export function NeedsByKind({ posts, icons, chosen, onPick }: { posts: Post[]; icons: Record<ReliefKind, LucideIcon>; chosen: Set<ReliefKind>; onPick: (k: ReliefKind) => void }) {
  const open = posts.filter((p) => p.type === 'NEED' && p.status === 'OPEN');
  const rows = RELIEF_KINDS.map((k) => {
    const of = open.filter((p) => p.kind === k);
    return { k, n: of.length, people: of.reduce((s, p) => s + p.people, 0), urgent: of.filter((p) => p.urgency === 'CRITICAL' || p.urgency === 'HIGH').length };
  }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n || b.urgent - a.urgent);
  if (!rows.length) return null;
  const most = rows[0].n;
  return (
    <section className="panel p-5" aria-label="What’s needed most">
      <CardHead title="What’s needed most" sub={`${open.length} open ${open.length === 1 ? 'need' : 'needs'} on the map, by kind. Press one to show only that kind.`} />
      <ul className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
        {rows.map((r) => {
          const I = icons[r.k], on = chosen.has(r.k);
          return (
            <li key={r.k}>
              <button type="button" aria-pressed={on} onClick={() => onPick(r.k)}
                className={cn('w-full rounded-xl px-2.5 py-2 text-start transition-colors duration-150', on ? 'bg-orange-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.05]')}>
                <span className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200" aria-hidden><I className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white">{RELIEF_KIND_LABEL[r.k]}</span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{r.n}</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.08]" aria-hidden><Fill value={r.n / most} className={r.urgent ? 'bg-orange-600' : 'bg-zinc-700 dark:bg-zinc-300'} /></span>
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{r.people} {r.people === 1 ? 'person' : 'people'} waiting{r.urgent ? ` · ${r.urgent} urgent` : ''}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
