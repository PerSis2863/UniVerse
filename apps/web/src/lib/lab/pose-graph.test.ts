import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as pg from './pose-graph';
import * as mo from './robot-motion';
import * as se from './robot-sense';

describe('Hyperion loop closure and pose graphs (M484b)', () => {
  it('one loop-closing edge pulls a drifting square back into shape', () => {
    const truth: pg.Pose[] = [[0, 0, 0]];
    for (let k = 1; k <= 40; k++) truth.push(pg.compose(truth[k - 1], [1, 0, k % 10 === 0 ? Math.PI / 2 : 0]));
    let seed = 2;
    const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const edges: pg.Edge[] = [], est: pg.Pose[] = [truth[0]];
    for (let k = 1; k <= 40; k++) {
      const z = pg.relative(truth[k - 1], truth[k]), zn: pg.Pose = [z[0] + 0.02 * r(), z[1] + 0.02 * r(), z[2] + 0.01 + 0.01 * r()];
      edges.push({ i: k - 1, j: k, z: zn, info: [2500, 2500, 10000] }); est.push(pg.compose(est[k - 1], zn));
    }
    const worst = (P: pg.Pose[]) => Math.max(...P.map((p, k) => Math.hypot(p[0] - truth[k][0], p[1] - truth[k][1])));
    expect(worst(est)).toBeGreaterThan(2);
    edges.push({ i: 0, j: 40, z: pg.relative(truth[0], truth[40]), info: [2500, 2500, 10000] });
    expect(worst(pg.optimise(est, edges))).toBeLessThan(0.2);
    // Edges that already agree leave the poses where they are.
    expect(worst(pg.optimise(truth, edges.slice(0, 40).map((e, k) => ({ ...e, z: pg.relative(truth[k], truth[k + 1]) }))))).toBeLessThan(1e-9);
  });
  it('a wrong loop closure marked robust is weighed down instead of bending the square (M484c)', () => {
    const truth: pg.Pose[] = [[0, 0, 0]];
    for (let k = 1; k <= 40; k++) truth.push(pg.compose(truth[k - 1], [1, 0, k % 10 === 0 ? Math.PI / 2 : 0]));
    let seed = 2;
    const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5);
    const edges: pg.Edge[] = [], est: pg.Pose[] = [truth[0]];
    for (let k = 1; k <= 40; k++) {
      const z = pg.relative(truth[k - 1], truth[k]), zn: pg.Pose = [z[0] + 0.02 * r(), z[1] + 0.02 * r(), z[2] + 0.01 + 0.01 * r()];
      edges.push({ i: k - 1, j: k, z: zn, info: [2500, 2500, 10000] }); est.push(pg.compose(est[k - 1], zn));
    }
    const worst = (P: pg.Pose[]) => Math.max(...P.map((p, k) => Math.hypot(p[0] - truth[k][0], p[1] - truth[k][1])));
    const good: pg.Edge = { i: 0, j: 40, z: pg.relative(truth[0], truth[40]), info: [150, 150, 2500], robust: true };
    // A wrong match: pose 25 "recognised" as the place of pose 5, metres away across the square.
    const bad: pg.Edge = { i: 5, j: 25, z: [0, 0, 0], info: [150, 150, 2500], robust: true };
    const plain = pg.optimise(est, [...edges, { ...good, robust: false }, { ...bad, robust: false }]);
    const robust = pg.optimise(est, [...edges, good, bad], { phi: 10 });
    expect(worst(plain)).toBeGreaterThan(0.8);
    expect(worst(robust)).toBeLessThan(0.3);
    const w = pg.dcsWeights(robust, [good, bad], 10);
    expect(w[0]).toBeGreaterThan(0.5); expect(w[1]).toBeLessThan(0.05);
  });
  it('a robot follows a path that crosses itself in order (pure pursuit looks ahead only)', () => {
    const m = mo.sampleMap('rooms'), safe = mo.inflate(m, 0.7), wp: [number, number][] = [[4, 5], [12, 7], [13, 20], [5, 17], [4, 5], [12, 7]];
    let path: [number, number][] = [];
    for (let i = 1; i < wp.length; i++) { const leg = mo.shortcut(safe, mo.astar(safe, wp[i - 1], wp[i]).path); path = path.concat(i > 1 ? leg.slice(1) : leg); }
    const r = mo.followPath(path, { speed: 0.8, look: 0.5 });
    expect(r.reached).toBe(true);
    expect(r.t.at(-1)!).toBeLessThan(80);
  });
  it('SLAM round a loop: closing it cuts the average error', { timeout: 120_000 }, () => {
    const m = mo.sampleMap('rooms'), safe = mo.inflate(m, 0.7), wp: [number, number][] = [[4, 5], [12, 7], [13, 20], [5, 17], [4, 5], [12, 7]];
    let path: [number, number][] = [];
    for (let i = 1; i < wp.length; i++) { const leg = mo.shortcut(safe, mo.astar(safe, wp[i - 1], wp[i]).path); path = path.concat(i > 1 ? leg.slice(1) : leg); }
    let open = 0, closed = 0, closures = 0;
    for (const seed of [4, 6, 8, 12]) {
      const run = se.simulateRun(m, path, { odomNoise: 0.15, seed });
      const mean = (P: mo.Pose[]) => P.reduce((s, p, k) => s + Math.hypot(p[0] - run.truth[k][0], p[1] - run.truth[k][1]), 0) / P.length;
      open += mean(se.slam(run.scans, run.odom, run.angles, 4, run.maxRange, { recent: 10, loopClosure: false }).poses);
      const b = se.slam(run.scans, run.odom, run.angles, 4, run.maxRange, { recent: 10 });
      closed += mean(b.poses); closures += b.closures.length;
    }
    expect(closures).toBeGreaterThan(8);
    expect(closed).toBeLessThan(open * 0.85);
  });
  it('in the language: optimizePoseGraph', () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run('P = [0 0 0; 1.1 0 0; 2.2 0 0]; E = [1 2 1 0 0 100 100 1000; 2 3 1 0 0 100 100 1000; 1 3 2 0 0 1000 1000 1000]; Q = optimizePoseGraph(P, E);');
    const Q = [...toMat(lab.vars.get('Q')!).d];
    expect(Q[2]).toBeCloseTo(2, 2); expect(Q[1]).toBeCloseTo(1, 2);
    lab.run("E2 = [E; 1 3 5 0 0 1000 1000 1000]; [R, w] = optimizePoseGraph(P, E2, 'Robust', true, 'Phi', 1);");
    const w = [...toMat(lab.vars.get('w')!).d];
    expect(w.slice(0, 2)).toEqual([1, 1]); expect(w[2]).toBeGreaterThan(0.3); expect(w[3]).toBeLessThan(0.01);
  });
});
