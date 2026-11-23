/// <reference lib="webworker" />
import { astar, followPath, inflate, rrt, shortcut, type Grid, type Plan, type Pose } from '@/lib/lab/robot-motion';

// Hyperion Simulate → Machines (M483–): the heavier jobs off the page's thread. Planning: the map grown by the robot's
// radius, then A*, RRT or RRT*, the corners cut, and the drive along it by pure pursuit.

export type Method = 'astar' | 'rrt' | 'rrtstar';
export type ToMachines = { id: number; plan: { grid: Grid; start: [number, number]; goal: [number, number]; method: Method; radius: number; look: number; speed: number } };
export interface FromMachines { id: number; plan: Plan; smooth: [number, number][]; inflated: Uint8Array; drive: Pose[]; ms: number }

self.onmessage = (e: MessageEvent<ToMachines>) => {
  const t0 = performance.now();
  const { id, plan: p } = e.data;
  const g = inflate(p.grid, p.radius);
  const plan = p.method === 'astar' ? astar(g, p.start, p.goal) : rrt(g, p.start, p.goal, { star: p.method === 'rrtstar', iterations: p.method === 'rrtstar' ? 4000 : 3000 });
  const smooth = plan.path.length ? shortcut(g, plan.path) : [];
  const drive = smooth.length > 1 ? followPath(smooth, { look: p.look, speed: p.speed, dt: 0.05 }).poses : [];
  // The explored cells are big; only the drawing needs them, as one byte each.
  (self as unknown as Worker).postMessage({ id, plan: { ...plan, visited: plan.visited }, smooth, inflated: g.cells, drive, ms: performance.now() - t0 } satisfies FromMachines);
};
