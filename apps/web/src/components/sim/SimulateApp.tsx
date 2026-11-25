'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { StructureBench } from './StructureBench';
import { HeatBench } from './HeatBench';
import { FlowBench } from './FlowBench';
import { CircuitBench } from './CircuitBench';
import { BlocksBench } from './BlocksBench';
import { QueuesBench } from './QueuesBench';

// Hyperion Simulate (M404–): the kinds of engineering simulation, one workbench each (like the systems of engineering
// software): Structures (stress, bending and vibration), Heat, Fluids (a wind tunnel), Circuits and Blocks (M415:
// block diagrams, model-based design) and Queues (M479: discrete-event simulation). The one in use is remembered for the visit.
type Kind = 'structures' | 'heat' | 'fluids' | 'circuits' | 'blocks' | 'queues';
const KEEP = 'uv-sim-kind';

export function SimulateApp() {
  const [kind, setKindNow] = useState<Kind>(() => { try { return (['heat', 'fluids', 'circuits', 'blocks', 'queues'] as const).find((k) => k === sessionStorage.getItem(KEEP)) ?? 'structures'; } catch { return 'structures'; } });
  const setKind = (k: Kind) => { setKindNow(k); try { sessionStorage.setItem(KEEP, k); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Kind> label="Kind of simulation" value={kind} onChange={setKind} segments={[{ value: 'structures', label: 'Structures' }, { value: 'heat', label: 'Heat' }, { value: 'fluids', label: 'Fluids' }, { value: 'circuits', label: 'Circuits' }, { value: 'blocks', label: 'Blocks' }, { value: 'queues', label: 'Queues' }]} />
      {kind === 'structures' ? <StructureBench /> : kind === 'heat' ? <HeatBench /> : kind === 'fluids' ? <FlowBench /> : kind === 'circuits' ? <CircuitBench /> : kind === 'queues' ? <QueuesBench /> : <BlocksBench />}
    </div>
  );
}
