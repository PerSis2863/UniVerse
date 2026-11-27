'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Segmented } from '@/components/ui/Segmented';
import { LearnApp } from './LearnApp';

// Hyperion Learn's windows: Classify (M421, models compared on data), Machine health (M465, the owner, 23 Nov:
// "a point-and-click maintenance window") and Sciences (M508: every science and industry toolbox without code).
// The one in use is remembered for the visit.
type Tab = 'classify' | 'health' | 'sciences';
const KEEP = 'uv-learn-tab';
const skeleton = <div className="h-[calc(100dvh-9rem)] min-h-[34rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const SciencesApp = dynamic(() => import('./SciencesApp').then((m) => m.SciencesApp), { ssr: false, loading: () => skeleton });
const HealthApp = dynamic(() => import('./HealthApp').then((m) => m.HealthApp), { ssr: false, loading: () => skeleton });

export function LearnTabs() {
  const [tab, setTabNow] = useState<Tab>(() => { try { const t = sessionStorage.getItem(KEEP); return t === 'health' || t === 'sciences' ? t : 'classify'; } catch { return 'classify'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Tab> label="Learn" value={tab} onChange={setTab} segments={[{ value: 'classify', label: 'Classify' }, { value: 'health', label: 'Machine health' }, { value: 'sciences', label: 'Sciences' }]} />
      {tab === 'classify' ? <LearnApp /> : tab === 'health' ? <HealthApp /> : <SciencesApp />}
    </div>
  );
}
