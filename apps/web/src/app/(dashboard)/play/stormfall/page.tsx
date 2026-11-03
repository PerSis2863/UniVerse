'use client';

import { Topbar } from '@/components/layout/Topbar';
import { StormfallPlayer } from '@/components/play/Stormfall';

// STORMFALL (M41): the Unity battle royale, on computers only (src/components/play/Stormfall.tsx).
export default function StormfallPage() {
  return (
    <>
      <Topbar title="Play" subtitle="STORMFALL · computer only" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto"><StormfallPlayer /></div>
      </div>
    </>
  );
}
