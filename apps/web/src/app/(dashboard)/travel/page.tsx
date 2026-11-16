'use client';

import { Suspense } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { TravelExplore } from '@/components/travel/TravelExplore';

// UniVerse Travel: find a place, or start from one picked for you (src/components/travel/TravelExplore.tsx).
export default function TravelPage() {
  return (
    <>
      <Topbar title="Travel" subtitle="Plan trips, anywhere in the world" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><Suspense><TravelExplore /></Suspense></div>
      </div>
    </>
  );
}
