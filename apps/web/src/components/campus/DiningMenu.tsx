'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { MapPin, UtensilsCrossed } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { CampusItem } from './CampusItems';
import { TabPill } from '@/components/ui/Glide';

// Dining menu (upgrade 7): campus admins post each day's meals (Student Life management → Menus).
// One menu per meal: its day, the dining hall, one dish per line.

const MEALS = ['Breakfast', 'Lunch', 'Dinner'];
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function DiningMenu() {
  const { data, isLoading } = useSWR<CampusItem[]>('/api/campus-items?kind=MENU', authedJson);
  const [today] = useState(() => dayKey(new Date().toISOString()));
  const days = [...new Set((data ?? []).filter((m) => m.startAt && dayKey(m.startAt) >= today).map((m) => dayKey(m.startAt!)))].sort().slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days[0];

  if (isLoading) return <div className="h-40 rounded-2xl skeleton" />;
  if (!day) {
    return (
      <FeatureGuide icon={UtensilsCrossed} title="The dining menu will appear here" description="What’s on at the dining halls each day, posted by your campus admin."
        steps={['Your admin posts the week’s menus', 'Pick a day to see breakfast, lunch and dinner', 'Dietary notes are in each dish’s name']}
        example={<div><ExampleRow title="Lunch · Central Dining Hall" meta="Lentil curry (vegan) · Grilled chicken · Salad bar" right="Today" /></div>} />
    );
  }
  const meals = (data ?? []).filter((m) => m.startAt && dayKey(m.startAt) === day)
    .sort((a, b) => (MEALS.indexOf(a.category ?? '') + 10 * Number(!MEALS.includes(a.category ?? ''))) - (MEALS.indexOf(b.category ?? '') + 10 * Number(!MEALS.includes(b.category ?? ''))));
  const label = (k: string) => (k === today ? 'Today' : new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Day">
        {days.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === day} onClick={() => setPicked(k)} className={cn('relative isolate px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors', k === day ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.05]')}>
            {k === day && <TabPill id="menu-day" />}
            <span className="relative">{label(k)}</span>
          </button>
        ))}
      </div>
      <motion.div key={day} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="grid sm:grid-cols-3 gap-3">
        {meals.map((m) => (
          <div key={m.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">{m.category || 'Menu'}</p>
            <p className="font-semibold text-zinc-900 dark:text-white mt-0.5">{m.title}</p>
            {m.location && <p className="text-xs text-zinc-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location}</p>}
            <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {(m.description ?? '').split('\n').map((d) => d.trim()).filter(Boolean).map((d) => <li key={d} className="flex gap-2"><span className="text-zinc-400">·</span>{d}</li>)}
            </ul>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
