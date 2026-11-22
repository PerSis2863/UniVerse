'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { StructureBench } from './StructureBench';
import { HeatBench } from './HeatBench';
import { FlowBench } from './FlowBench';

// Hyperion Simulate (M404–): the kinds of engineering simulation, one workbench each (like the systems of engineering
// software): Structures (stress, bending and vibration), Heat and Fluids (a wind tunnel). The one in use is remembered for the visit.
type Kind = 'structures' | 'heat' | 'fluids';
const KEEP = 'uv-sim-kind';

export function SimulateApp() {
  const [kind, setKindNow] = useState<Kind>(() => { try { return (['heat', 'fluids'] as const).find((k) => k === sessionStorage.getItem(KEEP)) ?? 'structures'; } catch { return 'structures'; } });
  const setKind = (k: Kind) => { setKindNow(k); try { sessionStorage.setItem(KEEP, k); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Kind> label="Kind of simulation" value={kind} onChange={setKind} segments={[{ value: 'structures', label: 'Structures' }, { value: 'heat', label: 'Heat' }, { value: 'fluids', label: 'Fluids' }]} />
      {kind === 'structures' ? <StructureBench /> : kind === 'heat' ? <HeatBench /> : <FlowBench />}
    </div>
  );
}
