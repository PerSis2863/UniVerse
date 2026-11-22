'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { GreenBusiness } from '@/components/green/business/GreenBusiness';

// M395: a company's carbon footprint by the GHG Protocol's scopes (Green → Business until the owner folded Green into
// the other apps, 22 Nov): it sits beside the brand's products, whose passports already carry their carbon per unit.
export default function TraceCarbonPage() {
  return (
    <>
      <Topbar title="Carbon" subtitle="A company’s footprint, scopes 1 to 3" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="w-full space-y-6">
          <TraceTabs />
          <GreenBusiness />
        </div>
      </div>
    </>
  );
}
