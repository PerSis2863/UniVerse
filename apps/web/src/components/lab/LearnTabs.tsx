'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Segmented } from '@/components/ui/Segmented';
import { LearnApp } from './LearnApp';

// Hyperion Learn's two windows: Classify (M421, models compared on data) and Machine health (M465, the owner, 23 Nov:
// "a point-and-click maintenance window"). The one in use is remembered for the visit.
type Tab = 'classify' | 'health';
const KEEP = 'uv-learn-tab';
const skeleton = <div className="h-[calc(100dvh-9rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const HealthApp = dynamic(() => import('./HealthApp').then((m) => m.HealthApp), { ssr: false, loading: () => skeleton });

export function LearnTabs() {
  const [tab, setTabNow] = useState<Tab>(() => { try { return sessionStorage.getItem(KEEP) === 'health' ? 'health' : 'classify'; } catch { return 'classify'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Tab> label="Learn" value={tab} onChange={setTab} segments={[{ value: 'classify', label: 'Classify' }, { value: 'health', label: 'Machine health' }]} />
      {tab === 'classify' ? <LearnApp /> : <HealthApp />}
    </div>
  );
}
