'use client';

import { Topbar } from '@/components/layout/Topbar';
import { GreenApp } from '@/components/green/GreenApp';

// UniVerse Green: my climate actions and their CO₂ (src/components/green/GreenApp.tsx).
export default function GreenPage() {
  return (
    <>
      <Topbar title="Green" subtitle="Climate actions you can prove" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto"><GreenApp /></div>
      </div>
    </>
  );
}
