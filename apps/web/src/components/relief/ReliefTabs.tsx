'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { AlarmClock, Building2, Clock, HandHeart, HeartPulse, Map, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import { TabRow, type RowTab } from '@/components/ui/TabRow';

// The tab row across UniVerse Relief's pages (M217): the live map, the most urgent needs, matches between
// offers and needs, disaster alerts, being ready, first aid, my requests, organisations and volunteer hours.

export const RELIEF_VIEWS = ['urgent', 'matches', 'alerts', 'ready', 'firstaid', 'hours'] as const;
export type ReliefView = (typeof RELIEF_VIEWS)[number];

/** Relief's sections (M370: the same list fills the top bar on a computer). */
export function reliefSections(path: string, sp: URLSearchParams): RowTab[] {
  const view = path === '/relief' ? sp.get('view') : null;
  const tab = (v: ReliefView) => `/relief?view=${v}`;
  return [
    { href: '/relief', label: 'Live map', icon: Map, on: path === '/relief' && !(RELIEF_VIEWS as readonly string[]).includes(view ?? '') },
    { href: tab('urgent'), label: 'Most urgent', icon: AlarmClock, on: view === 'urgent' },
    { href: tab('matches'), label: 'Matches', icon: Sparkles, on: view === 'matches' },
    { href: tab('alerts'), label: 'Alerts', icon: Siren, on: view === 'alerts' },
    { href: tab('ready'), label: 'Be ready', icon: ShieldCheck, on: view === 'ready' },
    { href: tab('firstaid'), label: 'First aid', icon: HeartPulse, on: view === 'firstaid' },
    { href: '/relief/mine', label: 'My requests', icon: HandHeart, on: path.startsWith('/relief/mine') },
    { href: tab('hours'), label: 'My hours', icon: Clock, on: view === 'hours' },
    { href: '/relief/orgs', label: 'Organisations', icon: Building2, on: path.startsWith('/relief/orgs') },
  ];
}

export function ReliefTabs() {
  return <TabRow label="Relief" glide="relief-tab" tabs={reliefSections(usePathname(), new URLSearchParams(useSearchParams().toString()))} />;
}
