'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Gauge, Leaf, Lightbulb, Target, Trophy } from 'lucide-react';
import { TabRow, type RowTab } from '@/components/ui/TabRow';
import { GREEN_LIVING, LIVING_VIEWS, type LivingView } from '@/lib/green-home';

// The tab row of Student life → Green living (M395; Green's own tabs before, M216): my impact, the footprint
// calculator, goals and pledges, tips and teams. Journeys and green places are Aether's, events Relief's, swap &
// repair and a company's carbon Trace's (src/lib/green-home.ts).

/** Green living's sections. */
export function greenSections(path: string, sp: URLSearchParams): RowTab[] {
  const view = path === GREEN_LIVING ? sp.get('view') : null;
  const tab = (v: LivingView | null) => (v ? `${GREEN_LIVING}?view=${v}` : GREEN_LIVING);
  return [
    { href: tab(null), label: 'My impact', icon: Leaf, on: path === GREEN_LIVING && !(LIVING_VIEWS as readonly string[]).includes(view ?? '') },
    { href: tab('footprint'), label: 'Footprint', icon: Gauge, on: view === 'footprint' },
    { href: tab('goals'), label: 'Goals', icon: Target, on: view === 'goals' },
    { href: tab('tips'), label: 'Tips', icon: Lightbulb, on: view === 'tips' },
    { href: tab('teams'), label: 'Teams', icon: Trophy, on: view === 'teams' },
  ];
}

export function GreenTabs() {
  return <TabRow keep label="Green living" glide="green-tab" tabs={greenSections(usePathname(), new URLSearchParams(useSearchParams().toString()))} />;
}
