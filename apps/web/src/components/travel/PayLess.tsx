'use client';

import { useState, useSyncExternalStore } from 'react';
import { BadgePercent, ExternalLink } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { SECTORS, WHO, discountsFor, type Sector, type Who } from '@/lib/travel-discounts';
import { cn } from '@/lib/utils';

// M367: ways to pay less where you're going (src/lib/travel-discounts.ts): pick who you are (student, under 26, 60 or
// over, with children, family or group, disabled; kept on this device) and the kind (getting around, sights, food,
// shopping); each scheme says who it's for and links its official page. A guide's Know tab and a trip's Plan.

const KEEP = 'uv-discount-who';
const parse = (raw: string): Who[] => { try { return JSON.parse(raw).filter((w: unknown) => WHO.some((x) => x.id === w)); } catch { return []; } };
const WHO_LABEL = Object.fromEntries([...WHO.map((w) => [w.id, w.label]), ['everyone', 'Everyone']]) as Record<Who, string>;

export function PayLess({ countries, place, title, className, compact = false }: { countries: (string | null | undefined)[]; place: string; title?: string; className?: string; compact?: boolean }) {
  const kept = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(KEEP) ?? '[]'; } catch { return '[]'; } }, () => '[]');
  const [who, setWho] = useState<Who[] | null>(null); // null: as kept on this device
  const [sector, setSector] = useState<Sector | 'all'>('all'), [all, setAll] = useState(false);
  const mine = who ?? parse(kept);
  const list = discountsFor(countries, mine, sector === 'all' ? undefined : sector);
  const toggle = (w: Who) => {
    const now = mine, next = now.includes(w) ? now.filter((x) => x !== w) : [...now, w];
    setWho(next);
    try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ }
  };
  return (
    <section className={cn('panel p-5', className)} aria-labelledby="payless-h">
      <h3 id="payless-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><BadgePercent className="h-5 w-5 text-indigo-500" aria-hidden />{title ?? <>Pay less in <span translate="no">{place}</span></>}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Discounts that really exist here, and who gets them. Pick who’s travelling:</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Who’s travelling">
        {WHO.map((w) => {
          const on = mine.includes(w.id);
          return <button key={w.id} type="button" aria-pressed={on} onClick={() => toggle(w.id)} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-[background-color,color] duration-150', on ? 'bg-indigo-600 text-white ring-indigo-600' : 'text-zinc-700 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/[0.06]')}>{w.label}</button>;
        })}
      </div>
      <Segmented<Sector | 'all'> label="Kind of spending" className="mt-3 max-w-full overflow-x-auto" value={sector} onChange={setSector} segments={[{ value: 'all', label: 'All' }, ...SECTORS.map((s) => ({ value: s.id, label: s.label }))]} />
      <ul className={cn('mt-4 grid grid-cols-1 gap-3', !compact && 'md:grid-cols-2')}>
        {(compact && !all ? list.slice(0, 5) : list).map((d) => (
          <li key={d.id} className="rounded-2xl bg-zinc-50 p-4 dark:bg-white/[0.04]">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{SECTORS.find((s) => s.id === d.sector)!.label}{d.where.includes('*') ? ' · most countries' : ''}</p>
            <p className="mt-0.5 font-semibold text-zinc-900 dark:text-white">{d.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{d.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {d.who.map((w) => <span key={w} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', mine.includes(w) ? 'bg-indigo-600 text-white' : 'bg-zinc-200/70 text-zinc-700 dark:bg-white/10 dark:text-zinc-200')}>{WHO_LABEL[w]}</span>)}
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Official page<ExternalLink className="h-3 w-3" aria-hidden /></a>}
            </div>
          </li>
        ))}
      </ul>
      {compact && !all && list.length > 5 && <button type="button" onClick={() => setAll(true)} className="btn-secondary btn-sm mt-3">Show all {list.length}</button>}
      {!list.length && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">Nothing for that here yet: show your student card, ID or proof of age at the desk, as many places have reduced prices.</p>}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Ages, amounts and rules change: check the official page before you buy, and carry ID.</p>
    </section>
  );
}
