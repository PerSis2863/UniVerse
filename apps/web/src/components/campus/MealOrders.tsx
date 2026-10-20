'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Minus, Plus, ShoppingBasket } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

// Stage 5 · Q17: cafeteria pre-orders from the dining menu. Pick dishes and a time, collect with a
// short code and pay at the counter; the kitchen marks it ready, which sends a notification.

export interface MealMenu { id: string; title: string; category: string | null; location: string | null; startAt: string; dishes: string[] }
export interface MealOrderView { id: string; items: { dish: string; qty: number }[]; pickupAt: string; note: string | null; code: string; status: 'PLACED' | 'READY' | 'COLLECTED' | 'CANCELLED'; menu: { title: string; category: string | null; location: string | null } }
export const MEALS_KEY = '/api/campus/meals';
export const useMeals = () => useSWR<{ menus: MealMenu[]; orders: MealOrderView[] }>(MEALS_KEY, authedJson);
const time = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const STATUS: Record<MealOrderView['status'], [string, string]> = {
  PLACED: ['Ordered', 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'], READY: ['Ready to collect', 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'],
  COLLECTED: ['Collected', 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200'], CANCELLED: ['Cancelled', 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300'],
};

/** A time on the menu's day: the next quarter hour at least 30 minutes away, or 12:30 for a later day. */
function firstPickup(menuDay: string) {
  const d = new Date(menuDay), now = new Date();
  const same = d.toDateString() === now.toDateString();
  const t = same ? new Date(Math.ceil((now.getTime() + 30 * 60_000) / (15 * 60_000)) * 15 * 60_000) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 30);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

export function PreOrderSheet({ menu, onClose, onPlaced }: { menu: MealMenu; onClose: () => void; onPlaced: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [at, setAt] = useState(() => firstPickup(menu.startAt));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const count = Object.values(qty).reduce((t, n) => t + n, 0);
  const change = (dish: string, d: number) => setQty((q) => ({ ...q, [dish]: Math.max(0, Math.min(5, (q[dish] ?? 0) + d)) }));
  const place = async () => {
    const day = new Date(menu.startAt);
    const [h, m] = at.split(':').map(Number);
    const pickupAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    setBusy(true);
    try {
      await authedJson(MEALS_KEY, { method: 'POST', body: JSON.stringify({ menuId: menu.id, items: Object.entries(qty).filter(([, n]) => n > 0).map(([dish, n]) => ({ dish, qty: n })), pickupAt: pickupAt.toISOString(), note }) });
      toast.success('Ordered. Show your code at the counter.');
      onPlaced();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={`Pre-order: ${menu.category ?? 'Menu'}${menu.location ? ` at ${menu.location}` : ''}`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !count} onClick={place}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Order {count ? `(${count})` : ''}</button></div>}>
      <div className="space-y-4">
        <ul className="divide-y divide-zinc-200 dark:divide-white/10">
          {menu.dishes.map((d) => (
            <li key={d} className="py-2 flex items-center gap-3">
              <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white break-words">{d}</span>
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`One less ${d}`} disabled={!qty[d]} onClick={() => change(d, -1)}><Minus className="w-4 h-4" aria-hidden /></button>
              <span className="w-5 text-center tabular-nums text-sm" aria-live="polite" aria-label={`${qty[d] ?? 0} ${d}`}>{qty[d] ?? 0}</span>
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`One more ${d}`} disabled={(qty[d] ?? 0) >= 5} onClick={() => change(d, 1)}><Plus className="w-4 h-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
          <Field label="Pick up at">{(p) => <input {...p} className="input" type="time" step={900} value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
          <Field label="Note for the kitchen (optional)">{(p) => <input {...p} className="input" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="No onions, please" />}</Field>
        </div>
        <p className="text-xs text-zinc-500">You pay at the counter when you collect. You can cancel until the kitchen starts on it.</p>
      </div>
    </Sheet>
  );
}

export function MyMealOrders() {
  const { data, mutate } = useMeals();
  const live = (data?.orders ?? []).filter((o) => o.status === 'PLACED' || o.status === 'READY');
  if (!live.length) return null;
  const cancel = async (id: string) => {
    try { await mutate(await authedJson(`${MEALS_KEY}?order=${encodeURIComponent(id)}`, { method: 'DELETE' }), { revalidate: false }); toast.success('Cancelled'); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <section className="space-y-2" aria-labelledby="my-meals-h">
      <h3 id="my-meals-h" className="font-bold text-zinc-900 dark:text-white inline-flex items-center gap-1.5"><ShoppingBasket className="w-4 h-4" aria-hidden /> Your pre-orders</h3>
      <ul className="grid sm:grid-cols-2 gap-3">
        {live.map((o) => (
          <li key={o.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-4 flex items-start gap-3">
            <div className="text-center shrink-0">
              <p className="text-[11px] text-zinc-500">Code</p>
              <p className="text-2xl font-black font-mono tracking-wider text-zinc-900 dark:text-white">{o.code}</p>
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS[o.status][1])}>{STATUS[o.status][0]}</span>
              <p className="mt-1 text-zinc-900 dark:text-white break-words">{o.items.map((i) => `${i.qty}× ${i.dish}`).join(', ')}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{time(o.pickupAt)}{o.menu.location ? ` · ${o.menu.location}` : ''}</p>
              {o.status === 'PLACED' && <button type="button" className="btn-ghost btn-sm mt-1 -ml-2" onClick={() => cancel(o.id)}>Cancel</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
