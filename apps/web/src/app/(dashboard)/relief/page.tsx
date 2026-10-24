'use client';

import { Topbar } from '@/components/layout/Topbar';
import { ReliefApp } from '@/components/relief/ReliefApp';

// UniVerse Relief: the live map of needs and offers (src/components/relief/ReliefApp.tsx).
export default function ReliefPage() {
  return (
    <>
      <Topbar title="Relief" subtitle="Needs and offers of help near you, live" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto"><ReliefApp /></div>
      </div>
    </>
  );
}
