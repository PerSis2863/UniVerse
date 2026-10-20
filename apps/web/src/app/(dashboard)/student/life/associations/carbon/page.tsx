'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { ClubCarbon } from '@/components/campus/ClubCarbon';

// Stage 5 · Q16: a club's carbon tracker on its own page (also the club page's Carbon tab).

function CarbonPage() {
  const club = useSearchParams().get('club');
  return (
    <>
      <Topbar title="Carbon tracker" subtitle="Your club's footprint, in kg of CO₂e" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-w-0 space-y-4">
          <Link href="/student/life/associations" className="block w-fit text-sm text-indigo-700 dark:text-indigo-300 underline underline-offset-2">All clubs</Link>
          {club ? <ClubCarbon key={club} clubId={club} /> : <p className="text-sm text-zinc-600 dark:text-zinc-400">Open the tracker from one of your clubs.</p>}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><CarbonPage /></Suspense>;
}
