'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { CalendarDays, Loader2, MapPin, ShieldCheck, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathParams } from '@/hooks/usePathParams';
import { errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { addDays, stopDates, type PlanItem, type PlanStop } from '@/lib/travel-plan';
import { clock, timetable, tripToday } from '@/lib/travel-today';
import { Story, tripDayList } from '@/components/travel/trip-journal';

// M248: a trip's family link (public: the unguessable code its travellers turned on). The plan day by day, where they
// are today, their "I'm safe" check-ins and the journal entries they left in; first names only, never an email or a
// phone. Refreshes itself while someone is looking (like Relief's aid tracker).

interface Shared {
  trip: { name: string; startDate: string | null; travellers: number };
  stops: PlanStop[]; items: PlanItem[]; people: string[];
  checkins: { id: string; by: string; note: string | null; place: string | null; at: string }[];
  journal: { id: string; by: string; day: number; text: string | null; photoUrl: string | null; place: string | null }[];
}
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const fmt = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });

export default function View() {
  const code = usePathParams('/journey/[code]')?.code;
  const poll = useActivePoll(60_000);
  const { data, error } = useSWR<Shared>(code ? `/travel/shared/${encodeURIComponent(code)}` : null, fetcher, { shouldRetryOnError: false, refreshInterval: poll });
  return (
    <main className="min-h-[100dvh] overflow-x-hidden px-4 py-8 sm:py-14" style={{ backgroundColor: 'var(--background)' }}>
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-white"><LogoMark className="h-7 w-7" />UniVerse Travel</Link>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Trip for family</span>
        </header>
        {!data && !error && <div className="mt-24 flex flex-col items-center gap-3 text-zinc-600 dark:text-zinc-300" role="status"><Loader2 className="h-7 w-7 animate-spin" aria-hidden />Opening the trip…</div>}
        {error && !data && (
          <section className="card mt-10 text-center" role="alert">
            <p className="font-semibold text-zinc-900 dark:text-white">{errorMessage(error, 'We couldn’t open it just now.')}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">The travellers may have turned the link off or made a new one.</p>
          </section>
        )}
        {data && <Trip d={data} />}
      </div>
    </main>
  );
}

function Trip({ d }: { d: Shared }) {
  const now = useNow();
  const dates = useMemo(() => stopDates(d.trip.startDate, d.stops), [d]);
  const today = useMemo(() => (now ? tripToday(d.trip.startDate, d.stops, d.items, new Date(now)) : null), [d, now]);
  const last = d.checkins[0];
  const from = dates[0]?.from, to = dates[dates.length - 1]?.to;
  return (
    <div className="mt-8 space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-white" translate="no">{d.trip.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
          {from && to && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden />{fmt(from, { day: 'numeric', month: 'short' })} – {fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /><span translate="no">{d.stops.map((s) => nice(s.name)).join(' → ')}</span></span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden /><span translate="no">{d.people.join(', ')}</span></span>
        </p>
      </section>

      <section className="card" aria-labelledby="j-now">
        <h2 id="j-now" className="sr-only">Now</h2>
        {last ? (
          <p className="flex items-start gap-2 text-zinc-800 dark:text-zinc-100"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span><span className="font-semibold" translate="no">{last.by}</span> checked in safe{last.place ? ` in ${last.place}` : ''} {now ? formatDistanceToNow(new Date(last.at), { addSuffix: true }) : ''}.{last.note && <span className="block text-zinc-600 dark:text-zinc-300" translate="no">“{last.note}”</span>}</span></p>
        ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">No check-ins yet.</p>}
        {today?.state === 'during' && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">Today they’re in <span className="font-semibold" translate="no">{nice(d.stops[today.stop].name)}</span> (day {today.day + 1}; {clock(today.now)} there){today.next >= 0 ? <>, next: <span translate="no">{today.slots[today.next].item.name}</span> at {clock(today.slots[today.next].start)}</> : ''}.</p>}
        {today?.state === 'before' && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">The trip starts in {today.days} {today.days === 1 ? 'day' : 'days'}.</p>}
        {today?.state === 'after' && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">This trip is over.</p>}
      </section>

      {d.stops.map((s, i) => (
        <section key={s.id} className="card" aria-labelledby={`j-${s.id}`}>
          <h2 id={`j-${s.id}`} className="text-lg font-semibold text-zinc-900 dark:text-white"><span translate="no">{nice(s.name)}</span>{dates[i].from && <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400"> · {fmt(dates[i].from!)} – {fmt(dates[i].to!)}</span>}</h2>
          <ol className="mt-2 space-y-3">
            {Array.from({ length: s.days }, (_, day) => {
              const slots = timetable(d.items.filter((x) => x.stopId === s.id && x.day === day).sort((a, b) => a.position - b.position));
              return (
                <li key={day}>
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Day {dates[i].offset + day + 1}{dates[i].from ? ` · ${fmt(addDays(dates[i].from!, day))}` : ''}</p>
                  {slots.length ? <ul className="mt-1 space-y-0.5">{slots.map((x) => <li key={x.item.id} className="flex gap-3 text-sm"><span className="w-12 shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{clock(x.start)}</span><span className="text-zinc-800 dark:text-zinc-100" translate="no">{x.item.name}</span></li>)}</ul>
                    : <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Free day.</p>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {d.journal.length > 0 && <section aria-labelledby="j-story"><h2 id="j-story" className="mb-3 text-xl font-semibold text-zinc-900 dark:text-white">Their story</h2><Story stops={d.stops} days={tripDayList(d.stops, d.trip.startDate)} entries={d.journal} /></section>}
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Shared by the travellers from UniVerse Travel. Times are their plan’s, in each city’s own time.</p>
    </div>
  );
}
