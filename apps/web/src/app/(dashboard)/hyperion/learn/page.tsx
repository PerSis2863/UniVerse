'use client';

import dynamic from 'next/dynamic';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { HyperionTopbar } from '@/components/lab/HyperionTopbar';

// Hyperion Learn (M421): compare machine-learning models on data without writing code (src/components/lab/LearnApp).
const skeleton = <div className="h-[calc(100dvh-6rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const LearnApp = dynamic(() => import('@/components/lab/LearnApp').then((m) => m.LearnApp), { ssr: false, loading: () => skeleton });

export default function LearnPage() {
  return (
    <>
      <HyperionTopbar title="Learn" subtitle="Train and compare machine-learning models on your data" />
      <div className="flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-4"><ComputerOnly skeleton={skeleton}><LearnApp /></ComputerOnly></div>
    </>
  );
}
