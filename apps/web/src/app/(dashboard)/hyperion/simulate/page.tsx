'use client';

import dynamic from 'next/dynamic';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { HyperionTopbar } from '@/components/lab/HyperionTopbar';

// Hyperion Simulate (M404, the owner, 22 Nov: "where are the ansys software features… we need to make a software not
// just platform"): engineering simulation in Hyperion: Structures and Heat (src/components/sim). Loaded only here.
const SimulateApp = dynamic(() => import('@/components/sim/SimulateApp').then((m) => m.SimulateApp), { ssr: false, loading: () => <div className="h-[calc(100dvh-6rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" /> });

export default function SimulatePage() {
  return (
    <>
      <HyperionTopbar title="Simulate" subtitle="Engineering simulation: stress, vibration, heat, flow and circuits" />
      <div className="flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-4"><ComputerOnly skeleton={<div className="h-[calc(100dvh-6rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />}><SimulateApp /></ComputerOnly></div>
    </>
  );
}
