'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { warmMap } from '@/lib/map-smooth';
import { Bookmark, Compass, Map as MapIcon, Route, Sparkles } from 'lucide-react';
import { TabRow, type RowTab } from '@/components/ui/TabRow';

// The tab row across UniVerse Travel's pages (M213, the owner: "look professional and modern like the other
// apps"): Explore (and a place's guide), Find where to go, the map, trips (and a trip) and saved places.

/** Travel's sections (M370: the same list fills the top bar on a computer). */
export function travelSections(path: string, sp: URLSearchParams): RowTab[] {
  const view = path === '/travel' ? sp.get('view') : null, saved = path === '/travel/saved' && sp.get('tab') === 'saved';
  return [
      { href: '/travel', label: 'Explore', icon: Compass, on: (path === '/travel' && view !== 'find' && view !== 'map') || path.startsWith('/travel/guide') },
      { href: '/travel?view=find', label: 'Find where to go', icon: Sparkles, on: view === 'find' },
      { href: '/travel?view=map', label: 'Map', icon: MapIcon, on: view === 'map' },
      { href: '/travel/saved', label: 'Trips', icon: Route, on: (path === '/travel/saved' && !saved) || path.startsWith('/travel/trip') },
      { href: '/travel/saved?tab=saved', label: 'Saved', icon: Bookmark, on: saved },
    ];
}

export function TravelTabs() {
  const path = usePathname(), sp = useSearchParams();
  // M353: the map's code fetched while the page sits idle, so opening the Map is quick.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(warmMap, { timeout: 4000 }); return () => w.cancelIdleCallback?.(id); }
    const t = setTimeout(warmMap, 2500); return () => clearTimeout(t);
  }, []);
  return <TabRow label="Travel" glide="travel-tab" tabs={travelSections(path, new URLSearchParams(sp.toString()))} />;
}
