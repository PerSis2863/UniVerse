'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { TrackingMap } from '@/components/trace/map/TrackingMap';

// The live tracking map: every shipment's journey and where the moving ones are now.

export default function TraceTrackingPage() {
  return (
    <>
      <Topbar title="Tracking" subtitle="Every shipment’s journey, and where it is right now" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto space-y-5">
          <TraceTabs />
          <TrackingMap />
        </div>
      </div>
    </>
  );
}
