'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { GlobeView } from '@/components/trace/GlobeView';

// The Live globe: the brand's shipments and destinations on a turning 3D globe.

export default function TraceGlobePage() {
  return (
    <>
      <Topbar title="Live globe" subtitle="Your shipments and where they’re headed, on a turning globe" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto space-y-5">
          <TraceTabs />
          <GlobeView />
        </div>
      </div>
    </>
  );
}
