'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { SwapBoard } from '@/components/green/SwapBoard';

// M395: swap, give away and repair things near you (Green's Swap & repair until the owner folded Green into the other
// apps, 22 Nov): a thing's second life sits with its passport's repairs and take-back in Trace.
export default function TraceSwapPage() {
  return (
    <>
      <Topbar title="Swap & repair" subtitle="Give things a second life near you" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full space-y-6">
          <TraceTabs />
          <SwapBoard />
        </div>
      </div>
    </>
  );
}
