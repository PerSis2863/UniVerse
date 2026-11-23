'use client';

import dynamic from 'next/dynamic';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { HyperionTopbar } from '@/components/lab/HyperionTopbar';

// Hyperion (M376): our own engine for the MATLAB / Octave language with a command window, scripts, variables and
// figures (src/components/lab/LabApp.tsx). Loaded only here: nothing of it reaches other pages.
const LabApp = dynamic(() => import('@/components/lab/LabApp').then((m) => m.LabApp), { ssr: false, loading: () => <div className="h-[calc(100dvh-6rem)] min-h-[30rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" /> });

export default function LabPage() {
  return (
    <>
      <HyperionTopbar title="Hyperion" subtitle="Maths, matrices, plots and simulation" />
      <div className="flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-4"><ComputerOnly skeleton={<div className="h-[calc(100dvh-6rem)] min-h-[30rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />}><LabApp /></ComputerOnly></div>
    </>
  );
}
