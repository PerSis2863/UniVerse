'use client';

import dynamic from 'next/dynamic';
import { Topbar } from '@/components/layout/Topbar';

// Hyperion (M376): our own engine for the MATLAB / Octave language with a command window, scripts, variables and
// figures (src/components/lab/LabApp.tsx). Loaded only here: nothing of it reaches other pages.
const LabApp = dynamic(() => import('@/components/lab/LabApp').then((m) => m.LabApp), { ssr: false, loading: () => <div className="h-[calc(100dvh-10.5rem)] min-h-[30rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" /> });

export default function LabPage() {
  return (
    <>
      <Topbar title="Hyperion" subtitle="Maths, matrices, plots and simulation" />
      <div className="flex-1 p-3 sm:p-6"><LabApp /></div>
    </>
  );
}
