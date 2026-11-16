'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import Image from 'next/image';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Bookmark, BookmarkCheck, CalendarCheck, Loader2, Search, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, ExternalLink, MapPin, Moon, Phone, Sun, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { useRouter } from 'next/navigation';
import { commonsImage, type Listing } from '@/lib/travel-guide';
import { mapLink, tableLink } from '@/lib/travel-book';
import { cn } from '@/lib/utils';

// Shared parts of UniVerse Travel's screens (M202): a place's photo, a listing's card, the save button,
// the weather's sky.

export interface Saved { id: string; guide: string; name: string; kind: string; lat: number | null; lon: number | null; note: string | null; address: string | null; url: string | null; createdAt: string }

const HOME_KEY = 'uv-travel-home';

/** The visitor's own country (M204; their passport for visas, M205): what they chose before, otherwise
 *  their browser's region. */
export function useHome(): [string | null, (c: string) => void] {
  const [chosen, setChosen] = useState<string | null>(null);
  const guess = useSyncExternalStore(() => () => {}, () => {
    try { return localStorage.getItem(HOME_KEY) ?? new Intl.Locale(navigator.language).maximize().region ?? null; } catch { return null; }
  }, () => null);
  const set = (c: string) => { setChosen(c); try { localStorage.setItem(HOME_KEY, c); } catch { /* private mode */ } };
  return [chosen ?? guess, set];
}

/** A guide's banner (or a soft gradient when it has none), filling its box. */
export function Cover({ file, width = 960, className, priority }: { file?: string | null; width?: number; className?: string; priority?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn('absolute inset-0 overflow-hidden bg-gradient-to-br from-indigo-500/40 via-cyan-400/20 to-amber-300/30', className)} aria-hidden>
      {file && !broken && <Image src={commonsImage(file, width)} alt="" fill unoptimized priority={priority} sizes={`${width}px`} onError={() => setBroken(true)} className="object-cover" />}
    </span>
  );
}

/** The sky in MET Norway's words ("partlycloudy_day") as an icon and a few words. */
export function sky(symbol: string | null): { icon: LucideIcon; words: string } {
  const s = symbol ?? '';
  if (/thunder/.test(s)) return { icon: CloudLightning, words: 'Thunder' };
  if (/snow|sleet/.test(s)) return { icon: CloudSnow, words: 'Snow' };
  if (/heavyrain|^rain|rainshowers/.test(s)) return { icon: CloudRain, words: 'Rain' };
  if (/lightrain/.test(s)) return { icon: CloudDrizzle, words: 'Light rain' };
  if (/fog/.test(s)) return { icon: CloudFog, words: 'Fog' };
  if (/partlycloudy|fair/.test(s)) return { icon: s.includes('night') ? Moon : CloudSun, words: 'Partly cloudy' };
  if (/cloudy/.test(s)) return { icon: Cloud, words: 'Cloudy' };
  if (/clearsky/.test(s)) return { icon: s.includes('night') ? Moon : Sun, words: 'Clear' };
  return { icon: CloudSun, words: 'Mixed' };
}

/** Save or un-save a place (the list on Saved places, and every save button, update). */
export function SaveButton({ guide, l, saved }: { guide: string; l: Listing; saved?: Saved }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (saved) { await api.delete(`/travel/saved/${saved.id}`); toast.success('Removed from your saved places'); }
      else { await api.post('/travel/saved', { guide, name: l.name, kind: l.kind, lat: l.lat, lon: l.lon, note: l.text?.slice(0, 600), address: l.address, url: l.url }); toast.success(`Saved ${l.name}`); }
      await mutate('/travel/saved');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that place.')); } finally { setBusy(false); }
  };
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={!!saved} className={cn('btn-sm inline-flex items-center gap-1.5', saved ? 'btn-primary' : 'btn-secondary')}>
      <Icon className="h-4 w-4" aria-hidden />{saved ? 'Saved' : 'Save'}
    </button>
  );
}

