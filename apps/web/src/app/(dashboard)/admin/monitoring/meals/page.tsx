'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChefHat, ShoppingBasket } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, MONITORING_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { authedJson } from '@/lib/authed-fetch';
import { useActivePoll } from '@/lib/realtime-client';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Stage 5 · Q17 (admins): the kitchen's view of cafeteria pre-orders. What to prepare for each menu,
// the orders by pickup time, and Ready (which tells the student) and Collected. It refreshes by itself.

interface Order { id: string; items: { dish: string; qty: number }[]; pickupAt: string; note: string | null; code: string; status: 'PLACED' | 'READY' | 'COLLECTED' | 'CANCELLED'; user: { name: string } }
interface Menu { id: string; title: string; category: string | null; location: string | null; startAt: string; orders: Order[]; prep: { dish: string; qty: number }[] }
const dayKey = (offset: number) => { const d = new Date(Date.now() + offset * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const LABEL: Record<Order['status'], string> = { PLACED: 'To make', READY: 'Ready', COLLECTED: 'Collected', CANCELLED: 'Cancelled' };

export default function KitchenPage() {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [dates] = useState(() => ({ today: dayKey(0), tomorrow: dayKey(1) }));
  const poll = useActivePoll(15_000);
  const { data, error, isLoading, mutate } = useSWR<{ menus: Menu[] }>(`/api/admin/meal-orders?day=${dates[day]}`, authedJson, { refreshInterval: poll });
  const set = async (id: string, status: Order['status']) => {
    try { await authedJson('/api/admin/meal-orders', { method: 'PATCH', body: JSON.stringify({ id, status }) }); void mutate(); if (status === 'READY') toast.success('Marked ready: the student has been told'); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <>
      <Topbar title="Pre-orders" subtitle="What to prepare, and orders to hand over" />
      <SectionTabs tabs={MONITORING_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-4">
          <Segmented<'today' | 'tomorrow'> label="Day" value={day} onChange={setDay} segments={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }]} />
          {error ? <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p></div>
            : isLoading || !data ? <ContentSkeleton variant="list" />
            : data.menus.length ? (
              <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
                {data.menus.map((m) => (
                  <motion.section key={m.id} variants={fadeUp} className="panel p-4 sm:p-5 space-y-3" aria-labelledby={`menu-${m.id}`}>
                    <h2 id={`menu-${m.id}`} className="font-bold text-zinc-900 dark:text-white break-words">{m.category ?? 'Menu'} · {m.title}{m.location ? ` · ${m.location}` : ''}</h2>
                    {m.prep.length > 0 && (
                      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3">
                        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1"><ChefHat className="w-3.5 h-3.5" aria-hidden /> Still to make</p>
                        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">{m.prep.map((p) => <li key={p.dish} className="text-zinc-900 dark:text-white"><strong className="tabular-nums">{p.qty}×</strong> {p.dish}</li>)}</ul>
                      </div>
                    )}
                    {m.orders.length ? (
                      <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                        {m.orders.map((o) => (
                          <li key={o.id} className="py-3 space-y-1.5 text-sm">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className={cn('font-mono font-black tracking-wider text-zinc-900 dark:text-white', o.status === 'CANCELLED' && 'line-through decoration-zinc-400')}>{o.code}</span>
                              <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{time(o.pickupAt)}</span>
                              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{LABEL[o.status]}</span>
                              <span className="flex-1" />
                              {o.status === 'PLACED' && <button type="button" className="btn-primary btn-sm" onClick={() => set(o.id, 'READY')}>Ready</button>}
                              {o.status === 'READY' && <button type="button" className="btn-secondary btn-sm" onClick={() => set(o.id, 'COLLECTED')}>Collected</button>}
                              {(o.status === 'PLACED' || o.status === 'READY') && <button type="button" className="btn-ghost btn-sm" onClick={() => set(o.id, 'CANCELLED')}>Cancel</button>}
                            </div>
                            <p className="break-words text-zinc-900 dark:text-white">{o.items.map((i) => `${i.qty}× ${i.dish}`).join(', ')} <span className="text-zinc-600 dark:text-zinc-400">· {o.user.name}{o.note ? ` · “${o.note}”` : ''}</span></p>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">No pre-orders yet.</p>}
                  </motion.section>
                ))}
              </motion.div>
            ) : <div className="panel"><EmptyState icon={ShoppingBasket} title="No menus for this day" hint="Add menus in Student Life management; students can pre-order today’s and tomorrow’s." /></div>}
        </div>
      </div>
    </>
  );
}
