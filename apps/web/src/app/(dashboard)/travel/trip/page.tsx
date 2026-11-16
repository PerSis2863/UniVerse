'use client';

import { Suspense } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { TravelTrip } from '@/components/travel/TravelTrip';

// A trip being planned (?id=…): src/components/travel/TravelTrip.tsx (M206).
export default function TravelTripPage() {
  return (
    <>
      <Topbar title="Trip" subtitle="Cities, days, budget and friends" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full space-y-6"><Suspense><TravelTrip /></Suspense></div>
      </div>
    </>
  );
}
