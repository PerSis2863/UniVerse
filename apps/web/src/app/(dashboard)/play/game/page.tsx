'use client';

import { Suspense } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { GameShell } from '@/components/play/GameShell';

// A UniVerse Play game: ?g=<game> to play solo or open a room, ?room=<code> to be in one.
export default function PlayGamePage() {
  return (
    <>
      <Topbar title="Play" subtitle="Solo or with friends" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto"><Suspense><GameShell /></Suspense></div>
      </div>
    </>
  );
}
