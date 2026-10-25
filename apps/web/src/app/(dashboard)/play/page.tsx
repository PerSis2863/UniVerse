'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Arcade } from '@/components/play/Arcade';

// UniVerse Play: the arcade, one game per app (src/components/play/Arcade.tsx).
export default function PlayPage() {
  return (
    <>
      <Topbar title="Play" subtitle="Games that teach something" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto"><Arcade /></div>
      </div>
    </>
  );
}
