/// <reference lib="webworker" />
import { astar, followPath, inflate, rrt, sampleMap, shortcut, type Grid, type Plan, type Pose } from '@/lib/lab/robot-motion';
import { mcl, simulateRun, slam } from '@/lib/lab/robot-sense';

// Hyperion Simulate → Machines (M483–): the heavier jobs off the page's thread. Planning: the map grown by the robot's
// radius, then A*, RRT or RRT*, the corners cut, and the drive along it by pure pursuit. Sensing (M484): a run across a
// map, Monte Carlo localisation from nowhere and SLAM, with what each step looked like for the replay.

export type Method = 'astar' | 'rrt' | 'rrtstar';
export interface SenseOut { id: number; sense: true; map: Grid; truth: Pose[]; odom: Pose[]; est: Pose[]; spread: number[]; particles: Float32Array[]; scans: number[][]; angles: number[]; maxR: number; slamPoses: Pose[]; snaps: { k: number; p: Uint8Array }[]; slamMap: { rows: number; cols: number; res: number; x0: number; y0: number }; ms: number }
export type ToMachines = { id: number; sense: { map: 'rooms' | 'warehouse'; particles: number; odomNoise: number; seed: number } } | { id: number; plan: { grid: Grid; start: [number, number]; goal: [number, number]; method: Method; radius: number; look: number; speed: number } };
export interface FromMachines { id: number; plan: Plan; smooth: [number, number][]; inflated: Uint8Array; drive: Pose[]; ms: number }

self.onmessage = (e: MessageEvent<ToMachines>) => {
  const t0 = performance.now();
  if ('sense' in e.data) {
    const { id, sense: o } = e.data, g = sampleMap(o.map), safe = inflate(g, 0.7);
    const path = shortcut(safe, (o.map === 'rooms' ? astar(safe, [3, 3], [22, 22]) : astar(safe, [2, 2], [23, 23])).path);
    const run = simulateRun(g, path, { odomNoise: o.odomNoise, seed: o.seed });
    const steps = mcl(g, run.odom, run.scans, run.angles, { particles: o.particles, seed: o.seed + 5 });
    const sl = slam(run.scans, run.odom, run.angles, 4, run.maxRange, { snapshots: 40 });
    // At most 800 particles a step go back for drawing.
    const every = Math.max(1, Math.ceil(o.particles / 800));
    const particles = steps.map((s) => { const n = Math.ceil(o.particles / every), out = new Float32Array(n * 3); for (let i = 0; i < n; i++) out.set(s.particles.subarray(i * every * 3, i * every * 3 + 3), i * 3); return out; });
    const snaps = sl.snaps.map((x) => ({ k: x.k, p: Uint8Array.from(x.p, (v) => Math.round(v * 255)) }));
    const { rows, cols, res, x0, y0 } = sl.map;
    (self as unknown as Worker).postMessage({ id, sense: true, map: g, truth: run.truth, odom: run.odom, est: steps.map((s) => s.pose), spread: steps.map((s) => s.spread), particles, scans: run.scans, angles: run.angles, maxR: run.maxRange, slamPoses: sl.poses, snaps, slamMap: { rows, cols, res, x0, y0 }, ms: performance.now() - t0 } satisfies SenseOut);
    return;
  }
  const { id, plan: p } = e.data;
  const g = inflate(p.grid, p.radius);
  const plan = p.method === 'astar' ? astar(g, p.start, p.goal) : rrt(g, p.start, p.goal, { star: p.method === 'rrtstar', iterations: p.method === 'rrtstar' ? 4000 : 3000 });
  const smooth = plan.path.length ? shortcut(g, plan.path) : [];
  const drive = smooth.length > 1 ? followPath(smooth, { look: p.look, speed: p.speed, dt: 0.05 }).poses : [];
  // The explored cells are big; only the drawing needs them, as one byte each.
  (self as unknown as Worker).postMessage({ id, plan: { ...plan, visited: plan.visited }, smooth, inflated: g.cells, drive, ms: performance.now() - t0 } satisfies FromMachines);
};
