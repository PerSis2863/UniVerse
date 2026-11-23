import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './plot3d';
import './machines-lab';
import * as mo from './robot-motion';
import * as se from './robot-sense';

const err = (a: mo.Pose, b: mo.Pose) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('Hyperion robot sensing (M484)', () => {
  const rooms = mo.sampleMap('rooms'), safe = mo.inflate(rooms, 0.7), path = mo.shortcut(safe, mo.astar(safe, [3, 3], [22, 22]).path);
  it('a lidar beam stops at the first wall, exactly', () => {
    const g: mo.Grid = { rows: 20, cols: 20, cells: new Uint8Array(400), res: 2 };
    for (let r = 0; r < 20; r++) g.cells[r * 20 + 15] = 1; // a wall at x = 7.5 m
    expect(se.castRay(g, 2, 5, 0, 20)).toBeCloseTo(5.5, 12);
    expect(se.castRay(g, 2, 2, Math.PI / 4, 20)).toBeCloseTo(5.5 * Math.SQRT2, 9);
    expect(se.castRay(g, 2, 5, Math.PI, 20)).toBeCloseTo(2, 12); // the map's edge counts as a wall
    const D = se.distanceField(g);
    expect(D[5 * 20 + 10]).toBeCloseTo(2.5, 9); // 5 cells from the wall
  });
  it('Monte Carlo localisation follows the robot better than its odometry, and finds it from nowhere', { timeout: 60_000 }, () => {
    const run = se.simulateRun(rooms, path, { odomNoise: 0.08 });
    const track = se.mcl(rooms, run.odom, run.scans, run.angles, { start: run.truth[0] });
    const n = run.truth.length - 1;
    expect(err(track[n].pose, run.truth[n])).toBeLessThan(0.3);
    expect(err(run.odom[n], run.truth[n])).toBeGreaterThan(err(track[n].pose, run.truth[n]));
    const lost = se.mcl(rooms, run.odom, run.scans, run.angles);
    expect(err(lost[n].pose, run.truth[n])).toBeLessThan(0.5);
    expect(lost[0].spread).toBeGreaterThan(3);
    expect(lost[n].spread).toBeLessThan(0.5);
  });
  it('SLAM keeps the poses closer than the odometry, and its map has the walls', () => {
    const run = se.simulateRun(rooms, path, { odomNoise: 0.08, seed: 8 });
    const s = se.slam(run.scans, run.odom, run.angles, 4, run.maxRange);
    const n = run.truth.length - 1, meanErr = (P: mo.Pose[]) => P.reduce((a, p, k) => a + err(p, run.truth[k]), 0) / P.length;
    expect(meanErr(s.poses)).toBeLessThan(meanErr(run.odom) * 0.8);
    expect(err(s.poses[n], run.truth[n])).toBeLessThan(err(run.odom[n], run.truth[n]) * 0.7);
    const P = se.probability(s.map), known = [...P].filter((p) => p > 0.7).length;
    expect(known).toBeGreaterThan(100);
  });
  it('in the language', { timeout: 60_000 }, () => {
    const lab = new Lab({ out: () => {}, graphics: new Graphics() });
    lab.run("[map, res] = robotMap('rooms'); [r, ang] = lidarSim(map, [4 17 0], 'Resolution', res, 'Beams', 4); safe = inflateMap(map, 0.7, res); p = shortenPath(astarGrid(safe, [3 3], [22 22], 'Resolution', res), safe, res); run = robotRun(map, p, 'Resolution', res); [est, info] = mclLocalize(map, run, 'Resolution', res, 'Start', run.True(1, :)); e = norm(est(end, 1:2) - run.True(end, 1:2)); [M, P, o] = slamGrid(run); B = buildMap(run.Scans, run.True, run.Angles, 4, 8);");
    const d = (n: string) => [...toMat(lab.vars.get(n)!).d];
    expect(d('ang')).toEqual([-Math.PI, -Math.PI / 2, 0, Math.PI / 2]);
    expect(d('r')[2]).toBeCloseTo(4.5, 9); // a wall at x = 8.5 m (column 17)
    expect(d('e')[0]).toBeLessThan(0.3);
    expect(toMat(lab.vars.get('M')!).r).toBeGreaterThan(50);
    expect(Math.max(...d('B'))).toBeGreaterThan(0.9);
  });
});
