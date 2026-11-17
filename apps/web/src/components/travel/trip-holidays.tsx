'use client';

import useSWR from 'swr';
import { CalendarHeart, PartyPopper, Store } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { closes, festivalLines, holidaysOn, holidaysUrl, monthsOf, yearsOf, type Holiday } from '@/lib/travel-holidays';
import type { PlanStop } from '@/lib/travel-plan';

// M246: holidays and events on the trip's dates (the trip page's Ready part): each city's public holidays while
// you're there (Nager.Date, free, read straight by the browser: no Worker CPU) with what may close, and the festivals
// its guide mentions, those in your months first.

const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const nager = async (url: string) => { const r = await fetch(url); if (r.status === 204 || r.status === 404) return []; if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as Holiday[]; };

export function TripHolidays({ stops, dates }: { stops: PlanStop[]; dates: { from: string | null; to: string | null }[] }) {
  const places = stops.map((s, i) => ({ s, from: dates[i]?.from, to: dates[i]?.to })).filter((p): p is { s: PlanStop; from: string; to: string } => !!p.from && !!p.to);
  return (
    <section className="panel p-5" aria-labelledby="hol-h">
      <h3 id="hol-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><CalendarHeart className="h-5 w-5 text-indigo-500" aria-hidden />Holidays and events</h3>
      {!places.length ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Pick the start date to see the public holidays and festivals on your days.</p>
        : <div className="mt-3 space-y-4">{places.map((p) => <Place key={p.s.id} stop={p.s} from={p.from} to={p.to} />)}</div>}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Holidays: Nager.Date. Festivals: the city’s guide on Wikivoyage (CC BY-SA). Check local listings for exact dates.</p>
    </section>
  );
}

function Place({ stop, from, to }: { stop: PlanStop; from: string; to: string }) {
  const years = yearsOf(from, to);
  const { data: hol, error } = useSWR<Holiday[]>(stop.cc ? ['nager', stop.cc, ...years].join(':') : null, () => Promise.all(years.map((y) => nager(holidaysUrl(y, stop.cc!)))).then((l) => l.flat()), { revalidateOnFocus: false, dedupingInterval: 3_600_000 });
  const { data: g } = useSWR<{ guide: { sections: { part: string; text: string[]; listings: { text?: string; name: string }[] }[]; summary: string[] } }>(`/travel/guide?d=${encodeURIComponent(stop.guide)}`, fetcher, { revalidateOnFocus: false });
  const on = hol ? holidaysOn(hol, from, to) : [];
  const texts = g ? [...g.guide.summary, ...g.guide.sections.flatMap((s) => [...s.text, ...s.listings.map((l) => [l.name, l.text].filter(Boolean).join(': '))])] : [];
  const fests = festivalLines(texts, monthsOf(from, to));
  return (
    <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
      <p className="font-semibold text-zinc-900 dark:text-white"><span translate="no">{nice(stop.name)}</span> <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">· {day(from)} – {day(to)}</span></p>
      {!stop.cc ? null : error ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">The holiday list didn’t load.</p> : !hol ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400" role="status">Checking holidays…</p>
        : on.length ? (
          <ul className="mt-2 space-y-2">
            {on.map((h) => (
              <li key={h.date + h.name} className="flex gap-2 text-sm">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span><span className="font-semibold text-zinc-900 dark:text-white">{day(h.date)}: {h.name}</span>{h.localName !== h.name && <span className="text-zinc-600 dark:text-zinc-300" translate="no"> ({h.localName})</span>}<span className="block text-zinc-600 dark:text-zinc-300">{closes(h)}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">No public holidays on your days.</p>}
      {fests.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {fests.map((f) => <li key={f.text} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-200"><PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden /><span translate="no">{f.text}{!f.inMonth && <span className="text-xs text-zinc-500 dark:text-zinc-400"> (date not given)</span>}</span></li>)}
        </ul>
      )}
    </div>
  );
}
