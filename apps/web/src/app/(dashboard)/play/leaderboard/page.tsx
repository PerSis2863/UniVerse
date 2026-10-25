'use client';

import { Suspense } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Leaderboard } from '@/components/play/Leaderboard';

// UniVerse Play leaderboards: each person's best per game, this week or ever.
export default function PlayLeaderboardPage() {
  return (
    <>
      <Topbar title="Leaderboards" subtitle="UniVerse Play" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto"><Suspense><Leaderboard /></Suspense></div>
      </div>
    </>
  );
}
