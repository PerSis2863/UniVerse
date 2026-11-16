'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { GreenApp } from '@/components/green/GreenApp';

// UniVerse Green: my climate actions and their CO₂ (src/components/green/GreenApp.tsx); M216: the footprint,
// journeys, goals, tips, events and green places (?view=…, entries in the side menu since M218), each loaded only when opened.
type GreenView = 'footprint' | 'trips' | 'goals' | 'tips' | 'events' | 'places';
const wait = () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />;
const VIEWS: Record<GreenView, React.ComponentType> = {
  footprint: dynamic(() => import('@/components/green/GreenFootprint').then((m) => m.GreenFootprint), { loading: wait }),
  trips: dynamic(() => import('@/components/green/GreenJourney').then((m) => m.GreenJourney), { loading: wait }),
  goals: dynamic(() => import('@/components/green/GreenGoals').then((m) => m.GreenGoals), { loading: wait }),
  tips: dynamic(() => import('@/components/green/GreenGoals').then((m) => m.GreenTips), { loading: wait }),
  events: dynamic(() => import('@/components/green/GreenEvents').then((m) => m.GreenEvents), { loading: wait }),
  places: dynamic(() => import('@/components/green/GreenPlaces'), { ssr: false, loading: wait }),
};

function Green() {
  const v = useSearchParams().get('view') as GreenView | null, View = v && v in VIEWS ? VIEWS[v] : null;
  return View ? <View /> : <GreenApp />;
}

export default function GreenPage() {
  return (
    <>
      <Topbar title="Green" subtitle="Climate actions you can prove" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><Suspense><Green /></Suspense></div>
      </div>
    </>
  );
}
