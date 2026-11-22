'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { ReliefApp } from '@/components/relief/ReliefApp';
import { ReliefTabs, type ReliefView } from '@/components/relief/ReliefTabs';

// UniVerse Relief: the live map of needs and offers (src/components/relief/ReliefApp.tsx); M217: the most
// urgent needs, matches, disaster alerts, being ready, first aid and volunteer hours as tabs (?view=…), each
// loaded only when opened.
const wait = () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />;
const VIEWS: Record<ReliefView, React.ComponentType> = {
  urgent: dynamic(() => import('@/components/relief/ReliefUrgent').then((m) => m.ReliefUrgent), { loading: wait }),
  matches: dynamic(() => import('@/components/relief/ReliefUrgent').then((m) => m.ReliefMatches), { loading: wait }),
  alerts: dynamic(() => import('@/components/relief/ReliefAlerts'), { ssr: false, loading: wait }),
  ready: dynamic(() => import('@/components/relief/ReliefReady').then((m) => m.ReliefReady), { loading: wait }),
  firstaid: dynamic(() => import('@/components/relief/ReliefReady').then((m) => m.ReliefFirstAid), { loading: wait }),
  hours: dynamic(() => import('@/components/relief/ReliefReady').then((m) => m.ReliefHours), { loading: wait }),
  events: dynamic(() => import('@/components/green/GreenEvents').then((m) => m.GreenEvents), { loading: wait }),
};

function Relief() {
  const v = useSearchParams().get('view') as ReliefView | null, View = v && v in VIEWS ? VIEWS[v] : null;
  return <div className="space-y-6"><ReliefTabs />{View ? <View /> : <ReliefApp />}</div>;
}

export default function ReliefPage() {
  return (
    <>
      <Topbar title="Relief" subtitle="Needs and offers of help near you, live" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><Suspense><Relief /></Suspense></div>
      </div>
    </>
  );
}
