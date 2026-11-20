'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, CalendarPlus, Check, Copy, CopyPlus, HeartHandshake, Images, LogOut, Languages, MessagesSquare, Luggage, MapPin, Minus, NotebookPen, Plus, Route, Share2, ShieldCheck, Trash2, Users, Vote, Wallet, WifiOff } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { CURRENCIES, STYLES, STYLE_IDS, fromUsd, money, type Style } from '@/lib/travel-find';
import { tripCover } from '@/lib/travel-ideas';
import { tripFootprint } from '@/lib/travel-footprint';
import type { TravelMode } from '@/lib/green';
import { TripLeg, TripLegTotals, kgText } from './trip-legs';
import { bestOrder, legCostUsd, legLevel, nightsAt, stopDates, tripBudget, tripDays, tripIcs, type PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { Cover, PlaceSearch } from './travel-ui';
import { TripDays, type Move, type TripItem } from './trip-days';
import { TripAdd } from './trip-add';
import { TripGettingThere, TripStays, TripTravellers } from './trip-extras';
import { tripToday } from '@/lib/travel-today';
import { useNow } from '@/lib/use-now';
import { inboxFor } from '@/lib/apps';
import { useAuthStore } from '@/store/auth';
import { readPack } from '@/lib/trip-offline-save';

// A trip in UniVerse Travel's planner (M206, /travel/trip?id=…): its cities in order with their dates
// and how to get between them, each city's days with places dragged into them, the whole trip's budget,
// friends planning it together (an invite link; their changes arrive live) and a calendar file. M215: two
// more parts beside the plan (?part=money|packing): shared costs and settling up, and a packing list.

interface Member { id: string; name: string; avatar: string | null; owner: boolean; zone?: string | null }
export interface TripAnswer {
  trip: { id: string; name: string; startDate: string | null; travellers: number; style: Style; currency: string; updatedAt: string };
  code: string; owner: boolean; ownerId: string; me: string; stops: (PlanStop & { mode?: string | null })[]; items: TripItem[]; members: Member[];
}
// The parts that bring much code or data load only when opened.
// M306: the trip's other parts load when opened (the page opens on Plan): ~100 KB less on first load.
const partLoading = () => <div className="h-72 skeleton rounded-[var(--radius-card)]" />;
const TripMoney = dynamic(() => import('./trip-money').then((m) => m.TripMoney), { ssr: false, loading: partLoading });
const TripPacking = dynamic(() => import('./trip-packing').then((m) => m.TripPacking), { ssr: false, loading: partLoading });
const TripTodos = dynamic(() => import('./trip-todos').then((m) => m.TripTodos), { ssr: false, loading: partLoading });
const TripToday = dynamic(() => import('./trip-today').then((m) => m.TripToday), { ssr: false, loading: partLoading });
const TripJournal = dynamic(() => import('./trip-journal').then((m) => m.TripJournal), { ssr: false, loading: partLoading });
const TripPolls = dynamic(() => import('./trip-polls').then((m) => m.TripPolls), { ssr: false, loading: partLoading });
const TripOffline = dynamic(() => import('./trip-offline').then((m) => m.TripOffline), { ssr: false, loading: partLoading });
const TripJetLag = dynamic(() => import('./trip-jetlag').then((m) => m.TripJetLag), { ssr: false, loading: partLoading });
const TripDocs = dynamic(() => import('./trip-docs').then((m) => m.TripDocs), { ssr: false, loading: partLoading });
const TripHolidays = dynamic(() => import('./trip-holidays').then((m) => m.TripHolidays), { ssr: false, loading: partLoading });
const TripFootprint = dynamic(() => import('./trip-footprint').then((m) => m.TripFootprint), { ssr: false, loading: partLoading });
const TripAlbum = dynamic(() => import('./trip-album').then((m) => m.TripAlbum), { ssr: false, loading: partLoading });
const TripShare = dynamic(() => import('./trip-share').then((m) => m.TripShare), { ssr: false, loading: partLoading });
const TripPlanSheet = dynamic(() => import('./trip-plan').then((m) => m.TripPlanSheet), { ssr: false });
const TripSafety = dynamic(() => import('./trip-safety'), { ssr: false, loading: () => <div className="h-72 skeleton rounded-[var(--radius-card)]" /> });
const TripPhrases = dynamic(() => import('./trip-phrases'), { ssr: false, loading: () => <div className="h-72 skeleton rounded-[var(--radius-card)]" /> });

/** The trip page's parts (?part=…): the plan, then what M215 and M239–M248 added beside it. */
const PARTS = [
  { value: 'plan', label: 'Plan', icon: Route }, { value: 'today', label: 'Today', icon: CalendarClock }, { value: 'polls', label: 'Votes', icon: Vote }, { value: 'journal', label: 'Journal', icon: NotebookPen }, { value: 'album', label: 'Album', icon: Images },
  { value: 'money', label: 'Money', icon: Wallet }, { value: 'packing', label: 'Checklist', icon: Luggage },
  { value: 'phrases', label: 'Phrases', icon: Languages }, { value: 'ready', label: 'Ready', icon: ShieldCheck }, { value: 'share', label: 'Share', icon: HeartHandshake },
] as const;
type Part = (typeof PARTS)[number]['value'];
/** Today's day number on the trip (in the first city's time), or null outside it. */
/** M327: which of a city's days today is (0-based), or null. */
function dayHere(from: string | null, days: number, now: number) {
  if (!from || !now) return null;
  const d = Math.floor((now - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return d >= 0 && d < days ? d : null;
}

function todayIndex(start: string | null, stops: TripAnswer['stops'], now: number) {
  const t = tripToday(start, stops, [], new Date(now));
  return t.state === 'during' ? stopDates(start, stops)[t.stop].offset + t.day : null;
}
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const range = (from: string | null, to: string | null) => {
  if (!from || !to) return null;
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });
  return from === to ? f(from, { day: 'numeric', month: 'short' }) : `${f(from, { day: 'numeric', month: 'short' })} – ${f(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

export function TravelTrip() {
  const sp = useSearchParams(), id = sp.get('id') ?? '', part = PARTS.find((p) => p.value === sp.get('part'))?.value ?? 'plan';
  const router = useRouter();
  const key = id ? `/travel/trips/${id}` : null;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data: live, error, mutate } = useSWR<TripAnswer>(key, fetcher, { refreshInterval, revalidateOnFocus: true });
  // M240: with no signal, the copy saved for offline (if any) stands in, read-only in effect.
  const [saved, setSaved] = useState<{ trip: TripAnswer; at: string } | null>(null);
  useEffect(() => { if (error && id) void readPack<TripAnswer>(id).then((p) => setSaved(p ? { trip: p.trip, at: p.savedAt } : null)); }, [error, id]);
  const data = live ?? (error ? saved?.trip : undefined), offline = !live && !!data;
  const [chosen, setChosen] = useState<string | null>(null);
  const now = useNow();
  const role = useAuthStore((s) => s.user?.role);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);

  const t = data?.trip, stops = useMemo(() => data?.stops ?? [], [data]);
  const stop = stops.find((s) => s.id === chosen) ?? stops[0];
  const dates = useMemo(() => stopDates(t?.startDate ?? null, stops), [t, stops]);
  const budget = useMemo(() => (t && stops.length ? tripBudget(t, stops, data!.items) : null), [t, stops, data]);

  if (error && !data) return (
    <div className="panel mx-auto max-w-xl p-8 text-center">
      <Route className="mx-auto h-8 w-8 text-indigo-500" aria-hidden />
      <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">{(error as Error).message || 'That trip didn’t open.'}</p>
      <Link href="/travel/saved" className="btn-primary mt-5 inline-flex">Your trips</Link>
    </div>
  );
  if (!data || !t) return <div className="space-y-4" aria-busy="true"><div className="h-56 skeleton rounded-[var(--radius-card)]" /><div className="h-72 skeleton rounded-[var(--radius-card)]" /></div>;

  /** Change something and show it at once; the server's answer (and everyone else's) follows. */
  const change = async (next: Partial<TripAnswer> | null, call: () => Promise<unknown>, fail = 'Couldn’t save that.') => {
    try {
      if (next) await mutate({ ...data, ...next }, { revalidate: false });
      await call();
    } catch (e) { toast.error(errorMessage(e, fail)); }
    await mutate();
  };
  const foot = tripFootprint(stops, t.travellers);
  /** M357: how they'll get to a stop from the one before (the same choice as Ready → Footprint; the train logs a Green action). */
  const pickWay = (stopId: string, mode: TravelMode) => change({ stops: stops.map((x) => (x.id === stopId ? { ...x, mode } : x)) }, async () => {
    const { data: r } = await api.patch<{ green: { kg: number } | null }>(`/travel/trips/${t.id}/stops/${stopId}`, { mode, green: mode === 'train' });
    if (r.green) toast.success(`Logged in Green: about ${kgText(r.green.kg)} of CO₂ saved by taking the train.`);
  });
  const setTrip = (patch: Partial<TripAnswer['trip']>) => change({ trip: { ...t, ...patch } }, () => api.patch(`/travel/trips/${t.id}`, patch));
  const total = tripDays(stops), cover = tripCover({ name: t.name, cover: stops[0]?.guide, places: stops.map((x) => x.guide) });
  const when = range(dates[0]?.from ?? null, dates[dates.length - 1]?.to ?? null);
  const invite = typeof window !== 'undefined' ? `${location.origin}/travel/saved?join=${data.code}` : '';

  const addStop = (title: string) => change(null, () => api.post(`/travel/trips/${t.id}/stops`, { guide: title, days: 2 }), 'Couldn’t add that place.');
  const moveStop = (i: number, dir: -1 | 1) => {
    const ids = stops.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    void change({ stops: ids.map((x, position) => ({ ...stops.find((s) => s.id === x)!, position })) }, () => api.post(`/travel/trips/${t.id}/stops/order`, { ids }));
  };
  const reorder = () => {
    const order = bestOrder(stops);
    if (order.every((s, i) => s.id === stops[i].id)) { toast.success('This order is already the shortest.'); return; }
    void change({ stops: order.map((s, position) => ({ ...s, position })) }, () => api.post(`/travel/trips/${t.id}/stops/order`, { ids: order.map((s) => s.id) }));
  };
  const onMove = (moves: Move[], next: TripItem[]) => void change({ items: next }, () => api.post(`/travel/trips/${t.id}/items/move`, { moves }), 'Couldn’t move that place.');
  const calendar = () => {
    const ics = tripIcs(t, stops, data.items);
    if (!ics) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `${t.name.replace(/[^\w\s-]/g, '').trim() || 'trip'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: t.name, text: `Plan “${t.name}” with me on UniVerse Travel`, url: invite }); return; }
      await navigator.clipboard.writeText(invite);
      toast.success('Invite link copied: send it to the friends you’re travelling with.');
    } catch { /* closed the share sheet */ }
  };
  /** M258: the trip's group chat in Messages (made the first time). */
  const chat = async () => {
    try {
      const { data: r } = await api.post<{ conversationId: string }>(`/travel/trips/${t.id}/chat`);
      router.push(`${inboxFor(role)}?c=${encodeURIComponent(r.conversationId)}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t open the chat.')); }
  };
  /** M256: a new trip of my own from this one (cities, days, ways and planned places). */
  const copy = async () => {
    try {
      const { data: r } = await api.post<{ trip: { id: string } }>(`/travel/trips/${t.id}/copy`, {});
      toast.success('Copied: a new trip of your own. Pick its dates.');
      router.push(`/travel/trip?id=${r.trip.id}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t copy the trip.')); }
  };
  const remove = async () => {
    if (!confirm(data.owner ? `Delete “${t.name}” for everyone planning it?` : `Leave “${t.name}”? You can join again with its link.`)) return;
    try { await api.delete(`/travel/trips/${t.id}`); router.push('/travel/saved'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
  };

  return (
    <div className="space-y-6">
      {offline && saved && <p className="panel flex items-center gap-2 p-3 text-sm text-zinc-700 dark:text-zinc-200" role="status"><WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />No signal: this is the copy saved on {new Date(saved.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. Changes need a connection.</p>}
      {/* The trip: its name, when, the cities and who's planning it. */}
      <section className="relative isolate flex min-h-[14rem] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-6 pt-16 sm:p-8 sm:pt-16">
        <Cover {...cover} sizes="100vw" priority className="-z-10" />
        <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/40 to-black/10" aria-hidden />
        <Link href="/travel/saved" className="absolute start-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />Trips</Link>
        <label className="sr-only" htmlFor="trip-name">Trip name</label>
        <input id="trip-name" key={t.name} defaultValue={t.name} maxLength={80} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void setTrip({ name: v }); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-full rounded-lg bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-white/60 focus:bg-black/30 focus:px-2 sm:text-4xl" translate="no" />
        <p className="mt-2 text-sm text-zinc-100">{[when ?? 'Dates not set', `${total} ${total === 1 ? 'day' : 'days'}`, stops.map((s) => nice(s.name)).join(' → ') || 'No places yet'].join(' · ')}</p>
        {/* M287: one row on a phone, sideways, instead of three. */}
        <div className="-mx-6 mt-4 flex items-center gap-2 overflow-x-auto px-6 py-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0 [&>button]:whitespace-nowrap">
          <span className="sr-only">Planning: {data.members.map((m) => m.name).join(', ')}</span>
          <span className="flex -space-x-2 rtl:space-x-reverse" aria-hidden>
            {data.members.slice(0, 6).map((m) => <span key={m.id} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white ring-2 ring-black/40" title={m.name} aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>)}
          </span>
          <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-900"><Share2 className="h-4 w-4" aria-hidden />Invite friends</button>
          <button type="button" onClick={calendar} disabled={!t.startDate || !stops.length} title={t.startDate ? undefined : 'Pick a start date first'} className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25 disabled:opacity-50"><CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar</button>
          <button type="button" onClick={() => void chat()} className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25"><MessagesSquare className="h-4 w-4" aria-hidden />Trip chat</button>
          <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25"><CopyPlus className="h-4 w-4" aria-hidden />Copy trip</button>
        </div>
      </section>

      {/* When, who and how: on the parts they change (the plan's budget, the money's currency) or until there's a start date, M288. */}
      {(part === 'plan' || part === 'money' || !t.startDate) && <section className="panel grid grid-cols-2 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)]" aria-label="Trip details">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Starts
          <input type="date" value={t.startDate ?? ''} onChange={(e) => void setTrip({ startDate: e.target.value || null })} className="mt-1 block w-full min-w-[9rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
        </label>
        <div>
          <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300" id="trip-people">Travellers</span>
          <div className="mt-1 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.05]" role="group" aria-labelledby="trip-people">
            <button type="button" className="btn-ghost btn-sm" aria-label="One traveller fewer" disabled={t.travellers <= 1} onClick={() => void setTrip({ travellers: t.travellers - 1 })}><Minus className="h-4 w-4" aria-hidden /></button>
            <span className="flex-1 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{t.travellers}</span>
            <button type="button" className="btn-ghost btn-sm" aria-label="One traveller more" disabled={t.travellers >= 20} onClick={() => void setTrip({ travellers: t.travellers + 1 })}><Plus className="h-4 w-4" aria-hidden /></button>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Style</span>
          <Segmented className="mt-1" label="Travel style" value={t.style} onChange={(v) => void setTrip({ style: v })} segments={STYLE_IDS.map((s) => ({ value: s, label: STYLES[s].label }))} />
        </div>
        <label className="col-span-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-300 sm:col-span-1">Currency
          <select value={t.currency} onChange={(e) => void setTrip({ currency: e.target.value })} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </section>}

      <Segmented<Part> label="Part of the trip" large className="max-w-full overflow-x-auto" value={part} onChange={(v) => router.replace(`/travel/trip?id=${t.id}${v === 'plan' ? '' : `&part=${v}`}`, { scroll: false })}
        segments={PARTS.map((p) => ({ value: p.value, label: p.label, icon: <p.icon className="h-4 w-4" aria-hidden /> }))} />

      {part === 'share' && <TripShare tripId={t.id} name={t.name} />}
      {part === 'ready' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TripSafety stops={stops} items={data.items} />
        <TripFootprint tripId={t.id} stops={stops} travellers={t.travellers} onChange={() => void mutate()} />
        <TripHolidays stops={stops} dates={dates} />
        <TripDocs tripId={t.id} start={dates[0]?.from ?? null} end={dates[dates.length - 1]?.to ?? null} />
        <TripJetLag tripId={t.id} stops={stops} start={t.startDate} members={data.members} me={data.me} refresh={() => void mutate()} />
        <TripOffline tripId={t.id} trip={data} stops={stops} items={data.items} />
      </div>}
      {part === 'polls' && <TripPolls tripId={t.id} owner={data.owner} ideas={{ place: [...data.items.filter((x) => x.day === null).map((x) => x.name), ...stops.map((s) => nice(s.name))], date: when ? [when] : [] }} />}
      {part === 'journal' && <TripJournal tripId={t.id} stops={stops} start={t.startDate} today={todayIndex(t.startDate, stops, now)} />}
      {part === 'album' && <TripAlbum tripId={t.id} name={t.name} stops={stops} start={t.startDate} today={todayIndex(t.startDate, stops, now)} />}
      {part === 'phrases' && <TripPhrases countries={stops.map((s) => s.cc).filter((c): c is string => !!c)} />}
      {part === 'today' && <TripToday tripId={t.id} start={t.startDate} stops={stops} items={data.items} onAdded={() => void mutate()} />}

      {part === 'money' && <TripMoney tripId={t.id} members={data.members} me={data.me} currency={t.currency} budget={budget?.total ?? null} countries={stops.map((s) => s.cc).filter((c): c is string => !!c)} />}
      {part === 'packing' && <TripTodos tripId={t.id} stops={stops} start={t.startDate} members={data.members} me={data.me} />}
      {part === 'packing' && <TripPacking tripId={t.id} stops={stops.map((s) => ({ guide: s.guide, cc: s.cc, days: s.days }))} start={t.startDate} members={data.members} me={data.me} />}

      {part === 'plan' && <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* The route. */}
        <section className="panel p-5" aria-labelledby="trip-route">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="trip-route" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Route className="h-5 w-5 text-indigo-500" aria-hidden />Route</h3>
            {stops.length >= 3 && <button type="button" onClick={reorder} className="btn-secondary btn-sm">Shortest order</button>}
          </div>
          {!!foot.legs.length && <TripLegTotals minutes={foot.minutes} total={foot.total} greenest={foot.greenest} legs={foot.legs.length} />}
          <ol className="mt-4">
            {stops.map((s, i) => {
              const next = stops[i + 1], fl = next ? foot.legs.find((x) => x.stopId === next.id) : undefined;
              return (
                <li key={s.id} data-key={s.id}>
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
                    {/* M287: on a phone the name and dates keep the row; the day and order buttons go under them. */}
                    <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
                      <Link href={`/travel/guide?d=${encodeURIComponent(s.guide)}`} className="font-semibold text-zinc-900 hover:underline dark:text-white" translate="no">{nice(s.name)}</Link>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{range(dates[i].from, dates[i].to) ?? `Days ${dates[i].offset + 1}–${dates[i].offset + s.days}`}</p>
                    </div>
                    <div className="flex items-center gap-1 max-sm:ms-11" role="group" aria-label={`Days in ${nice(s.name)}`}>
                      <button type="button" className="btn-ghost btn-sm" aria-label={`One day fewer in ${nice(s.name)}`} disabled={s.days <= 1} onClick={() => void change({ stops: stops.map((x) => (x.id === s.id ? { ...x, days: s.days - 1 } : x)) }, () => api.patch(`/travel/trips/${t.id}/stops/${s.id}`, { days: s.days - 1 }))}><Minus className="h-4 w-4" aria-hidden /></button>
                      <span className="w-14 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{s.days} {s.days === 1 ? 'day' : 'days'}</span>
                      <button type="button" className="btn-ghost btn-sm" aria-label={`One day more in ${nice(s.name)}`} disabled={total >= 60} onClick={() => void change({ stops: stops.map((x) => (x.id === s.id ? { ...x, days: s.days + 1 } : x)) }, () => api.patch(`/travel/trips/${t.id}/stops/${s.id}`, { days: s.days + 1 }))}><Plus className="h-4 w-4" aria-hidden /></button>
                    </div>
                    <div className="flex items-center max-sm:ms-auto">
                      <button type="button" className="btn-ghost btn-sm p-1.5" aria-label={`Move ${nice(s.name)} earlier`} disabled={i === 0} onClick={() => moveStop(i, -1)}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                      <button type="button" className="btn-ghost btn-sm p-1.5" aria-label={`Move ${nice(s.name)} later`} disabled={i === stops.length - 1} onClick={() => moveStop(i, 1)}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                      <button type="button" className="btn-ghost btn-sm p-1.5 text-red-600 dark:text-red-400" aria-label={`Take ${nice(s.name)} off the trip`} onClick={() => { if (confirm(`Take ${nice(s.name)} and its planned places off the trip?`)) void change({ stops: stops.filter((x) => x.id !== s.id) }, () => api.delete(`/travel/trips/${t.id}/stops/${s.id}`)); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  </div>
                  {next && (fl ? <TripLeg leg={fl} from={s} to={next} date={dates[i + 1].from} onPick={(mode) => void pickWay(next.id, mode)} price={(mode) => { const v = Math.round(fromUsd(legCostUsd(fl.km, mode, legLevel(s.cc, next.cc), t.travellers), t.currency)); return { value: v, text: money(v, t.currency) }; }} />
                    : <p className="ms-4 border-s-2 border-dashed border-indigo-300/70 py-2 ps-5 text-xs text-zinc-500 dark:border-indigo-400/30 dark:text-zinc-400">How to get there shows once both places are on the map.</p>)}
                </li>
              );
            })}
          </ol>
          <PlaceSearch className={cn(stops.length && 'mt-3')} label="Add a place to the trip" placeholder={stops.length ? 'Add another city or place…' : 'Where to? Search a city, island or park…'} onPick={(title) => void addStop(title)} />
        </section>

        {/* The whole trip's budget. */}
        {budget && <BudgetCard b={budget} travellers={t.travellers} style={t.style} />}
      </div>

      {/* Day by day. */}
      {stop && (
        <section className="panel p-5" aria-labelledby="trip-days">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="trip-days" className="text-lg font-semibold text-zinc-900 dark:text-white">Day by day</h3>
            <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className={cn('btn-sm inline-flex items-center gap-1.5', adding ? 'btn-secondary' : 'btn-primary')}>{adding ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}{adding ? 'Done adding' : 'Add places'}</button>
          </div>
          {stops.length > 1 && <Segmented className="mt-3 max-w-full overflow-x-auto" label="City" value={stop.id} onChange={setChosen} segments={stops.map((s) => ({ value: s.id, label: nice(s.name) }))} />}
          {adding && <div id="trip-add" className="scroll-mt-24"><TripAdd tripId={t.id} stop={stop} items={data.items.filter((x) => x.stopId === stop.id)} onAdded={() => void mutate()} /></div>}
          <div className="mt-4">
            <TripDays key={stop.id} stop={stop} items={data.items.filter((x) => x.stopId === stop.id)} from={dates[stops.indexOf(stop)]?.from ?? null} onMove={onMove}
              today={dayHere(dates[stops.indexOf(stop)]?.from ?? null, stop.days, now)} onAdd={() => { setAdding(true); requestAnimationFrame(() => document.getElementById('trip-add')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }} onMagic={() => setPlanning(true)}
              onStarts={(starts) => void change({ stops: stops.map((x) => (x.id === stop.id ? { ...x, starts: JSON.stringify(starts) } : x)) }, () => api.patch(`/travel/trips/${t.id}/stops/${stop.id}`, { starts }))}
              onDone={(it, done) => void change({ items: data.items.map((x) => (x.id === it.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x)) }, () => api.patch(`/travel/trips/${t.id}/items/${it.id}`, { done }))}
              onTime={(it, minutes) => void change({ items: data.items.map((x) => (x.id === it.id ? { ...x, minutes } : x)) }, () => api.patch(`/travel/trips/${t.id}/items/${it.id}`, { minutes }))}
              onRemove={(it) => void change({ items: data.items.filter((x) => x.id !== it.id) }, () => api.delete(`/travel/trips/${t.id}/items/${it.id}`))} />
          </div>
          {planning && <TripPlanSheet tripId={t.id} stop={stop} items={data.items} onClose={() => setPlanning(false)} onDone={() => void mutate()} />}
        </section>
      )}
      {/* M207: there and back, where to stay, who else is there. */}
      {stop && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          <TripGettingThere stops={stops} start={dates[0]?.from ?? null} end={dates[dates.length - 1]?.to ?? null} />
          <TripStays key={`stay-${stop.id}`} stop={stop} from={dates[stops.indexOf(stop)]?.from ?? null} nights={nightsAt(stops)[stops.indexOf(stop)]} travellers={t.travellers} style={t.style} currency={t.currency} />
          <TripTravellers key={`board-${stop.id}`} stop={stop} from={dates[stops.indexOf(stop)]?.from ?? null} to={dates[stops.indexOf(stop)]?.to ?? null} />
        </div>
      )}
      {!stops.length && (
        <div className="panel p-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-indigo-500" aria-hidden />
          <p className="mt-3 font-semibold text-zinc-900 dark:text-white">Add the first place above: a city, an island, a national park.</p>
        </div>
      )}

      {/* Who's planning it. */}
      <section className="panel p-5" aria-labelledby="trip-people-h">
        <h3 id="trip-people-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Users className="h-5 w-5 text-indigo-500" aria-hidden />Planning together</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Anyone with the link can join and plan with you; everyone sees changes as they happen.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 max-w-full truncate rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200">{invite}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(invite).then(() => toast.success('Invite link copied'))} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Copy className="h-4 w-4" aria-hidden />Copy link</button>
          {data.owner && <button type="button" onClick={() => void change(null, () => api.post(`/travel/trips/${t.id}/code`).then(() => toast.success('New link made: the old one no longer works.')))} className="btn-ghost btn-sm">New link</button>}
        </div>
        <ul className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/10">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-700 dark:text-indigo-300" aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{m.name}{m.id === data.me && <span className="font-normal text-zinc-500 dark:text-zinc-400"> (you)</span>}{m.owner && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · started it</span>}</span>
              {data.owner && !m.owner && <button type="button" onClick={() => { if (confirm(`Take ${m.name} off this trip?`)) void change({ members: data.members.filter((x) => x.id !== m.id) }, () => api.delete(`/travel/trips/${t.id}/members/${m.id}`)); }} className="btn-ghost btn-sm text-red-600 dark:text-red-400">Remove</button>}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void remove()} className="btn-ghost btn-sm mt-3 inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">{data.owner ? <><Trash2 className="h-4 w-4" aria-hidden />Delete this trip</> : <><LogOut className="h-4 w-4" aria-hidden />Leave this trip</>}</button>
      </section>
      </>}
    </div>
  );
}

function BudgetCard({ b, travellers, style }: { b: NonNullable<ReturnType<typeof tripBudget>>; travellers: number; style: Style }) {
  const parts = [
    { label: 'Stays', v: b.stay }, { label: 'Food', v: b.food }, { label: 'Getting around', v: b.local },
    { label: 'Between places', v: b.between }, { label: 'Tickets', v: b.tickets },
  ];
  const sum = Math.max(1, b.total);
  return (
    <section className="panel p-5" aria-labelledby="trip-budget">
      <h3 id="trip-budget" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Wallet className="h-5 w-5 text-indigo-500" aria-hidden />Budget</h3>
      <div className="mt-3 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{money(b.total, b.currency)}</div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{travellers > 1 ? `${money(b.perPerson, b.currency)} each for ${travellers} travellers` : 'for one traveller'} · {STYLES[style].label.toLowerCase()}</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden>
        {parts.map((p, i) => <span key={p.label} className="h-full bg-indigo-500 transition-[flex-grow] duration-300 ease-[var(--ease-glide)]" style={{ flexGrow: p.v / sum, opacity: 1 - i * 0.17 }} />)}
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" style={{ opacity: 1 - i * 0.17 }} aria-hidden />
            <dt className="flex-1 text-zinc-600 dark:text-zinc-300">{p.label}</dt>
            <dd className="font-semibold tabular-nums text-zinc-900 dark:text-white">{money(p.v, b.currency)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        An estimate: stays, food and getting around from each country’s price level for {STYLES[style].about}; a place to sleep’s own price when you add one; tickets from the prices the guides list{b.unpriced ? ` (${b.unpriced} ${b.unpriced === 1 ? 'place has' : 'places have'} no price listed)` : ''}. Not counting getting there from home.{b.guessed ? ' Some prices are rough guesses.' : ''}
      </p>
    </section>
  );
}
