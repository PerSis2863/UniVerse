'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';
import { Bookmark, BookOpen, Clock, ExternalLink, Globe, Loader2, MapPin, Navigation, Phone, UtensilsCrossed, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { commonsFileOf, commonsImage, commonsSrcSet } from '@/lib/travel-guide';
import { Photo as Pic } from '@/components/ui/Photo';
import { dayText, openState, readHours } from '@/lib/opening-hours';
import { localClock, zoneAt } from '@/lib/travel-local';
import { listingKind, type StreetPhoto } from '@/lib/travel-map';
import type { Photo, PlaceInfo, Story } from '@/lib/travel-place';
import { cn } from '@/lib/utils';
import { Reviews } from './Reviews';
import { TripPicker } from './TripPicker';

// What opens when a place on Travel's map is tapped (M209): a real place's facts (OpenStreetMap, Wikidata,
// Wikipedia), whether it's open at the time chosen on the map (in its own time zone), its photo and story,
// directions, save, add to a trip, and UniVerse's reviews; or a Wikipedia story; or a photo with its credit.

export type Picked =
  | { type: 'place'; key: string | null; name: string; kind: string; cls?: string; lat: number; lon: number; review?: string }
  | { type: 'story'; story: Story }
  | { type: 'photo'; photo: Photo }
  | { type: 'street'; photo: StreetPhoto };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const link = 'btn-secondary btn-sm inline-flex items-center gap-1.5';

async function save(p: { name: string; kind: string; lat: number; lon: number; city: string | null; note?: string | null; address?: string | null; url?: string | null }) {
  try {
    await api.post('/travel/saved', { guide: p.city ?? 'My places', name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, note: p.note?.slice(0, 600) ?? undefined, address: p.address ?? undefined, url: p.url ?? undefined });
    await mutate('/travel/saved');
    toast.success(`Saved ${p.name}`);
  } catch (e) { toast.error(errorMessage(e, 'Couldn’t save it.')); }
}
type Go = (to: { lat: number; lon: number; name: string }) => void;
/** Directions on Travel's own map (M237), never another website. */
const GoButton = ({ to, onGo, label = 'Directions' }: { to: { lat: number; lon: number; name: string }; onGo: Go; label?: string }) => (
  <button type="button" onClick={() => onGo(to)} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Navigation className="h-4 w-4" aria-hidden />{label}</button>
);

export function PlaceCard({ picked, at, onClose, onDirections }: { picked: Picked; at: Date; onClose: () => void; onDirections: Go }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-end">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm p-1.5" aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="-mt-8 min-h-0 flex-1 space-y-4 overflow-y-auto pe-1">
        {picked.type === 'place' ? <PlaceBody p={picked} at={at} onDirections={onDirections} /> : picked.type === 'story' ? <StoryBody s={picked.story} onGo={onDirections} /> : picked.type === 'street' ? <StreetBody ph={picked.photo} onGo={onDirections} /> : <PhotoBody ph={picked.photo} onGo={onDirections} />}
      </div>
    </div>
  );
}

