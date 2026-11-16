'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BedDouble, Flag, Loader2, MessageSquare, PlaneTakeoff, ShieldOff, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { inboxFor } from '@/lib/apps';
import { useAuthStore } from '@/store/auth';
import { betweenLinks, bookingLinks, hostelLink } from '@/lib/travel-book';
import { currencyOf, dailyCost, fromUsd, money, toUsd, type Style } from '@/lib/travel-find';
import type { Guide } from '@/lib/travel-guide';
import { addDays, readPrice, type PlanStop } from '@/lib/travel-plan';
import { priceBand } from '@/lib/travel-tips';
import { useHome } from './travel-ui';

// The rest of the owner's Airbnb list on a trip (M207, items 5 and 6): getting there from home and back,
// places to stay compared by the guide's price bands with hostels beside hotels, and the travellers
// board (adults who choose to show they'll be in the same city on the same dates).

const FROM_KEY = 'uv-travel-from';
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Where the person sets off from (kept on this device). */
function useFrom(): [string, (v: string) => void] {
  const [typed, setTyped] = useState<string | null>(null);
  const kept = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(FROM_KEY) ?? ''; } catch { return ''; } }, () => '');
  return [typed ?? kept, (v) => { setTyped(v); try { localStorage.setItem(FROM_KEY, v); } catch { /* private mode */ } }];
}

