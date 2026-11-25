import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as mo from './robot-motion';

const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return (n: string) => [...toMat(lab.vars.get(n)!).d]; };

describe('Hyperion robot motion (M483)', () => {
  it('cubic and quintic pieces pass through the waypoints, still at each, and are smooth', () => {
    const c = mo.polyTraj([[0, 1, 0.5]], [0, 2, 4], [0, 1, 2, 3, 4], 3);
    expect(c.q[0][0]).toBeCloseTo(0, 12); expect(c.q[0][2]).toBeCloseTo(1, 12); expect(c.q[0][4]).toBeCloseTo(0.5, 12);
    expect(c.q[0][1]).toBeCloseTo(0.5, 12); // halfway in time is halfway in place for a cubic from rest to rest
    expect(c.qd[0][2]).toBeCloseTo(0, 12);
    const q = mo.polyTraj([[0, 1]], [0, 1], [0, 0.5, 1], 5);
    expect(q.q[0][1]).toBeCloseTo(0.5, 12); expect(q.qdd[0][0]).toBeCloseTo(0, 12); expect(q.qdd[0][2]).toBeCloseTo(0, 12);
    expect(q.qd[0][1]).toBeCloseTo(1.875, 12); // the quintic's peak speed: 15/8 of the average
  });
  it('a trapezoid takes d/v + v/a, a triangle 2√(d/a)', () => {
    const t = mo.trapTraj([[0, 10]], 101, 2, 1);
    expect(t.t[100]).toBeCloseTo(10 / 2 + 2 / 1, 12);
    expect(Math.max(...t.qd[0])).toBeCloseTo(2, 2);
    expect(t.q[0][100]).toBeCloseTo(10, 12);
    expect(mo.trapTraj([[0, 1]], 3, 2, 1).t[2]).toBeCloseTo(2, 12);
  });
  it('A* finds the octile-shortest way on an open map and through a maze', () => {
    const g: mo.Grid = { rows: 20, cols: 20, cells: new Uint8Array(400), res: 1 };
    const p = mo.astar(g, [0.5, 0.5], [10.5, 5.5]);
    expect(p.cost).toBeCloseTo(5 * Math.SQRT2 + 5, 9);
    const maze = mo.sampleMap('maze'), m = mo.astar(maze, [1.25, 1.25], [23.75, 23.75]);
    expect(m.path.length).toBeGreaterThan(10);
    for (let i = 1; i < m.path.length; i++) expect(mo.lineFree(maze, m.path[i - 1], m.path[i])).toBe(true);
  });
  it('RRT finds a way; RRT* keeps shortening it towards the A* length', () => {
    const g = mo.inflate(mo.sampleMap('rooms'), 0.3), s: [number, number] = [3, 3], t: [number, number] = [22, 22];
    const a = mo.astar(g, s, t), r = mo.rrt(g, s, t), rs = mo.rrt(g, s, t, { star: true, iterations: 4000 });
    expect(r.path.length).toBeGreaterThan(1); expect(rs.path.length).toBeGreaterThan(1);
    expect(rs.cost).toBeLessThanOrEqual(r.cost + 1e-9);
    expect(rs.cost).toBeLessThan(a.cost * 1.2);
    for (let i = 1; i < rs.path.length; i++) expect(mo.lineFree(g, rs.path[i - 1], rs.path[i])).toBe(true);
    expect(mo.pathLength(mo.shortcut(g, a.path))).toBeLessThanOrEqual(a.cost + 1e-9);
  });
  it('a differential drive goes round a circle exactly, and pure pursuit follows an L to its end', () => {
    let p: mo.Pose = [0, 0, 0];
    for (let k = 0; k < 100; k++) p = mo.driveStep(p, 1, (2 * Math.PI) / 10, 0.1);
    expect(Math.hypot(p[0], p[1])).toBeLessThan(1e-9);
    const r = mo.followPath([[0, 0], [5, 0], [5, 5]], { speed: 1 });
    expect(r.reached).toBe(true);
    // It cuts the corner by about the look-ahead (0.8 m), no more.
    expect(Math.min(...r.poses.map((q) => Math.hypot(q[0] - 5, q[1])))).toBeLessThan(1);
  });
  it('in the language', () => {
    const d = run("[q, qd] = cubicpolytraj([0 1; 0 2], [0 1], [0 0.5 1]); [Q, ~, ~, t] = trapveltraj([0 1 0], 50); [m, res] = robotMap('warehouse'); [p, info] = astarGrid(m, [2 2], [23 23], 'Resolution', res); [p2, i2] = rrtPlan(m, [2 2], [23 23], 'Resolution', res); s = shortenPath(p, m, res); [P, T] = followPath(s, 'Speed', 1); n = size(P, 1); c = info.Cost; f = i2.Found; m2 = inflateMap(m, 0.5, res); z = nnz(m2) - nnz(m);");
    expect(d('q')).toEqual([0, 0, 0.5, 1, 1, 2]);
    expect(d('t')[49]).toBeCloseTo(2, 12);
    expect(d('c')[0]).toBeGreaterThan(29); expect(d('f')).toEqual([1]);
    expect(d('n')[0]).toBeGreaterThan(100); expect(d('z')[0]).toBeGreaterThan(0);
  });
});
