'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarClock, Clock, Footprints, LocateFixed, MapPin, Navigation, PlaneLanding, Sun, Sunrise, Sunset, TramFront, Umbrella } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { indoorIdeas, outdoors, wet } from '@/lib/travel-rain';
import { tripHoursIssues } from '@/lib/travel-hours';
import type { Guide, Listing } from '@/lib/travel-guide';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { useNow } from '@/lib/use-now';
import { distance, duration } from '@/lib/map-tools';
import { arrival, clock, dayLight, tripToday, type Slot } from '@/lib/travel-today';
import type { PlanItem, PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { useRoutes, type Spot } from './map/MapTools';
import { sky } from './travel-ui';

// M239: a trip's Today mode (the trip page's "Today" part): on a day of the trip, in the city's own time, what's
// on now, the next place and when to leave for it, the walk there along real streets (the map's own router,
// M237), the weather now and what comes after. Before the trip it previews any day of it.

interface WeatherDay { date: string; min: number; max: number; symbol: string | null; rain: number }
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const at = (i: PlanItem): Spot | null => (i.lat !== null && i.lon !== null ? { lat: i.lat, lon: i.lon, name: i.name } : null);

export function TripToday({ tripId, start, stops, items, onAdded }: { tripId: string; start: string | null; stops: PlanStop[]; items: PlanItem[]; onAdded: () => void }) {
  const now = useNow();
  const [pick, setPick] = useState<{ stop: number; day: number } | null>(null);
  const live = useMemo(() => tripToday(start, stops, items, new Date(now)), [start, stops, items, now]);
  const issues = useMemo(() => tripHoursIssues(start, stops, items), [start, stops, items]);
  const shown = useMemo(() => (pick ? tripToday(start, stops, items, new Date(now), pick) : live), [pick, live, start, stops, items, now]);

  if (live.state === 'empty') return <Empty text="Add a place to the trip first: Today shows each day’s plan as you go." />;
  if (live.state === 'nodates') return <Empty text="Pick the start date above: Today then shows the day’s plan, when to leave and the walk there." />;

  const days = stops.flatMap((s, i) => Array.from({ length: s.days }, (_, d) => ({ stop: i, day: d, label: `${nice(s.name)} · day ${d + 1}` })));
  const value = shown.state === 'during' ? `${shown.stop}:${shown.day}` : '';
  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center gap-3 p-5" aria-label="Which day">
        <CalendarClock className="h-5 w-5 text-indigo-500" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
          {live.state === 'before' && `The trip starts in ${live.days} ${live.days === 1 ? 'day' : 'days'}. Here’s how a day will run.`}
          {live.state === 'after' && 'This trip is over. Look back at any day.'}
          {live.state === 'during' && !pick && `Today is day ${live.day + 1} in ${nice(stops[live.stop].name)}. It’s ${clock(live.now)} there.`}
          {live.state === 'during' && pick && 'Looking at another day.'}
        </p>
        <label className="text-sm"><span className="sr-only">Show the plan of</span>
          <select value={value} onChange={(e) => { const [s, d] = e.target.value.split(':').map(Number); setPick({ stop: s, day: d }); }} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
            {!value && <option value="">Pick a day</option>}
            {days.map((d) => <option key={`${d.stop}:${d.day}`} value={`${d.stop}:${d.day}`}>{d.label}</option>)}
          </select>
        </label>
        {pick && live.state === 'during' && <button type="button" className="btn-secondary btn-sm" onClick={() => setPick(null)}>Back to today</button>}
      </section>
      {issues.length > 0 && (
        <section className="panel p-5" aria-labelledby="today-hours">
          <h3 id="today-hours" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />Opening hours</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{issues.length === 1 ? 'One place' : `${issues.length} places`} may not be open when the plan has you there. Move {issues.length === 1 ? 'it' : 'them'} to another day or time on the Plan.</p>
          <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/10">
            {issues.slice(0, 8).map((x) => (
              <li key={`${x.item.id}-${x.date}`} className="py-2 text-sm">
                <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{x.item.name}</span> <span className="text-amber-800 dark:text-amber-300">{x.problem}</span>
                <span className="block text-zinc-600 dark:text-zinc-300">{new Date(`${x.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} at {clock(x.start)} · hours: <span translate="no">{x.hours}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {shown.state !== 'during'
        ? <Empty text="Pick a day to see its plan." />
        : <Day key={`${shown.stop}:${shown.day}`} tripId={tripId} stop={stops[shown.stop]} t={shown} live={!pick && live.state === 'during'} onAdded={onAdded} />}
    </div>
  );
}

function Day({ tripId, stop, t, live, onAdded }: { tripId: string; stop: PlanStop; t: Extract<ReturnType<typeof tripToday>, { state: 'during' }>; live: boolean; onAdded: () => void }) {
  const next = t.next >= 0 ? t.slots[t.next] : null, current = t.current >= 0 ? t.slots[t.current] : null;
  const from = next && t.next > 0 ? t.slots[t.next - 1] : null;
  const { data: weather } = useSWR<{ days: WeatherDay[] }>(stop.lat !== null && stop.lon !== null ? `/travel/weather?lat=${stop.lat.toFixed(2)}&lon=${stop.lon.toFixed(2)}` : null, fetcher, { revalidateOnFocus: false });
  const w = weather?.days.find((d) => d.date === t.date);
  const W = w ? sky(w.symbol) : null;
  const light = dayLight(stop, t.date), photoSpot = t.slots.map((x) => x.item).find((i) => outdoors(i))?.name;
  if (!t.slots.length) return <Empty text={`Nothing is planned for this day in ${nice(stop.name)} yet. Add places on the Plan.`} />;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        {t.day === 0 && <Arrival stop={stop} />}
        {live && (current || next) && (
          <section className="panel p-5" aria-labelledby="today-next">
            {current && <p className="text-sm text-zinc-600 dark:text-zinc-300">Now: <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{current.item.name}</span> until {clock(current.end)}</p>}
            {next && <>
              <h3 id="today-next" className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white"><span className="text-zinc-500 dark:text-zinc-400">Next: </span><span translate="no">{next.item.name}</span></h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700 dark:text-zinc-200">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-indigo-500" aria-hidden />At {clock(next.start)}</span>
                {t.leaveAt !== null && <span className={cn('inline-flex items-center gap-1.5 font-semibold', t.leaveAt <= t.now ? 'text-amber-700 dark:text-amber-300' : '')}><Navigation className="h-4 w-4 text-indigo-500" aria-hidden />{t.leaveAt <= t.now ? 'Leave now' : `Leave at ${clock(t.leaveAt)}`}</span>}
              </p>
            </>}
            {!next && <h3 id="today-next" className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">That’s the last place today.</h3>}
          </section>
        )}
        {live && !current && !next && <Empty text="Today’s plan is done. Enjoy the evening." />}
        {next && at(next.item) && <WalkThere key={next.item.id} to={at(next.item)!} from={from ? at(from.item) : null} />}
        {!live && t.slots[0] && at(t.slots[0].item) && <WalkThere key={t.slots[0].item.id} to={at(t.slots[0].item)!} from={null} />}
      </div>
      <div className="space-y-6">
        <section className="panel p-5" aria-labelledby="today-weather">
          <h3 id="today-weather" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Sun className="h-5 w-5 text-indigo-500" aria-hidden />Weather</h3>
          {W && w ? (
            <div className="mt-3 flex items-center gap-3">
              <W.icon className="h-9 w-9 text-indigo-500" aria-hidden />
              <div><p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{Math.round(w.max)}° <span className="text-base text-zinc-500 dark:text-zinc-400">/ {Math.round(w.min)}°</span></p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{W.words}{w.rain >= 1 ? ` · ${w.rain.toFixed(1)} mm of rain: take an umbrella` : ''}</p></div>
            </div>
          ) : <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">The forecast reaches about a week ahead; this day isn’t in it yet.</p>}
          {light && (
            <div className="mt-4 border-t border-zinc-200/70 pt-3 text-sm dark:border-white/10" aria-label="Daylight">
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-700 dark:text-zinc-200"><span className="inline-flex items-center gap-1.5"><Sunrise className="h-4 w-4 text-amber-500" aria-hidden />{light.rise}</span><span className="inline-flex items-center gap-1.5"><Sunset className="h-4 w-4 text-amber-600" aria-hidden />{light.set}</span><span className="text-zinc-500 dark:text-zinc-400">{Math.floor(light.minutes / 60)} h {light.minutes % 60} min of daylight</span></p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">Golden hours for photos: {light.morning[0]}–{light.morning[1]} and {light.evening[0]}–{light.evening[1]}{photoSpot ? <>, perhaps at <span translate="no">{photoSpot}</span></> : ''}.</p>
            </div>
          )}
        </section>
        {wet(w) && <RainPlan tripId={tripId} stop={stop} day={t.day} slots={t.slots} onAdded={onAdded} />}
        <section className="panel p-5" aria-labelledby="today-plan">
          <h3 id="today-plan" className="text-lg font-semibold text-zinc-900 dark:text-white">The day</h3>
          <ol className="mt-3 space-y-1">{t.slots.map((s, i) => <SlotRow key={s.item.id} s={s} state={i === t.current ? 'now' : live && s.end <= t.now ? 'done' : i === t.next ? 'next' : null} />)}</ol>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">From 9:00, with each place’s time and the way between. Change the order or the time on the Plan.</p>
        </section>
      </div>
    </div>
  );
}

function SlotRow({ s, state }: { s: Slot; state: 'now' | 'done' | 'next' | null }) {
  return (
    <li className={cn('rounded-xl px-3 py-2', state === 'now' && 'bg-indigo-500/10', state === 'next' && 'ring-1 ring-indigo-500/40')}>
      {s.travel > 0 && <p className="flex items-center gap-1.5 pb-1 text-xs text-zinc-500 dark:text-zinc-400">{s.walk ? <Footprints className="h-3.5 w-3.5" aria-hidden /> : <TramFront className="h-3.5 w-3.5" aria-hidden />}{s.travel} min {s.walk ? 'walk' : 'by metro, bus or taxi'}</p>}
      <div className="flex items-baseline gap-3">
        <span className={cn('w-12 shrink-0 text-sm font-semibold tabular-nums', state === 'done' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white')}>{clock(s.start)}</span>
        <span className={cn('min-w-0 flex-1 text-sm', state === 'done' ? 'text-zinc-500 line-through dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-100')} translate="no">{s.item.name}</span>
        {state === 'now' && <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Now</span>}
        {state === 'next' && <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Next</span>}
      </div>
    </li>
  );
}

/** The walk to a place along real streets (FOSSGIS's walking router, as the map's directions), from the place
 *  before it or, when asked, from where you are. */
function WalkThere({ to, from }: { to: Spot; from: Spot | null }) {
  const [me, setMe] = useState<Spot | null>(null), [locating, setLocating] = useState(false);
  const start = me ?? from;
  const { routes, loading, failed } = useRoutes(start ? { from: start, to, mode: 'foot', chosen: 0, via: [], avoid: '' } : null);
  const r = routes[0];
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setMe({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'Where you are' }); setLocating(false); }, () => setLocating(false), { enableHighAccuracy: true, timeout: 10_000 });
  };
  return (
    <section className="panel p-5" aria-labelledby="today-walk">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="today-walk" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Footprints className="h-5 w-5 text-indigo-500" aria-hidden />The walk there</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={locate} disabled={locating} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />{locating ? 'Finding you…' : 'From where I am'}</button>
          <Link href={`/travel?view=map&at=${to.lat.toFixed(5)},${to.lon.toFixed(5)},16&pin=1`} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />On the map</Link>
        </div>
      </div>
      {!start && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">It’s the day’s first place: press “From where I am” for the walk from where you’re staying.</p>}
      {start && loading && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">Finding the way from {start.name}…</p>}
      {start && !loading && failed && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">The walking route didn’t load (no signal?). Open it on the map instead.</p>}
      {r && <>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">From <span translate="no">{start!.name}</span>: <span className="font-semibold text-zinc-900 dark:text-white">{duration(r.minutes)}</span> · {distance(r.km)}</p>
        <ol className="mt-3 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
          {r.steps.filter((s) => s.km > 0 || s.text === 'You have arrived').slice(0, 12).map((s, i) => <li key={i} className="flex gap-3"><span className="w-14 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{s.km ? distance(s.km) : ''}</span><span>{s.text}</span></li>)}
        </ol>
      </>}
    </section>
  );
}

/** M252: the first day in a city: how to get in from the airport or station, and how to get around. */
function Arrival({ stop }: { stop: PlanStop }) {
  const { data } = useSWR<{ guide: Guide; tips?: { transit?: string[] } | null }>(`/travel/guide?d=${encodeURIComponent(stop.guide)}`, fetcher, { revalidateOnFocus: false });
  const a = data ? arrival(data.guide, data.tips) : null;
  if (a && !a.getIn.length && !a.around.length) return null;
  return (
    <section className="panel p-5" aria-labelledby="today-arrive">
      <h3 id="today-arrive" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><PlaneLanding className="h-5 w-5 text-indigo-500" aria-hidden />Arriving in <span translate="no">{nice(stop.name)}</span></h3>
      {!a ? <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400" role="status">Opening the guide…</p> : (
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200" translate="no">
          {a.getIn.length > 0 && <div><p className="font-semibold text-zinc-900 dark:text-white">Getting in</p>{a.getIn.map((p, i) => <p key={i} className="mt-1">{p}</p>)}</div>}
          {a.around.length > 0 && <div><p className="font-semibold text-zinc-900 dark:text-white">Getting around</p>{a.around.map((p, i) => <p key={i} className="mt-1">{p}</p>)}</div>}
          {a.card && <p className="rounded-xl bg-indigo-500/10 p-3 text-zinc-800 dark:text-zinc-100">{a.card}</p>}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">From the city’s guide on Wikivoyage (CC BY-SA). Saved for offline with the trip.</p>
    </section>
  );
}

/** M249: on a wet day, the day's outdoor places and indoor ones from the guide to add instead. */
function RainPlan({ tripId, stop, day, slots, onAdded }: { tripId: string; stop: PlanStop; day: number; slots: Slot[]; onAdded: () => void }) {
  const { data } = useSWR<{ guide: Guide }>(`/travel/guide?d=${encodeURIComponent(stop.guide)}`, fetcher, { revalidateOnFocus: false });
  const [added, setAdded] = useState<string[]>([]);
  const out = slots.filter((s) => outdoors(s.item)).map((s) => s.item.name);
  const ideas = data ? indoorIdeas(data.guide.sections.flatMap((s) => s.listings), slots.map((s) => s.item)) : [];
  const add = async (l: Listing) => {
    try {
      await api.post(`/travel/trips/${tripId}/items`, { stopId: stop.id, day, name: l.name, kind: l.kind, lat: l.lat, lon: l.lon, hours: l.hours, price: l.price, note: l.text?.slice(0, 600), address: l.address, url: l.url });
      setAdded((a) => [...a, l.name]); toast.success(`${l.name} added to this day.`); onAdded();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add that place.')); }
  };
  return (
    <section className="panel p-5" aria-labelledby="today-rain">
      <h3 id="today-rain" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Umbrella className="h-5 w-5 text-indigo-500" aria-hidden />Rain plan</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{out.length ? <>Rain is forecast. Outdoors today: <span translate="no">{out.join(', ')}</span>. Move {out.length === 1 ? 'it' : 'them'} to a drier day on the Plan, or add somewhere indoors:</> : 'Rain is forecast, but today’s places are mostly indoors. Somewhere else indoors nearby:'}</p>
      {!data ? <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400" role="status">Looking for indoor places…</p> : ideas.length ? (
        <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/10">
          {(ideas as Listing[]).map((l) => (
            <li key={l.name} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{l.name}{l.price && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {l.price}</span>}</span>
              <button type="button" disabled={added.includes(l.name)} onClick={() => void add(l)} className="btn-secondary btn-sm">{added.includes(l.name) ? 'Added' : 'Add to today'}</button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">The guide doesn’t list indoor places here.</p>}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="panel p-8 text-center"><CalendarClock className="mx-auto h-8 w-8 text-indigo-500" aria-hidden /><p className="mt-3 font-semibold text-zinc-900 dark:text-white">{text}</p></div>;
}
