'use client';

import { Suspense } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { TravelGuide } from '@/components/travel/TravelGuide';

// A place's guide (?d=<its Wikivoyage title>): src/components/travel/TravelGuide.tsx.
export default function TravelGuidePage() {
  return (
    <>
      <Topbar title="Guide" subtitle="What to see, do, eat and where to sleep" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full space-y-6"><Suspense><TravelGuide /></Suspense></div>
      </div>
    </>
  );
}
