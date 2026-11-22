'use client';

import dynamic from 'next/dynamic';
import { Topbar } from '@/components/layout/Topbar';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { InstallHyperion } from '@/components/lab/InstallHyperion';

// Hyperion Simulate (M404, the owner, 22 Nov: "where are the ansys software features… we need to make a software not
// just platform"): engineering simulation in Hyperion: Structures and Heat (src/components/sim). Loaded only here.
const SimulateApp = dynamic(() => import('@/components/sim/SimulateApp').then((m) => m.SimulateApp), { ssr: false, loading: () => <div className="h-[calc(100dvh-10.5rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" /> });

export default function SimulatePage() {
  return (
    <>
      <Topbar title="Simulate" subtitle="Engineering simulation: stress, vibration, heat, flow and circuits" rightNode={<InstallHyperion />} />
      <div className="flex-1 p-3 sm:p-6"><ComputerOnly skeleton={<div className="h-[calc(100dvh-10.5rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />}><SimulateApp /></ComputerOnly></div>
    </>
  );
}
