'use client';

import dynamic from 'next/dynamic';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { HyperionTopbar } from '@/components/lab/HyperionTopbar';

// Hyperion Learn (M421): compare machine-learning models on data without writing code (src/components/lab/LearnApp), and
// Machine health (M443): a diagnostic feature designer (src/components/lab/HealthApp).
const skeleton = <div className="h-[calc(100dvh-9rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const LearnTabs = dynamic(() => import('@/components/lab/LearnTabs').then((m) => m.LearnTabs), { ssr: false, loading: () => skeleton });

export default function LearnPage() {
  return (
    <>
      <HyperionTopbar title="Learn" subtitle="Train and compare machine-learning models, and judge machines’ health from their vibration" />
      <div className="flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-4"><ComputerOnly skeleton={skeleton}><LearnTabs /></ComputerOnly></div>
    </>
  );
}