export function TripGettingThere({ stops, start, end }: { stops: PlanStop[]; start: string | null; end: string | null }) {
  const [from, setFrom] = useFrom();
  const [home] = useHome();
  const first = stops[0], last = stops[stops.length - 1];
  if (!first) return null;
  const me = { name: from.trim(), cc: home };
  const out = me.name ? betweenLinks(me, first, { date: start }) : [], back = me.name ? betweenLinks(last, me, { date: end ? addDays(end, 1) : null }) : [];
  return (
    <section className="panel p-5" aria-labelledby="trip-there">
      <h3 id="trip-there" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><PlaneTakeoff className="h-5 w-5 text-sky-500" aria-hidden />Getting there and back</h3>
      <label className="mt-3 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Setting off from
        <input value={from} onChange={(e) => setFrom(e.target.value.slice(0, 80))} placeholder="Your city: London, Mumbai, Toronto…" className={field} />
      </label>
      {me.name ? (
        <div className="mt-4 space-y-3">
          {[{ title: `${me.name} → ${nice(first.name)}`, when: start, links: out }, { title: `${nice(last.name)} → ${me.name}`, when: end ? addDays(end, 1) : null, links: back }].map((w) => (
            <div key={w.title}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{w.title}{w.when && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {short(w.when)}</span>}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {w.links.map((l) => <a key={l.partner} href={l.url} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title={`Opens ${l.partner}`}>{l.label}<span className="text-xs text-zinc-500 dark:text-zinc-400">· {l.partner}</span></a>)}
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Type where you set off from for flights, trains and buses there and back.</p>}
    </section>
  );
}

/** Places to stay in a city: the guide's own, by price band, against the trip's estimate; hostels and hotels to book. */
export function TripStays({ stop, from, nights, travellers, style, currency }: { stop: PlanStop; from: string | null; nights: number; travellers: number; style: Style; currency: string }) {
  const { data } = useSWR<{ guide: Guide }>(`/travel/guide?d=${encodeURIComponent(stop.guide)}`, fetcher, { revalidateOnFocus: false });
  const local = currencyOf(stop.cc ?? 'US');
  const bands = useMemo(() => {
    const sleep = (data?.guide.sections ?? []).filter((s) => s.part === 'sleep').flatMap((s) => s.listings);
    return (['budget', 'mid', 'splurge'] as const).map((b) => {
      const list = sleep.filter((l) => priceBand(l.group) === b);
      const prices = list.map((l) => readPrice(l.price, local)).filter((p): p is { amount: number; currency: string } => !!p && p.amount > 0).map((p) => fromUsd(toUsd(p.amount, p.currency), currency));
      return { band: b, n: list.length, low: prices.length ? Math.min(...prices) : null, examples: list.slice(0, 3).map((l) => l.name) };
    });
  }, [data, local, currency]);
  const per = fromUsd(dailyCost(stop.cc ?? 'US', style).stay, currency);
  const out = from ? addDays(from, Math.max(1, nights)) : undefined;
  const hotels = bookingLinks(stop.guide, { checkin: from ?? undefined, checkout: out, adults: travellers }).find((b) => b.kind === 'stay')!;
  const LABEL = { budget: 'Budget (hostels, guesthouses)', mid: 'Mid-range', splurge: 'Splurge' } as const;
  return (
    <section className="panel p-5" aria-labelledby="trip-stays">
      <h3 id="trip-stays" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><BedDouble className="h-5 w-5 text-sky-500" aria-hidden /><span>Where to stay in <span translate="no">{nice(stop.name)}</span></span></h3>
      <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Our estimate for your style: about <strong className="text-zinc-900 dark:text-white">{money(per, currency)}</strong> a night each{nights ? `, ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}.</div>
      <ul className="mt-3 space-y-2">
        {bands.filter((b) => b.n).map((b) => (
          <li key={b.band} className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
            <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-zinc-900 dark:text-white">{LABEL[b.band]}</span><span className="text-zinc-600 dark:text-zinc-300">{b.n} in the guide{b.low !== null ? ` · from ${money(b.low, currency)}` : ''}</span></div>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{b.examples.join(' · ')}</p>
          </li>
        ))}
        {data && !bands.some((b) => b.n) && <li className="text-sm text-zinc-600 dark:text-zinc-300">The guide doesn’t sort its places to stay by price here.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <a href={hostelLink(stop.name)} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title="Opens Hostelworld">Hostels<span className="text-xs text-zinc-500 dark:text-zinc-400">· Hostelworld</span></a>
        <a href={hotels.url} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title="Opens Booking.com">Hotels and flats{from && out ? ` · ${short(from)}–${short(out)}` : ''}<span className="text-xs text-zinc-500 dark:text-zinc-400">· Booking.com</span></a>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Add a place from the guide’s Sleep list to the trip and its own price replaces the estimate in the budget.</p>
    </section>
  );
}

interface Board { mine: { id: string; fromDate: string; toDate: string; note: string | null; hidden: boolean } | null; people: { id: string; name: string; fromDate: string; toDate: string; note: string | null }[]; count: number }

/** Travellers on the board for this city whose dates overlap (adults who chose to show up). */
export function TripTravellers({ stop, from, to }: { stop: PlanStop; from: string | null; to: string | null }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const key = from && to ? `/travel/board?guide=${encodeURIComponent(stop.guide)}&from=${from}&to=${to}` : null;
  const { data, error, mutate } = useSWR<Board>(key, fetcher);
  const [note, setNote] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, what: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try { await what(); if (ok) toast.success(ok); await mutate(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } finally { setBusy(null); }
  };
  const message = (id: string) => act(id, async () => {
    const { data: r } = await api.post<{ conversationId: string }>(`/travel/board/${id}/message`);
    router.push(`${inboxFor(role)}?c=${encodeURIComponent(r.conversationId)}`);
  });

  return (
    <section className="panel p-5" aria-labelledby="trip-board">
      <h3 id="trip-board" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Users className="h-5 w-5 text-sky-500" aria-hidden /><span>Travellers in <span translate="no">{nice(stop.name)}</span></span></h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Adults who choose to show they’re in the same city on the same dates. Only your first name, your dates and your note are shown, only to others on the board.</p>
      {!key ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Set the trip’s start date to see who else will be there.</p>
        : error ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{(error as Error).message}</p>
        : !data ? <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Looking…</p>
        : !data.mine ? (
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void act('join', () => api.post('/travel/board', { guide: stop.guide, from, to, note, adult }), 'You’re on the board for these dates.'); }}>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{data.count ? `${data.count} ${data.count === 1 ? 'traveller is' : 'travellers are'} on the board for ${short(from!)}–${short(to!)}.` : `Nobody is on the board for ${short(from!)}–${short(to!)} yet.`}</p>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">A short note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Up for a food tour or a day hike" className={field} />
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4" />I’m 18 or over, and I’ll meet people in public places.</label>
            <button type="submit" disabled={!adult || busy === 'join'} className="btn-primary btn-sm inline-flex items-center gap-1.5">{busy === 'join' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Show me on the board</button>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
              <span>You’re on the board: {short(data.mine.fromDate)}–{short(data.mine.toDate)}{data.mine.hidden ? ' (hidden after reports)' : ''}</span>
              <button type="button" disabled={busy === 'leave'} onClick={() => void act('leave', () => api.delete(`/travel/board/${data.mine!.id}`), 'You’re off the board.')} className="btn-ghost btn-sm">Take me off</button>
            </div>
            {!data.people.length ? <p className="text-sm text-zinc-600 dark:text-zinc-300">No one else yet: check back closer to the day.</p> : (
              <ul className="divide-y divide-zinc-200/70 dark:divide-white/10">
                {data.people.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 dark:text-white"><span translate="no">{p.name}</span> <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">{short(p.fromDate)}–{short(p.toDate)}</span></p>
                      {p.note && <p className="text-sm text-zinc-600 dark:text-zinc-300" translate="no">{p.note}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" disabled={!!busy} onClick={() => void message(p.id)} className="btn-secondary btn-sm inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" aria-hidden />Message</button>
                      <button type="button" disabled={!!busy} onClick={() => { const reason = prompt(`What’s wrong with ${p.name}’s post?`); if (reason !== null) void act(p.id, () => api.post(`/travel/board/${p.id}/report`, { reason }), 'Thanks: it’s reported. Three reports hide a post.'); }} className="btn-ghost btn-sm inline-flex items-center gap-1"><Flag className="h-4 w-4" aria-hidden />Report</button>
                      <button type="button" disabled={!!busy} onClick={() => { if (confirm(`Block ${p.name}? You won’t see each other on the board.`)) void act(p.id, () => api.post(`/travel/board/${p.id}/block`), `${p.name} is blocked.`); }} className="btn-ghost btn-sm inline-flex items-center gap-1 text-red-600 dark:text-red-400"><ShieldOff className="h-4 w-4" aria-hidden />Block</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => void act('unblock', () => api.delete('/travel/blocks'), 'Everyone you blocked here is unblocked.')} className="btn-ghost btn-sm text-xs">Unblock everyone I blocked</button>
          </div>
        )}
    </section>
  );
}
