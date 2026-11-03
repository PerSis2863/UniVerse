'use client';

import useSWR from 'swr';
import { HeartHandshake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { card, fetcher, heavy } from './shared';
import { Ticker } from './deck';

// M79: how many real people use UniVerse, and which apps they use. Sample and demo accounts are
// left out (src/server/real-people.ts).
type RealPeople = {
  people: number; left: number; activeDay: number; activeWeek: number; activeMonth: number;
  new7: number; new30: number; back7: number; never: number;
  apps: { name: string; week: number; month: number }[];
};

export function RealPeopleCard() {
  const { data } = useSWR<RealPeople>('/owner/real-people', fetcher, heavy);
  if (!data) return <div className={cn(card, 'h-56 animate-pulse')} aria-hidden />;
  const big: [string, number][] = [['Real accounts', data.people], ['Used it today', data.activeDay], ['This week', data.activeWeek], ['Came back this week', data.back7]];
  const most = Math.max(1, ...data.apps.map((a) => a.month));
  return (
    <section aria-labelledby="real-h" className={cn(card, 'p-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="real-h" className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <HeartHandshake className="w-4 h-4 text-indigo-500 dark:text-indigo-300" aria-hidden /> Real people
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{data.left} sample and demo accounts left out</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {big.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{k}</dt>
            <dd className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white"><Ticker value={v} /></dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-300">People who did something in each app</h3>
          <ul className="mt-2 space-y-2">
            {data.apps.map((a) => (
              <li key={a.name} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-zinc-700 dark:text-zinc-200">{a.name}</span>
                <span className="relative h-2 rounded-full bg-zinc-200/70 dark:bg-white/[0.06] overflow-hidden" aria-hidden>
                  <span className="absolute inset-y-0 start-0 rounded-full bg-indigo-400/35 dark:bg-aqua-300/25" style={{ width: `${(a.month / most) * 100}%` }} />
                  <span className="absolute inset-y-0 start-0 rounded-full bg-indigo-600 dark:bg-aqua-300" style={{ width: `${(a.week / most) * 100}%` }} />
                </span>
                <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                  {a.week}<span className="sr-only"> this week,</span><span className="text-zinc-500 dark:text-zinc-400" aria-hidden> / </span>{a.month}<span className="sr-only"> in 30 days</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Dark: this week. Light: the last 30 days.</p>
        </div>
        <dl className="grid grid-cols-3 lg:grid-cols-1 gap-3 lg:w-40 text-sm">
          {([['New this week', data.new7], ['New in 30 days', data.new30], ['Never came back', data.never]] as const).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{k}</dt>
              <dd className="font-mono text-base tabular-nums text-zinc-900 dark:text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
