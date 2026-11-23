'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { FilterDesigner } from './FilterDesigner';

// Hyperion Signals' windows (M472–): the Filter designer. The one in use is remembered for the visit.
type Tab = 'filters';
const KEEP = 'uv-signals-tab';
const TABS: { value: Tab; label: string }[] = [{ value: 'filters', label: 'Filter designer' }];

export function SignalsTabs() {
  const [tab, setTabNow] = useState<Tab>(() => { try { const v = sessionStorage.getItem(KEEP); return TABS.some((t) => t.value === v) ? (v as Tab) : 'filters'; } catch { return 'filters'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Tab> label="Signals" value={tab} onChange={setTab} segments={TABS} />
      {tab === 'filters' && <FilterDesigner />}
    </div>
  );
}
