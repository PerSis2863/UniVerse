'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Building2, CalendarDays, Footprints, Gauge, Leaf, Lightbulb, MapPin, Recycle, Target, Trophy } from 'lucide-react';
import { TabRow } from '@/components/ui/TabRow';

// The tab row across UniVerse Green's pages (M216): my impact, the footprint calculator, journeys compared,
// goals and pledges, tips, community events, green places near you, and teams; M269: Business, a company's footprint.

export const GREEN_VIEWS = ['footprint', 'trips', 'goals', 'tips', 'events', 'places', 'swap', 'business'] as const;
export type GreenView = (typeof GREEN_VIEWS)[number];

export function GreenTabs() {
  const path = usePathname(), sp = useSearchParams(), view = path === '/green' ? sp.get('view') : null;
  const tab = (v: GreenView | null) => (v ? `/green?view=${v}` : '/green');
  return (
    <TabRow label="Green" glide="green-tab" tabs={[
      { href: tab(null), label: 'My impact', icon: Leaf, on: path === '/green' && !(GREEN_VIEWS as readonly string[]).includes(view ?? '') },
      { href: tab('footprint'), label: 'Footprint', icon: Gauge, on: view === 'footprint' },
      { href: tab('trips'), label: 'Journeys', icon: Footprints, on: view === 'trips' },
      { href: tab('goals'), label: 'Goals', icon: Target, on: view === 'goals' },
      { href: tab('tips'), label: 'Tips', icon: Lightbulb, on: view === 'tips' },
      { href: tab('events'), label: 'Events', icon: CalendarDays, on: view === 'events' },
      { href: tab('places'), label: 'Green places', icon: MapPin, on: view === 'places' },
      { href: tab('swap'), label: 'Swap & repair', icon: Recycle, on: view === 'swap' },
      { href: '/green/teams', label: 'Teams', icon: Trophy, on: path.startsWith('/green/teams') },
      { href: tab('business'), label: 'Business', icon: Building2, on: view === 'business' },
    ]} />
  );
}