function PlaceBody({ p, at, onDirections }: { p: Extract<Picked, { type: 'place' }>; at: Date; onDirections: Go }) {
  const key = p.key ? `/travel/place?osm=${p.key}` : `/travel/place?name=${encodeURIComponent(p.name)}&lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}`;
  const { data, error, isLoading } = useSWR<{ place: PlaceInfo; credit: string }>(key, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const [week, setWeek] = useState(false);
  const info = data?.place;
  const hours = useMemo(() => readHours(info?.hours), [info]);
  const zone = zoneAt(p.lat, p.lon, info?.cc), clock = localClock(zone, at);
  const state = hours?.sure ? openState(hours.week, clock.day, clock.minutes) : null;
  const name = info?.name ?? p.name, kind = info?.kind ?? p.kind;
  return (
    <>
      <div className="pe-8">
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white" translate="no">{name}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{kind}{info?.cuisine.length ? ` · ${info.cuisine.join(', ')}` : ''}</p>
      </div>
      {info?.image && <CardPhoto file={info.image} />}
      {isLoading && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Looking it up…</p>}
      {error && <p className="text-sm text-zinc-600 dark:text-zinc-300">OpenStreetMap has nothing more on this place yet.</p>}
      {info && (
        <>
          {(state || info.hours) && (
            <div className="text-sm">
              {state ? (
                <p className={cn('flex items-center gap-1.5 font-semibold', state.open ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                  <Clock className="h-4 w-4" aria-hidden />{state.open ? `Open${state.until ? ` until ${state.until}` : ''}` : `Closed${state.next ? ` · opens ${state.next.day === clock.day ? 'at' : DAYS[state.next.day].slice(0, 3)} ${state.next.at}` : ''}`}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">(their time)</span>
                </p>
              ) : <p className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200"><Clock className="h-4 w-4" aria-hidden />{info.hours}</p>}
              {hours && <button type="button" onClick={() => setWeek((w) => !w)} aria-expanded={week} className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{week ? 'Hide the week' : 'The week’s hours'}</button>}
              {week && hours && <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">{DAYS.map((d, i) => <div key={d} className={cn('contents', i === clock.day && 'font-semibold text-zinc-900 dark:text-white')}><dt>{d}</dt><dd className="tabular-nums">{dayText(hours.week, i)}</dd></div>)}</dl>}
            </div>
          )}
          {info.about && <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{info.about}{info.wiki && <> <a href={info.wiki} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">Wikipedia</a></>}</p>}
          {info.facts.length > 0 && <ul className="flex flex-wrap gap-1.5">{info.facts.map((f) => <li key={f} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200">{f}</li>)}</ul>}
          {info.address && <p className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{info.address}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <GoButton to={{ lat: p.lat, lon: p.lon, name: info?.name ?? p.name }} onGo={onDirections} />
        {info?.phone && <a href={`tel:${info.phone.replace(/[^\d+]/g, '')}`} className={link}><Phone className="h-4 w-4" aria-hidden />Call</a>}
        {info?.website && <a href={info.website} target="_blank" rel="noopener noreferrer nofollow" className={link}><Globe className="h-4 w-4" aria-hidden />Website</a>}
        {info?.menu && <a href={info.menu} target="_blank" rel="noopener noreferrer nofollow" className={link}><UtensilsCrossed className="h-4 w-4" aria-hidden />Menu</a>}
        <button type="button" onClick={() => void save({ name, kind: listingKind(p.cls), lat: p.lat, lon: p.lon, city: info?.city ?? null, note: info?.about, address: info?.address, url: info?.website })} className={link}><Bookmark className="h-4 w-4" aria-hidden />Save</button>
        <TripPicker items={[{ name, kind: listingKind(p.cls), lat: p.lat, lon: p.lon, hours: info?.hours, note: info?.about, address: info?.address, url: info?.website }]} city={info?.city ?? null} cc={info?.cc ?? null} />
      </div>
      <Reviews place={p.review ?? info?.key ?? p.key ?? `wp:${name}`} name={name} lat={p.lat} lon={p.lon} />
      {data && <p className="text-xs text-zinc-500 dark:text-zinc-400">{data.credit}</p>}
    </>
  );
}

/** How wide the card's pictures are shown (the side panel, or a phone's sheet). */
const CARD_PHOTO = '(min-width: 640px) 24rem, 100vw';

/** M232: a Commons picture across the card, in the widths it needs (a 320 px thumbnail was blown up). */
function CardPhoto({ file, fallback }: { file: string | null; fallback?: string }) {
  const src = file ? commonsImage(file, 960) : fallback;
  if (!src) return null;
  return <Pic src={src} srcSet={file ? commonsSrcSet(file) : undefined} shown={CARD_PHOTO} alt="" loading="lazy" className="h-44 w-full rounded-xl object-cover" />;
}

function StoryBody({ s, onGo }: { s: Story; onGo: Go }) {
  return (
    <>
      <div className="pe-8">
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white" translate="no">{s.title}</h3>
        <p className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300"><BookOpen className="h-4 w-4" aria-hidden />A story from Wikipedia</p>
      </div>
      {s.thumb && <CardPhoto file={commonsFileOf(s.thumb)} fallback={s.thumb} />}
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{s.extract}</p>
      <div className="flex flex-wrap gap-1.5">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className={link}><ExternalLink className="h-4 w-4" aria-hidden />Read on Wikipedia</a>
        <GoButton to={{ lat: s.lat, lon: s.lon, name: s.title }} onGo={onGo} />
        <button type="button" onClick={() => void save({ name: s.title, kind: 'see', lat: s.lat, lon: s.lon, city: null, note: s.extract, url: s.url })} className={link}><Bookmark className="h-4 w-4" aria-hidden />Save</button>
        <TripPicker items={[{ name: s.title, kind: 'see', lat: s.lat, lon: s.lon, note: s.extract, url: s.url }]} city={null} cc={null} />
      </div>
      <Reviews place={`wp:${s.title}`} name={s.title} lat={s.lat} lon={s.lon} />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Wikipedia (CC BY-SA 4.0)</p>
    </>
  );
}

function PhotoBody({ ph, onGo }: { ph: Photo; onGo: Go }) {
  return (
    <>
      <Pic src={ph.thumb} srcSet={`${ph.thumb} ${ph.w}w, ${commonsSrcSet(ph.file)}`} shown={CARD_PHOTO} alt={ph.title} width={ph.w} height={ph.h} loading="lazy" className="mt-8 h-auto w-full rounded-xl object-cover" />
      <div>
        <h3 className="font-semibold text-zinc-900 dark:text-white" translate="no">{ph.title}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{ph.author ? `By ${ph.author}` : 'Author on Commons'}{ph.licence ? ` · ${ph.licence}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <a href={ph.page} target="_blank" rel="noopener noreferrer" className={link}><ExternalLink className="h-4 w-4" aria-hidden />On Wikimedia Commons</a>
<GoButton to={{ lat: ph.lat, lon: ph.lon, name: ph.title }} onGo={onGo} label="Go there" />
      </div>
    </>
  );
}

/** M214: what the street looks like here, from Panoramax (people's street-level photos, CC BY-SA 4.0). */
function StreetBody({ ph, onGo }: { ph: StreetPhoto; onGo: Go }) {
  const when = ph.at ? new Date(ph.at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  return (
    <>
      <Pic src={ph.sd} shown={CARD_PHOTO} alt="The street at this spot" width={1024} height={768} loading="lazy" className="mt-8 h-auto w-full rounded-xl bg-zinc-200 object-cover dark:bg-white/[0.06]" />
      <div>
        <h3 className="font-semibold text-zinc-900 dark:text-white">The street here</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{[when && `Taken ${when}`, ph.heading !== null && `looking ${['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(ph.heading / 45) % 8]}`].filter(Boolean).join(', ')}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400"><span translate="no">{ph.by ?? 'A Panoramax contributor'}</span> · Panoramax · CC BY-SA 4.0</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <a href={ph.hd} target="_blank" rel="noopener noreferrer" className={link}><ExternalLink className="h-4 w-4" aria-hidden />Full-size photo</a>
<GoButton to={{ lat: ph.lat, lon: ph.lon, name: 'Street photo' }} onGo={onGo} label="Go there" />
      </div>
    </>
  );
}
