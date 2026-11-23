'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { StructureBench } from './StructureBench';
import { HeatBench } from './HeatBench';
import { FlowBench } from './FlowBench';
import { CircuitBench } from './CircuitBench';
import { BlocksBench } from './BlocksBench';
import { MachinesBench } from './MachinesBench';

// Hyperion Simulate (M404–): the kinds of engineering simulation, one workbench each (like the systems of engineering
// software): Structures (stress, bending and vibration), Heat, Fluids (a wind tunnel), Circuits and Blocks (M415:
// block diagrams, model-based design) and Machines (M482–: robots and vehicles). The one in use is remembered for the visit.
type Kind = 'structures' | 'heat' | 'fluids' | 'circuits' | 'blocks' | 'machines';
const KEEP = 'uv-sim-kind';

export function SimulateApp() {
  const [kind, setKindNow] = useState<Kind>(() => { try { return (['heat', 'fluids', 'circuits', 'blocks', 'machines'] as const).find((k) => k === sessionStorage.getItem(KEEP)) ?? 'structures'; } catch { return 'structures'; } });
  const setKind = (k: Kind) => { setKindNow(k); try { sessionStorage.setItem(KEEP, k); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Kind> label="Kind of simulation" value={kind} onChange={setKind} segments={[{ value: 'structures', label: 'Structures' }, { value: 'heat', label: 'Heat' }, { value: 'fluids', label: 'Fluids' }, { value: 'circuits', label: 'Circuits' }, { value: 'blocks', label: 'Blocks' }, { value: 'machines', label: 'Machines' }]} />
      {kind === 'structures' ? <StructureBench /> : kind === 'heat' ? <HeatBench /> : kind === 'fluids' ? <FlowBench /> : kind === 'circuits' ? <CircuitBench /> : kind === 'machines' ? <MachinesBench /> : <BlocksBench />}
    </div>
  );
}
