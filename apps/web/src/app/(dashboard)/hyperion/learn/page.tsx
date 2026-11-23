'use client';

import dynamic from 'next/dynamic';
import { Topbar } from '@/components/layout/Topbar';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { InstallHyperion } from '@/components/lab/InstallHyperion';

// Hyperion Learn (M421): compare machine-learning models on data without writing code (src/components/lab/LearnApp).
const skeleton = <div className="h-[calc(100dvh-10.5rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const LearnApp = dynamic(() => import('@/components/lab/LearnApp').then((m) => m.LearnApp), { ssr: false, loading: () => skeleton });

export default function LearnPage() {
  return (
    <>
      <Topbar title="Learn" subtitle="Train and compare machine-learning models on your data" rightNode={<InstallHyperion />} />
      <div className="flex-1 p-3 sm:p-6"><ComputerOnly skeleton={skeleton}><LearnApp /></ComputerOnly></div>
    </>
  );
}
