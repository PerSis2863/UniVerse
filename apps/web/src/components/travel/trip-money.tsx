'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowRight, ArrowRightLeft, BedDouble, Check, Coins, Plus, ShoppingBag, Ticket, TrainFront, Trash2, Utensils, Wallet, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { CURRENCIES, currencyOf, fromUsd, MONEY_YEAR, priceLevel, toUsd } from '@/lib/travel-find';
import { EXPENSE_KINDS, SETTLE, balances, readAmount, settle, spent, type Expense } from '@/lib/travel-split';
import { cn } from '@/lib/utils';

// A trip's money (M215): costs shared between the people planning it (who paid, for whom), each person's
// balance and the fewest payments to settle up, what was spent against the trip's estimated budget, a
// converter and rough prices of everyday things in each country. The costs live on the server
// (src/server/travel-trip-extras.ts) and reach the others live; the converter and prices are worked out here.

interface Member { id: string; name: string }
const ICON: Record<string, LucideIcon> = { food: Utensils, stay: BedDouble, travel: TrainFront, fun: Ticket, shop: ShoppingBag, other: Coins, [SETTLE]: Check };
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
/** Cents as money: decimals only where the currency has them. */
export function cash(cents: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100); } catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
/** Everyday prices (US dollars at US prices) scaled by a country's price level, dampened as dailyCost is. */
const EVERYDAY = [['A coffee', 4.5], ['Lunch', 15], ['Dinner for one', 35], ['A beer', 7], ['A bus or metro ride', 2.75], ['A museum ticket', 20]] as const;

