'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, Store } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Fill } from '@/components/ui/Fill';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { guideProgress, shopSteps } from '@/lib/shop-guide';

// M310: Trace → Wallet: a new shop's setup guide (GET /trace/shop-guide), five steps from joining a brand's
// network to the first points, each ticked by what the shop really did; the counter sign by hand (this device).

type Facts = { shop: boolean; brands: number; stops: number; sales: number; points: number; tier: { label: string; next: { label: string; need: number } | null } };
const SIGN_KEY = 'uv-shop-sign';
const readSign = () => { try { return localStorage.getItem(SIGN_KEY) === '1'; } catch { return false; } };

export function ShopGuide() {
  const { data } = useSWR<Facts>('/trace/shop-guide', fetcher);
  const [sign, setSign] = useState(readSign);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const steps = shopSteps({ ...data, signShown: sign });
  const p = guideProgress(steps);
  if (!data.shop && !open) return <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}><Store className="w-4 h-4" aria-hidden />Run a shop? Set it up</button>;
  if (data.shop && !p.next) return null;
  const tick = (on: boolean) => { setSign(on); try { localStorage.setItem(SIGN_KEY, on ? '1' : '0'); } catch { /* kept for this visit */ } };
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="shop-guide-h">
      <div className="flex items-center gap-2">
        <h2 id="shop-guide-h" className="me-auto font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Store className="w-4 h-4 text-pink-500" aria-hidden />Set up your shop</h2>
        <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{p.done} of {p.total}</span>
      </div>
      <span className="block h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"><Fill value={p.done / p.total} className="bg-pink-500" /></span>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className={cn('flex gap-3 text-sm', s.done && 'opacity-70')}>
            <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', s.done ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200')}>{s.done ? <Check className="w-3 h-3" aria-label="Done" /> : i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-zinc-900 dark:text-white">{s.title}</span>
              <span className="block text-zinc-600 dark:text-zinc-300">{s.how}</span>
              {s.id === 'sign' && <label className="mt-1 inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={sign} onChange={(e) => tick(e.target.checked)} />It’s up at my counter</label>}
            </span>
            {s.href && !s.done && <Link href={s.href} className="btn-ghost btn-sm shrink-0 self-start">Open</Link>}
          </li>
        ))}
      </ol>
      {data.sales > 0 && <p className="text-xs text-zinc-500">Your tier: {data.tier.label}{data.tier.next ? ` · ${data.tier.next.need} more sales in 90 days for ${data.tier.next.label}` : ''}</p>}
    </section>
  );
}
