'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { TravelTabs } from '@/components/travel/TravelTabs';
import { TravelSaved } from '@/components/travel/TravelSaved';
import { TravelTrips } from '@/components/travel/TravelTrips';

// My trips (M206) and saved places, two of Travel's tabs (?tab=saved for the places; ?join=CODE asks to join
// a friend's trip): src/components/travel/TravelTrips.tsx and TravelSaved.tsx.
function Tabs() {
  const sp = useSearchParams();
  const tab = sp.get('tab') === 'saved' ? 'saved' : 'trips';
  return (
    <div className="space-y-6">
      <TravelTabs />
      {tab === 'saved' ? <TravelSaved /> : <TravelTrips join={sp.get('join')} />}
    </div>
  );
}

export default function TravelSavedPage() {
  return (
    <>
      <Topbar title="Trips and saved" subtitle="Plan trips together, keep the places you love" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><Suspense><Tabs /></Suspense></div>
      </div>
    </>
  );
}
