'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TravelSaved } from '@/components/travel/TravelSaved';

// My saved places, by the guide they came from (src/components/travel/TravelSaved.tsx).
export default function TravelSavedPage() {
  return (
    <>
      <Topbar title="Saved places" subtitle="Everywhere you want to go" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><TravelSaved /></div>
      </div>
    </>
  );
}
