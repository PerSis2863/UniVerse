'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { StructureBench } from './StructureBench';
import { HeatBench } from './HeatBench';
import { FlowBench } from './FlowBench';
import { FieldsBench } from './FieldsBench';
import { SoundBench } from './SoundBench';
import { FileBench } from './FileBench';
import { CircuitBench } from './CircuitBench';
import { BlocksBench } from './BlocksBench';
import { MachinesBench } from './MachinesBench';
import { QueuesBench } from './QueuesBench';

// Hyperion Simulate (M404–): the kinds of engineering simulation, one workbench each (like the systems of engineering
// software): Structures (stress, bending and vibration), Heat, Fluids (a wind tunnel), Fields (M548: electromagnetics), Sound (M551: acoustics), 3D file (M552: STL parts), Circuits and Blocks (M415:
// block diagrams, model-based design), Queues (M479: discrete-event simulation) and Machines (M482–: robots and vehicles). The one in use is remembered for the visit.
type Kind = 'structures' | 'file' | 'heat' | 'fluids' | 'fields' | 'sound' | 'circuits' | 'blocks' | 'queues' | 'machines';
const KEEP = 'uv-sim-kind';

export function SimulateApp() {
  const [kind, setKindNow] = useState<Kind>(() => { try { return (['file', 'heat', 'fluids', 'fields', 'sound', 'circuits', 'blocks', 'queues', 'machines'] as const).find((k) => k === sessionStorage.getItem(KEEP)) ?? 'structures'; } catch { return 'structures'; } });
  const setKind = (k: Kind) => { setKindNow(k); try { sessionStorage.setItem(KEEP, k); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      <Segmented<Kind> label="Kind of simulation" value={kind} onChange={setKind} segments={[{ value: 'structures', label: 'Structures' }, { value: 'file', label: '3D file' }, { value: 'heat', label: 'Heat' }, { value: 'fluids', label: 'Fluids' }, { value: 'fields', label: 'Fields' }, { value: 'sound', label: 'Sound' }, { value: 'circuits', label: 'Circuits' }, { value: 'blocks', label: 'Blocks' }, { value: 'queues', label: 'Queues' }, { value: 'machines', label: 'Machines' }]} />
      {kind === 'structures' ? <StructureBench /> : kind === 'file' ? <FileBench /> : kind === 'heat' ? <HeatBench /> : kind === 'fluids' ? <FlowBench /> : kind === 'fields' ? <FieldsBench /> : kind === 'sound' ? <SoundBench /> : kind === 'circuits' ? <CircuitBench /> : kind === 'queues' ? <QueuesBench /> : kind === 'machines' ? <MachinesBench /> : <BlocksBench />}
    </div>
  );
}
