'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, Luggage } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Segmented } from '@/components/ui/Segmented';
import { TravelSaved } from '@/components/travel/TravelSaved';
import { TravelTrips } from '@/components/travel/TravelTrips';

// My trips (M206) and saved places, as two tabs (?tab=saved for the places; ?join=CODE asks to join a
// friend's trip): src/components/travel/TravelTrips.tsx and TravelSaved.tsx.
function Tabs() {
  const sp = useSearchParams(), router = useRouter();
  const tab = sp.get('tab') === 'saved' ? 'saved' : 'trips';
  return (
    <div className="space-y-6">
      <Segmented label="Show" large value={tab} onChange={(v) => router.replace(v === 'saved' ? '/travel/saved?tab=saved' : '/travel/saved', { scroll: false })}
        segments={[{ value: 'trips', label: 'Trips', icon: <Luggage className="h-4 w-4" aria-hidden /> }, { value: 'saved', label: 'Saved places', icon: <Bookmark className="h-4 w-4" aria-hidden /> }]} />
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
