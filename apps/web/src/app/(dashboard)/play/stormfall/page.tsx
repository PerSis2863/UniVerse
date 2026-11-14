'use client';

import { Topbar } from '@/components/layout/Topbar';
import { StormfallPlayer } from '@/components/play/Stormfall';

// STORMFALL (M82): the Unity battle royale, on computers only (src/components/play/Stormfall.tsx).
export default function StormfallPage() {
  return (
    <>
      <Topbar title="Play" subtitle="STORMFALL · computer only" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full"><StormfallPlayer /></div>
      </div>
    </>
  );
}
