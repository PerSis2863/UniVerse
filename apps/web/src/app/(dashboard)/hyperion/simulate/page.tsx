'use client';

import dynamic from 'next/dynamic';
import { Topbar } from '@/components/layout/Topbar';

// Hyperion Simulate (M404, the owner, 22 Nov: "where are the ansys software features… we need to make a software not
// just platform"): engineering simulation in Hyperion, starting with Structures (src/components/sim). Loaded only here.
const StructureBench = dynamic(() => import('@/components/sim/StructureBench').then((m) => m.StructureBench), { ssr: false, loading: () => <div className="h-[calc(100dvh-10.5rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" /> });

export default function SimulatePage() {
  return (
    <>
      <Topbar title="Simulate" subtitle="Stress and bending of a part, like engineering software" />
      <div className="flex-1 p-3 sm:p-6"><StructureBench /></div>
    </>
  );
}
