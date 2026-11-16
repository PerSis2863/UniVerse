'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SAFETY_TABS } from '@/components/layout/SectionTabs';
import { WhoSeesWhat } from '@/components/safety/WhoSeesWhat';

/** M199: who can see what at the school, and what is shared between schools on purpose. */
export default function WhoSeesWhatPage() {
  return (
    <>
      <Topbar title="Safety reports" subtitle="Who can see what at your school." />
      <SectionTabs tabs={SAFETY_TABS} />
      <WhoSeesWhat />
    </>
  );
}