export function TripMoney({ tripId, members, me, currency, budget, countries }: { tripId: string; members: Member[]; me: string; currency: string; budget: number | null; countries: string[] }) {
  const key = `/travel/trips/${tripId}/expenses`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ expenses: Expense[] }>(key, fetcher, { refreshInterval });
  const list = useMemo(() => data?.expenses ?? [], [data]);
  const name = (id: string) => (id === me ? 'You' : members.find((m) => m.id === id)?.name ?? 'Someone who left');
  const net = useMemo(() => balances(list), [list]), out = useMemo(() => spent(list), [list]);
  const transfers = useMemo(() => Object.entries(net).flatMap(([c, n]) => settle(n, c)), [net]);
  const spentHere = out[currency]?.total ?? 0, mine = Object.entries(net).map(([c, n]) => [c, n[me] ?? 0] as const).filter(([, v]) => v);

  const act = async (call: () => Promise<unknown>, ok: string) => {
    try { await call(); toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    await mutate();
  };
  const pay = (t: { from: string; to: string; amount: number; currency: string }) => act(() => api.post(key, { category: SETTLE, amount: t.amount, currency: t.currency, paidBy: t.from, split: [t.to] }), `Marked: ${name(t.from)} paid ${name(t.to) === 'You' ? 'you' : name(t.to)} back.`);

  return (
    <div className="space-y-6">
      {/* Where things stand. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Where the money stands">
        <div className="panel p-4 sm:p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Spent so far</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{cash(spentHere, currency)}</p>
          {Object.entries(out).filter(([c]) => c !== currency).map(([c, v]) => <p key={c} className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">+ {cash(v.total, c)}</p>)}
        </div>
        <div className="panel p-4 sm:p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Against the budget</p>
          {budget ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{Math.round((spentHere / 100 / budget) * 100)} %</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><span className={cn('block h-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-glide)] rtl:origin-right', spentHere / 100 > budget ? 'bg-red-500' : 'bg-indigo-500')} style={{ transform: `scaleX(${Math.min(1, spentHere / 100 / budget)})` }} /></div>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">of the {cash(Math.round(budget * 100), currency)} estimate on the Plan tab</p>
            </>
          ) : <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Add places to the trip for an estimate.</p>}
        </div>
        <div className="panel col-span-2 p-4 sm:col-span-1 sm:p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">You</p>
          {!mine.length ? <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-white">All square</p>
            : mine.map(([c, v]) => <p key={c} className={cn('mt-1 text-2xl font-semibold tabular-nums', v > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400')}>{v > 0 ? `You’re owed ${cash(v, c)}` : `You owe ${cash(-v, c)}`}</p>)}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="panel p-5" aria-labelledby="costs-h">
          <h3 id="costs-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Wallet className="h-5 w-5 text-indigo-500" aria-hidden />Shared costs</h3>
          <AddCost key={members.length} tripId={tripId} members={members} me={me} currency={currency} countries={countries} onAdded={() => void mutate()} />
          {!data ? <div className="mt-4 h-24 skeleton rounded-xl" aria-busy="true" />
            : !list.length ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">Nothing yet. Add what someone paid for the group: dinner, tickets, a room. Everyone planning the trip sees it.</p>
            : (
              <ul className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/10" data-no-motion>
                {list.map((e) => {
                  const Icon = ICON[e.category] ?? Coins, settleUp = e.category === SETTLE;
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2.5">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', settleUp ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300')} aria-hidden><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{settleUp ? `${name(e.paidBy)} paid ${name(e.split[0]) === 'You' ? 'you' : name(e.split[0])} back` : e.what}</span>
                        {!settleUp && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{name(e.paidBy)} paid · for {e.split.length === members.length ? 'everyone' : e.split.map(name).join(', ')}{e.day ? ` · ${new Date(`${e.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}</span>}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-white">{cash(e.amount, e.currency)}</span>
                      <button type="button" onClick={() => { if (confirm(`Delete “${settleUp ? 'this payment' : e.what}”?`)) void act(() => api.delete(`${key}/${e.id}`), 'Deleted.'); }} className="btn-ghost btn-sm p-1.5 text-zinc-500" aria-label={`Delete ${settleUp ? 'this payment' : e.what}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="settle-h">
            <h3 id="settle-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ArrowRightLeft className="h-5 w-5 text-indigo-500" aria-hidden />Settle up</h3>
            {!transfers.length ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{list.length ? 'Everyone is square.' : 'Who owes whom shows here once there are costs.'}</p> : (
              <>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">The fewest payments that make everyone square.</p>
                <ul className="mt-3 space-y-2" data-no-motion>
                  {transfers.map((t) => (
                    <li key={`${t.from}-${t.to}-${t.currency}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{name(t.from)}<ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden /><span className="sr-only">{name(t.from) === 'You' ? 'pay' : 'pays'}</span>{name(t.to)}</span>
                      <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{cash(t.amount, t.currency)}</span>
                      <button type="button" onClick={() => void pay(t)} className="btn-secondary btn-sm">Mark as paid</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <Converter currency={currency} countries={countries} />
        </div>
      </div>

      {countries.length > 0 && <Everyday countries={countries} currency={currency} />}
    </div>
  );
}

function AddCost({ tripId, members, me, currency, countries, onAdded }: { tripId: string; members: Member[]; me: string; currency: string; countries: string[]; onAdded: () => void }) {
  const [what, setWhat] = useState(''), [amount, setAmount] = useState(''), [cur, setCur] = useState(currency);
  const [kind, setKind] = useState('food'), [paidBy, setPaidBy] = useState(me), [split, setSplit] = useState<string[]>(members.map((m) => m.id));
  const [day, setDay] = useState(''), [busy, setBusy] = useState(false);
  const local = [...new Set(countries.map(currencyOf))].filter((c) => c !== currency);
  const cents = readAmount(amount);
  const save = async () => {
    if (!cents || !what.trim() || !split.length) return;
    setBusy(true);
    try {
      await api.post(`/travel/trips/${tripId}/expenses`, { what, amount: cents, currency: cur, category: kind, paidBy, split, day: day || null });
      setWhat(''); setAmount(''); toast.success('Added: everyone planning the trip sees it.'); onAdded();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add that.')); } finally { setBusy(false); }
  };
  return (
    <form className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className={label}>What for<input value={what} onChange={(e) => setWhat(e.target.value.slice(0, 80))} placeholder="Dinner, tickets, a taxi…" className={field} /></label>
      <label className={label}>How much<input value={amount} onChange={(e) => setAmount(e.target.value.slice(0, 16))} inputMode="decimal" placeholder="0.00" aria-invalid={amount !== '' && !cents} className={cn(field, 'tabular-nums')} /></label>
      <label className={label}>Currency
        <select value={cur} onChange={(e) => setCur(e.target.value)} className={field}>
          {[currency, ...local].map((c) => <option key={c} value={c}>{c}</option>)}
          <optgroup label="Others">{CURRENCIES.filter((c) => c !== currency && !local.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
        </select>
      </label>
      <label className={label}>Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>{EXPENSE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
      </label>
      <label className={label}>Paid by
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={field}>{members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.name} (you)` : m.name}</option>)}</select>
      </label>
      <label className={label}>Day (optional)<input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={cn(field, 'min-w-[9.5rem]')} /></label>
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className={label}>For whom</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = split.includes(m.id);
            return <button key={m.id} type="button" aria-pressed={on} onClick={() => setSplit((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-colors', on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-zinc-700 ring-zinc-200 dark:bg-white/[0.05] dark:text-zinc-200 dark:ring-white/10')} translate="no">{m.id === me ? 'You' : m.name}</button>;
          })}
        </div>
        {cents && split.length > 0 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400" data-no-motion>{cash(Math.floor(cents / split.length), cur)} each</p>}
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy || !cents || !what.trim() || !split.length} className="btn-primary inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add the cost</button></div>
    </form>
  );
}

/** Any amount between the currencies of the trip (yearly average rates, to plan with). */
function Converter({ currency, countries }: { currency: string; countries: string[] }) {
  const local = [...new Set(countries.map(currencyOf))].filter((c) => c !== currency);
  const [amount, setAmount] = useState('100'), [from, setFrom] = useState(local[0] ?? 'USD'), [to, setTo] = useState(currency);
  const cents = readAmount(amount), result = cents ? Math.round(fromUsd(toUsd(cents, from), to)) : null;
  return (
    <section className="panel p-5" aria-labelledby="convert-h" data-no-motion>
      <h3 id="convert-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Coins className="h-5 w-5 text-indigo-500" aria-hidden />Convert</h3>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <label className={label}>Amount<input value={amount} onChange={(e) => setAmount(e.target.value.slice(0, 16))} inputMode="decimal" className={cn(field, 'tabular-nums')} /></label>
        <label className={label}>From<select value={from} onChange={(e) => setFrom(e.target.value)} className={field}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} className="btn-ghost btn-sm mb-1 p-1.5" aria-label="Swap the currencies"><ArrowRightLeft className="h-4 w-4" aria-hidden /></button>
        <label className={cn(label, 'w-[6.5rem]')}>To<select value={to} onChange={(e) => setTo(e.target.value)} className={field}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <output className="mb-1 ms-auto text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white" aria-live="polite">{result !== null ? cash(result, to) : '–'}</output>
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">At {MONEY_YEAR}’s average rates (World Bank), close enough to plan; your bank’s rate on the day will differ a little.</p>
    </section>
  );
}

/** Rough prices of everyday things in each country of the trip, in the trip's currency. */
function Everyday({ countries, currency }: { countries: string[]; currency: string }) {
  const dn = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(undefined, { type: 'region' }) : null;
  const ccs = [...new Set(countries)];
  return (
    <section className="panel p-5" aria-labelledby="everyday-h" data-no-motion>
      <h3 id="everyday-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ShoppingBag className="h-5 w-5 text-indigo-500" aria-hidden />What things cost there</h3>
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Prices in each country">
        <table className="w-full text-sm" style={{ minWidth: `${7 + ccs.length * 5.5}rem` }}>
          <thead><tr className="text-start text-xs text-zinc-500 dark:text-zinc-400"><th scope="col" className="py-1.5 text-start font-semibold">About</th>{ccs.map((cc) => <th key={cc} scope="col" className="py-1.5 text-end font-semibold">{dn?.of(cc) ?? cc}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-200/70 dark:divide-white/10">
            {EVERYDAY.map(([what, usd]) => (
              <tr key={what}>
                <th scope="row" className="py-2 text-start font-normal text-zinc-700 dark:text-zinc-200">{what}</th>
                {ccs.map((cc) => {
                  const f = Math.min(1.6, Math.max(0.2, priceLevel(cc).level)) ** 0.8, local = currencyOf(cc), there = fromUsd(usd * f, local) * 100;
                  return <td key={cc} className="py-2 text-end tabular-nums text-zinc-900 dark:text-white">{cash(Math.round(fromUsd(usd * f, currency) * 100), currency)}{local !== currency && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{cash(Math.round(there), local)}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Rough guides from each country’s price level (World Bank), not menus: cities and tourist spots cost more.</p>
    </section>
  );
}
