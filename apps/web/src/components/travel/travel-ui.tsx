'use client';

import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Bookmark, BookmarkCheck, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, ExternalLink, MapPin, Moon, Phone, Sun, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { commonsImage, type Listing } from '@/lib/travel-guide';
import { mapLink } from '@/lib/travel-book';
import { cn } from '@/lib/utils';

// Shared parts of UniVerse Travel's screens (M183): a place's photo, a listing's card, the save button,
// the weather's sky.

export interface Saved { id: string; guide: string; name: string; kind: string; lat: number | null; lon: number | null; note: string | null; address: string | null; url: string | null; createdAt: string }

/** A guide's banner (or a soft gradient when it has none), filling its box. */
export function Cover({ file, width = 960, className, priority }: { file?: string | null; width?: number; className?: string; priority?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn('absolute inset-0 overflow-hidden bg-gradient-to-br from-sky-500/40 via-cyan-400/20 to-amber-300/30', className)} aria-hidden>
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
      </div>
    </li>
  );
}
