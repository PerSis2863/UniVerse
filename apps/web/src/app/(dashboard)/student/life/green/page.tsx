'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Building2, CalendarDays, Footprints, MapPin, Recycle } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { GreenApp } from '@/components/green/GreenApp';
import { GreenTabs } from '@/components/green/GreenTabs';
import { LIVING_VIEWS, type LivingView } from '@/lib/green-home';

// Student life → Green living (M395, the owner, 22 Nov: Green folded into the apps of daily life): my climate actions and
// their CO₂ (GreenApp), the footprint, goals and pledges, tips and teams as tabs (?view=…), each loaded only when opened.
const wait = () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />;
const VIEWS: Record<LivingView, React.ComponentType> = {
  footprint: dynamic(() => import('@/components/green/GreenFootprint').then((m) => m.GreenFootprint), { loading: wait }),
  goals: dynamic(() => import('@/components/green/GreenGoals').then((m) => m.GreenGoals), { loading: wait }),
  tips: dynamic(() => import('@/components/green/GreenGoals').then((m) => m.GreenTips), { loading: wait }),
  teams: dynamic(() => import('@/components/green/GreenTeams').then((m) => m.GreenTeams), { loading: wait }),
};

/** Green's other parts, now in the apps they belong to. */
const ELSEWHERE = [
  { href: '/travel?view=journeys', label: 'Greener journeys', app: 'Aether', icon: Footprints },
  { href: '/travel?view=green', label: 'Green places', app: 'Aether', icon: MapPin },
  { href: '/relief?view=events', label: 'Community events', app: 'Relief', icon: CalendarDays },
  { href: '/trace/swap', label: 'Swap & repair', app: 'Trace', icon: Recycle },
  { href: '/trace/carbon', label: 'A company’s carbon', app: 'Trace', icon: Building2 },
];

function Living() {
  const v = useSearchParams().get('view') as LivingView | null, View = v && (LIVING_VIEWS as readonly string[]).includes(v) ? VIEWS[v] : null;
  return (
    <div className="space-y-6">
      <GreenTabs />
      {View ? <View /> : <GreenApp />}
      {!View && (
        <nav aria-label="More green in your apps" className="panel p-5">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">More green in your apps</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ELSEWHERE.map(({ href, label, app, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 rounded-xl border border-zinc-200/80 px-3 py-2.5 text-sm hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/[0.04]">
                  <Icon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span className="min-w-0"><span className="block font-medium text-zinc-900 dark:text-white">{label}</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">In {app}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export default function GreenLivingPage() {
  return (
    <>
      <Topbar title="Green living" subtitle="Climate actions you can prove" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><Suspense><Living /></Suspense></div>
      </div>
    </>
  );
}
