'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { MarketMap } from '@/components/trace/map/MarketMap';

// The live market map: where a brand's products are scanned, city by city (src/components/trace/map).

export default function TraceMapPage() {
  return (
    <>
      <Topbar title="Market map" subtitle="Where your products are scanned, live, city by city" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-[1500px] mx-auto space-y-5">
          <TraceTabs />
          <MarketMap />
        </div>
      </div>
    </>
  );
}
