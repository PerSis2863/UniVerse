'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import dynamic from 'next/dynamic';
import { FilterDesigner } from './FilterDesigner';

// Hyperion Signals' windows (M472–): the Filter designer, Audio (M473), Devices (M474), IoT (M475). The one in use is remembered for the visit.
type Tab = 'filters' | 'audio' | 'devices' | 'iot';
const KEEP = 'uv-signals-tab';
const TABS: { value: Tab; label: string }[] = [{ value: 'filters', label: 'Filter designer' }, { value: 'audio', label: 'Audio' }, { value: 'devices', label: 'Devices' }, { value: 'iot', label: 'IoT' }];
const skeleton = <div className="h-[calc(100dvh-12rem)] min-h-[32rem] rounded-[var(--radius-card)] skeleton" aria-busy="true" />;
const SerialBench = dynamic(() => import('./SerialBench').then((m) => m.SerialBench), { ssr: false, loading: () => skeleton });
const IotBench = dynamic(() => import('./IotBench').then((m) => m.IotBench), { ssr: false, loading: () => skeleton });
const AudioBench = dynamic(() => import('./AudioBench').then((m) => m.AudioBench), { ssr: false, loading: () => skeleton });

export function SignalsTabs() {
  const [tab, setTabNow] = useState<Tab>(() => { try { const v = sessionStorage.getItem(KEEP); return TABS.some((t) => t.value === v) ? (v as Tab) : 'filters'; } catch { return 'filters'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Tab> label="Signals" value={tab} onChange={setTab} segments={TABS} />
      {tab === 'filters' && <FilterDesigner />}
      {tab === 'audio' && <AudioBench />}
      {tab === 'devices' && <SerialBench />}
      {tab === 'iot' && <IotBench />}
    </div>
  );
}