/** One place from a guide: what it is, its price, hours and address, and what to do with it. */
export function ListingCard({ guide, l, saved, near }: { guide: string; l: Listing; saved?: Saved; near: string }) {
  return (
    <li className="card flex h-full flex-col gap-2 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{l.name}</p>
          {l.alt && <p className="text-xs text-zinc-500 dark:text-zinc-400" translate="no">{l.alt}</p>}
        </div>
        {l.price && <span className="max-w-[45%] shrink-0 truncate rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200" title={l.price}>{l.price}</span>}
      </div>
      {l.text && <p className="line-clamp-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{l.text}</p>}
      <dl className="space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {l.hours && <div><dt className="inline font-semibold text-zinc-600 dark:text-zinc-300">Open </dt><dd className="inline">{l.hours}</dd></div>}
        {(l.address || l.directions) && <div><dt className="sr-only">Where</dt><dd>{[l.address, l.directions].filter(Boolean).join(' · ')}</dd></div>}
      </dl>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <SaveButton guide={guide} l={l} saved={saved} />
        <a href={mapLink(l.name, { lat: l.lat, lon: l.lon, address: l.address, near })} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />Map</a>
        {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost btn-sm inline-flex items-center gap-1.5"><ExternalLink className="h-4 w-4" aria-hidden />Website</a>}
        {l.phone && <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><Phone className="h-4 w-4" aria-hidden />Call</a>}
        {l.kind === 'eat' && <a href={tableLink(l.name, near)} target="_blank" rel="noopener noreferrer sponsored" className="btn-ghost btn-sm inline-flex items-center gap-1.5" title="Opens OpenTable"><CalendarCheck className="h-4 w-4" aria-hidden />Book a table</a>}
      </div>
    </li>
  );
}

interface Found { title: string; about: string | null; thumb: string | null }

/** Find any place with a guide as you type (Wikivoyage's titles): arrows, Enter, Escape (Explore, and
 *  "Add a place" on a trip, M206). */
export function PlaceSearch({ onPick, label, placeholder, big, className }: { onPick: (title: string) => void; label: string; placeholder: string; big?: boolean; className?: string }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  const { data: found, isLoading } = useSWR<{ results: Found[] }>(term.length >= 2 ? `/travel/search?q=${encodeURIComponent(term)}` : null, fetcher, { keepPreviousData: true });
  const results = term.length >= 2 && q.trim() ? found?.results ?? [] : [];
  const pick = (title: string) => { setQ(''); setTerm(''); setActive(-1); onPick(title); };
  return (
    <div className={cn('relative', className)}>
      <Search className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400', big ? 'start-4 h-5 w-5' : 'start-3 h-4 w-4')} aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setActive(-1); }} placeholder={placeholder} aria-label={label} role="combobox" aria-expanded={results.length > 0} aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          else if (e.key === 'Enter' && (active >= 0 || results[0])) { e.preventDefault(); pick((results[active] ?? results[0]).title); }
          else if (e.key === 'Escape') setQ('');
        }}
        className={cn('w-full border border-zinc-200 bg-white text-zinc-900 outline-none transition-shadow focus:ring-2 focus:ring-indigo-400/60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white', big ? 'rounded-2xl py-3.5 ps-12 pe-12 text-base' : 'rounded-xl py-2.5 ps-9 pe-9 text-sm')} />
      {isLoading && <Loader2 className={cn('absolute top-1/2 -translate-y-1/2 animate-spin text-zinc-400', big ? 'end-4 h-5 w-5' : 'end-3 h-4 w-4')} aria-hidden />}
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#111214]">
          {results.map((r, i) => (
            <li key={r.title} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => pick(r.title)} onMouseEnter={() => setActive(i)}
              className={cn('flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-start', i === active && 'bg-zinc-100 dark:bg-white/[0.07]')}>
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-indigo-500/15">
                {r.thumb ? <Image src={r.thumb} alt="" fill unoptimized sizes="40px" className="object-cover" /> : <MapPin className="absolute inset-0 m-auto h-5 w-5 text-indigo-500" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{r.title.replace(/\//g, ' · ')}</span>
                {r.about && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{r.about}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** M206: start a trip (optionally with its first place) and open it. */
export async function startTrip(router: ReturnType<typeof useRouter>, stop?: { guide: string; name?: string; cc?: string; lat?: number; lon?: number; days?: number }) {
  try {
    const { data: { trip } } = await api.post<{ trip: { id: string } }>('/travel/trips', stop ? { stop } : {});
    router.push(`/travel/trip?id=${trip.id}`);
  } catch (e) { toast.error(errorMessage(e, 'Couldn’t start a trip.')); }
}

