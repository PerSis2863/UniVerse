'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { ArmBench } from './ArmBench';
import { PlannerBench } from './PlannerBench';

// Hyperion Simulate → Machines (M482–M491): the point-and-click views of the machines and vehicles toolboxes, one
// tab each (the one in use is remembered for the visit). Their maths is the same as the language's functions.
type Tab = 'arm' | 'planner';
const KEEP = 'uv-sim-machine';
const TABS: { value: Tab; label: string }[] = [{ value: 'arm', label: 'Robot arm' }, { value: 'planner', label: 'Path planner' }];

export function MachinesBench() {
  const [tab, setTabNow] = useState<Tab>(() => { try { return TABS.find((t) => t.value === sessionStorage.getItem(KEEP))?.value ?? 'arm'; } catch { return 'arm'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      {TABS.length > 1 && <Segmented<Tab> label="Machine" value={tab} onChange={setTab} segments={TABS} />}
      {tab === 'arm' && <ArmBench />}
      {tab === 'planner' && <PlannerBench />}
    </div>
  );
}
