'use client';

import dynamic from 'next/dynamic';
import { ComputerOnly } from '@/components/lab/ComputerOnly';
import { HyperionTopbar } from '@/components/lab/HyperionTopbar';

// Hyperion Signals (M472–): the point-and-click windows for signals and instruments (src/components/lab/SignalsTabs):
// the Filter designer first.
const skeleton = <div className="h-[calc(100dvh-9rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const SignalsTabs = dynamic(() => import('@/components/lab/SignalsTabs').then((m) => m.SignalsTabs), { ssr: false, loading: () => skeleton });

export default function SignalsPage() {
  return (
    <>
      <HyperionTopbar title="Signals" subtitle="Design filters and look at signals from instruments and devices" />
      <div className="flex-1 px-3 pb-3 pt-2 sm:px-5 sm:pb-4"><ComputerOnly skeleton={skeleton}><SignalsTabs /></ComputerOnly></div>
    </>
  );
}
