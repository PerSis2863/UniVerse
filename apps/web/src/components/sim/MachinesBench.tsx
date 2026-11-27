'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { ArmBench } from './ArmBench';
import { PlannerBench } from './PlannerBench';
import { SensingBench } from './SensingBench';
import { VehicleBench } from './VehicleBench';
import { DrivingBench } from './DrivingBench';
import { ScenarioBench } from './ScenarioBench';
import { EvBench } from './EvBench';
import { FlightBench } from './FlightBench';
import { OrbitBench } from './OrbitBench';
import { RailBench } from './RailBench';

// Hyperion Simulate → Machines (M482–M491): the point-and-click views of the machines and vehicles toolboxes, one
// tab each (the one in use is remembered for the visit). Their maths is the same as the language's functions.
type Tab = 'arm' | 'planner' | 'sensing' | 'vehicle' | 'driving' | 'scenario' | 'ev' | 'flight' | 'orbit' | 'rail';
const KEEP = 'uv-sim-machine';
const TABS: { value: Tab; label: string }[] = [{ value: 'arm', label: 'Robot arm' }, { value: 'planner', label: 'Path planner' }, { value: 'sensing', label: 'Sensing' }, { value: 'vehicle', label: 'Vehicle' }, { value: 'driving', label: 'Driving' }, { value: 'scenario', label: 'Scenario designer' }, { value: 'ev', label: 'Electric car' }, { value: 'flight', label: 'Aeroplane' }, { value: 'orbit', label: 'Orbit' }, { value: 'rail', label: 'Railway' }];

export function MachinesBench() {
  const [tab, setTabNow] = useState<Tab>(() => { try { return TABS.find((t) => t.value === sessionStorage.getItem(KEEP))?.value ?? 'arm'; } catch { return 'arm'; } });
  const setTab = (t: Tab) => { setTabNow(t); try { sessionStorage.setItem(KEEP, t); } catch { /* private mode */ } };
  return (
    <div className="space-y-3">
      {TABS.length > 1 && <Segmented<Tab> label="Machine" value={tab} onChange={setTab} segments={TABS} />}
      {tab === 'arm' && <ArmBench />}
      {tab === 'planner' && <PlannerBench />}
      {tab === 'sensing' && <SensingBench />}
      {tab === 'vehicle' && <VehicleBench />}
      {tab === 'driving' && <DrivingBench />}
      {tab === 'scenario' && <ScenarioBench />}
      {tab === 'ev' && <EvBench />}
      {tab === 'flight' && <FlightBench />}
      {tab === 'orbit' && <OrbitBench />}
      {tab === 'rail' && <RailBench />}
    </div>
  );
}
